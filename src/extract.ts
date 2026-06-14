import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { argv, cwd, exit, stderr } from "node:process";

import { resolveDocGenDb } from "./cli-options.js";

const DEFAULT_LOCAL_ROOT = "Main";
const DEFAULT_PROJECT_NAME = "Lean Project";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type SqlValue = null | number | string;
type SqlRow = Record<string, SqlValue>;

export interface SourceLocationLike {
  sourcePath: string;
  line: number;
}

export interface SourceMatch {
  startLine: number;
  endLine: number;
  source: string;
}

export interface ModuleSummary {
  name: string;
  sourcePath: string;
  editorLink?: string;
  sourceUrl?: string;
  group?: string;
}

export interface DeclarationSummary {
  name: string;
  shortName?: string;
  kind: string;
  module: string;
  signatureText?: string;
}

export interface RelatedGroup {
  id: string;
  title: string;
  count: number;
  allModulesCount: number;
  declarations: string[];
}

export interface NamespaceDoc {
  namespace: string;
  line: number;
  placement: "before" | "after";
  kind: "doc" | "comment";
  text: string;
}

export function moduleNameToRelativePath(moduleName: string): string {
  return `${moduleName.replaceAll(".", "/")}.lean`;
}

export function shortName(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? name : name.slice(index + 1);
}

export function namespaceName(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(0, index);
}

export function formatSourceLocation(declaration: SourceLocationLike): string {
  return `${declaration.sourcePath}:${declaration.line}`;
}

export function isLocalModule(moduleName: string, localRoot = DEFAULT_LOCAL_ROOT): boolean {
  return moduleName === localRoot || moduleName.startsWith(`${localRoot}.`);
}

export function displayGroup(moduleName: string): string {
  if (moduleName.includes(".GroundTypeNormalization")) return "proof";
  if (moduleName.split(".").length - 1 <= 1) return "api";
  return "support";
}

function declarationKind(row: SqlRow): string {
  return typeof row.kind === "string" && row.kind ? row.kind : "declaration";
}

export function markdownToText(markdown: string | null | undefined): string {
  if (!markdown) return "";
  return markdown.replace(/`([^`]+)`/g, "$1").replace(/\s+/g, " ").trim();
}

function cleanModuleDocBlock(block: string): string {
  const lines = block.split(/\r?\n/);
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.map((line) => line.replace(/\s+$/g, "")).join("\n").trim();
}

function splitLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized) return [];
  return normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n")
    : normalized.split("\n");
}

export function readModuleLines(repoRoot: string, moduleName: string): string[] {
  const source = join(repoRoot, moduleNameToRelativePath(moduleName));
  if (!existsSync(source)) return [];
  return splitLines(readFileSync(source, "utf8"));
}

export function readSourceDocs(repoRoot: string, moduleName: string): { moduleDocMarkdown: string } {
  const lines = readModuleLines(repoRoot, moduleName);
  const moduleDocs: string[] = [];
  const namespaceStack: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const stripped = lines[index].trim();
    const namespaceMatch = /^namespace\s+([A-Za-z0-9_'.]+)\s*$/.exec(stripped);
    if (namespaceMatch) {
      namespaceStack.push(...namespaceMatch[1].split("."));
      index += 1;
      continue;
    }

    if (/^end(?:\s+[A-Za-z0-9_'.]+)?\s*$/.test(stripped)) {
      if (namespaceStack.length) namespaceStack.pop();
      index += 1;
      continue;
    }

    if (stripped.includes("/-!")) {
      const docLines: string[] = [];
      const [, after] = lines[index].split("/-!", 2);
      if (after.includes("-/")) {
        docLines.push(after.split("-/", 1)[0]);
      } else {
        docLines.push(after);
        index += 1;
        while (index < lines.length) {
          const line = lines[index];
          if (line.includes("-/")) {
            docLines.push(line.split("-/", 1)[0]);
            break;
          }
          docLines.push(line);
          index += 1;
        }
      }
      const doc = cleanModuleDocBlock(docLines.join("\n"));
      if (doc && namespaceStack.length === 0) moduleDocs.push(doc);
    }
    index += 1;
  }

  return { moduleDocMarkdown: moduleDocs.join("\n\n") };
}

function readDocCommentForward(lines: string[], index: number): { text: string; endIndex: number } | null {
  if (!lines[index]?.trim().startsWith("/--")) return null;
  const docLines: string[] = [];
  const [, after] = lines[index].split("/--", 2);
  if (after.includes("-/")) {
    return { text: cleanModuleDocBlock(after.split("-/", 1)[0]), endIndex: index };
  }

  docLines.push(after);
  let cursor = index + 1;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line.includes("-/")) {
      docLines.push(line.split("-/", 1)[0]);
      break;
    }
    docLines.push(line);
    cursor += 1;
  }
  return { text: cleanModuleDocBlock(docLines.join("\n")), endIndex: cursor };
}

function readLineCommentForward(lines: string[], index: number): { text: string; endIndex: number } | null {
  if (!lines[index]?.trim().startsWith("--")) return null;
  const commentLines: string[] = [];
  let cursor = index;
  while (cursor < lines.length) {
    const stripped = lines[cursor].trim();
    if (!stripped.startsWith("--") || stripped.startsWith("/-")) break;
    commentLines.push(stripped.slice(2).trim());
    cursor += 1;
  }
  return { text: commentLines.join("\n").trim(), endIndex: cursor - 1 };
}

function readCommentForward(
  lines: string[],
  index: number,
): { kind: "doc" | "comment"; text: string; startIndex: number; endIndex: number } | null {
  const lineComment = readLineCommentForward(lines, index);
  if (lineComment) return { kind: "comment", startIndex: index, ...lineComment };
  const docComment = readDocCommentForward(lines, index);
  if (docComment) return { kind: "doc", startIndex: index, ...docComment };
  return null;
}

function readCommentBackward(
  lines: string[],
  index: number,
): { kind: "doc" | "comment"; text: string; startIndex: number; endIndex: number } | null {
  const stripped = lines[index]?.trim() || "";
  if (stripped.startsWith("--")) {
    const commentLines: string[] = [];
    let cursor = index;
    while (cursor >= 0) {
      const line = lines[cursor].trim();
      if (!line.startsWith("--") || line.startsWith("/-")) break;
      commentLines.push(line.slice(2).trim());
      cursor -= 1;
    }
    return {
      kind: "comment",
      text: commentLines.reverse().join("\n").trim(),
      startIndex: cursor + 1,
      endIndex: index,
    };
  }

  if (!stripped.includes("-/")) return null;
  let cursor = index;
  while (cursor >= 0 && !lines[cursor].includes("/--")) cursor -= 1;
  if (cursor < 0) return null;
  const forward = readDocCommentForward(lines, cursor);
  if (!forward || forward.endIndex !== index) return null;
  return {
    kind: "doc",
    text: forward.text,
    startIndex: cursor,
    endIndex: index,
  };
}

function namespaceNameFromStack(stack: string[], namespaceName: string): string {
  return [...stack, ...namespaceName.split(".")].join(".");
}

export function readNamespaceDocs(repoRoot: string, moduleName: string): NamespaceDoc[] {
  const lines = readModuleLines(repoRoot, moduleName);
  const docs: NamespaceDoc[] = [];
  const namespaceStack: string[] = [];
  const namespaceFrameLengths: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const stripped = lines[index].trim();
    const namespaceMatch = /^namespace\s+([A-Za-z0-9_'.]+)\s*$/.exec(stripped);
    if (namespaceMatch) {
      const namespace = namespaceNameFromStack(namespaceStack, namespaceMatch[1]);
      const beforeBlocks: Array<ReturnType<typeof readCommentBackward> & {}> = [];
      let beforeIndex = index - 1;
      while (beforeIndex >= 0) {
        const block = readCommentBackward(lines, beforeIndex);
        if (!block) break;
        beforeBlocks.push(block);
        beforeIndex = block.startIndex - 1;
      }
      beforeBlocks.reverse().forEach((block) => {
        if (block?.text) {
          docs.push({
            namespace,
            line: index + 1,
            placement: "before",
            kind: block.kind,
            text: block.text,
          });
        }
      });

      let afterIndex = index + 1;
      while (afterIndex < lines.length) {
        const block = readCommentForward(lines, afterIndex);
        if (!block) break;
        if (block.text) {
          docs.push({
            namespace,
            line: index + 1,
            placement: "after",
            kind: block.kind,
            text: block.text,
          });
        }
        afterIndex = block.endIndex + 1;
      }

      const frameLength = namespaceMatch[1].split(".").length;
      namespaceStack.push(...namespaceMatch[1].split("."));
      namespaceFrameLengths.push(frameLength);
      continue;
    }

    if (/^end(?:\s+[A-Za-z0-9_'.]+)?\s*$/.test(stripped)) {
      const frameLength = namespaceFrameLengths.pop() || 0;
      namespaceStack.splice(namespaceStack.length - frameLength, frameLength);
    }
  }

  return docs;
}

export function readSourceDocstring(
  repoRoot: string,
  moduleName: string,
  startLine: number | null | undefined,
): string {
  if (startLine == null || startLine <= 1) return "";
  const lines = readModuleLines(repoRoot, moduleName);
  let index = Math.min(startLine - 2, lines.length - 1);
  while (index >= 0 && !lines[index].trim()) index -= 1;
  if (index < 0 || !lines[index].includes("-/")) return "";

  const docLines: string[] = [];
  while (index >= 0) {
    const line = lines[index];
    docLines.push(line);
    if (line.includes("/--")) break;
    index -= 1;
  }
  if (index < 0) return "";

  const block = docLines.reverse().join("\n");
  if (!block.includes("/--") || !block.includes("-/")) return "";
  return cleanModuleDocBlock(block.split("/--", 2)[1].split("-/").slice(0, -1).join("-/"));
}

export function readSourceBlock(
  repoRoot: string,
  moduleName: string,
  startLine: number | null | undefined,
  endLine: number | null | undefined,
): string {
  if (startLine == null || startLine < 1) return "";
  const lines = readModuleLines(repoRoot, moduleName);
  const index = startLine - 1;
  if (index >= lines.length) return "";
  const lastLine = endLine != null && endLine >= startLine ? endLine : startLine;
  return lines.slice(index, lastLine).map((line) => line.replace(/\s+$/g, "")).join("\n").trim();
}

export function readLeadingLineComment(
  repoRoot: string,
  moduleName: string,
  startLine: number | null | undefined,
): string {
  if (startLine == null || startLine <= 1) return "";
  const lines = readModuleLines(repoRoot, moduleName);
  let index = Math.min(startLine - 2, lines.length - 1);
  const collected: string[] = [];
  while (index >= 0) {
    const stripped = lines[index].trim();
    if (!stripped) {
      if (collected.length) break;
      index -= 1;
      continue;
    }
    if (!stripped.startsWith("--") || stripped.startsWith("/-")) break;
    collected.push(stripped.slice(2).trim());
    index -= 1;
  }
  return collected.reverse().join("\n").trim();
}

function declarationKeyword(kind: string): string | null {
  const mapping: Record<string, string> = {
    class: "class",
    definition: "def",
    inductive: "inductive",
    structure: "structure",
    theorem: "theorem",
  };
  return mapping[kind] ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

const DECLARATION_MODIFIER_PATTERN = "(?:(?:private|protected|noncomputable|unsafe|partial)\\s+)*";

function declarationSourceNames(name: string, moduleName: string): string[] {
  const names = [name];
  if (name.startsWith(`${moduleName}.`)) names.push(name.slice(moduleName.length + 1));
  names.push(shortName(name));
  return [...new Set(names)];
}

function declarationLinePattern(sourceName: string, kind: string): RegExp | null {
  const keyword = declarationKeyword(kind);
  if (!keyword) return null;
  return new RegExp(`^(\\s*)${DECLARATION_MODIFIER_PATTERN}${keyword}\\s+${escapeRegExp(sourceName)}(?=[\\s:{(\\[]|$)`);
}

function siblingDeclarationPattern(): RegExp {
  return new RegExp(`^(\\s*)(?:${DECLARATION_MODIFIER_PATTERN}(?:abbrev|class|def|inductive|structure|theorem)\\s+\\S+|mutual\\b)`);
}

function siblingNamespacePattern(): RegExp {
  return /^(\s*)namespace\s+\S+/;
}

function terminationByPattern(): RegExp {
  return /^(\s*)termination_by\b/;
}

function trimSourceEnd(lines: string[], startIndex: number, endIndex: number): number {
  while (endIndex > startIndex && !lines[endIndex - 1].trim()) endIndex -= 1;
  const commentEnd = endIndex;
  while (endIndex > startIndex && lines[endIndex - 1].trim().startsWith("--")) {
    endIndex -= 1;
  }
  if (endIndex < commentEnd) {
    while (endIndex > startIndex && !lines[endIndex - 1].trim()) endIndex -= 1;
  } else {
    endIndex = commentEnd;
  }
  return endIndex;
}

function siblingDocstringStart(lines: string[], startIndex: number, siblingIndex: number): number {
  let index = siblingIndex - 1;
  while (index > startIndex && !lines[index].trim()) index -= 1;
  if (index <= startIndex || !lines[index].includes("-/")) return siblingIndex;

  while (index > startIndex && !lines[index].includes("/--")) index -= 1;
  return lines[index]?.includes("/--") ? index : siblingIndex;
}

export function findDeclarationSource(
  repoRoot: string,
  moduleName: string,
  name: string,
  kind: string,
): SourceMatch | null {
  const lines = readModuleLines(repoRoot, moduleName);
  const patterns = declarationSourceNames(name, moduleName)
    .map((sourceName) => declarationLinePattern(sourceName, kind))
    .filter((pattern): pattern is RegExp => pattern != null);
  if (!lines.length || patterns.length === 0) return null;

  let startIndex: number | null = null;
  let startIndent = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = patterns.map((pattern) => pattern.exec(lines[index])).find((result) => result != null);
    if (match) {
      startIndex = index;
      startIndent = match[1].length;
      break;
    }
  }
  if (startIndex == null) return null;

  const siblingPattern = siblingDeclarationPattern();
  const namespacePattern = siblingNamespacePattern();
  const terminationPattern = terminationByPattern();
  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const siblingMatch = siblingPattern.exec(line);
    if (siblingMatch && siblingMatch[1].length <= startIndent) {
      endIndex = siblingDocstringStart(lines, startIndex, index);
      break;
    }
    const namespaceMatch = namespacePattern.exec(line);
    if (namespaceMatch && namespaceMatch[1].length <= startIndent) {
      endIndex = siblingDocstringStart(lines, startIndex, index);
      break;
    }
    const terminationMatch = terminationPattern.exec(line);
    if (kind === "definition" && terminationMatch && terminationMatch[1].length <= startIndent) {
      endIndex = index;
      break;
    }
    if (line.startsWith("end ") && startIndent === 0) {
      endIndex = index;
      break;
    }
  }

  endIndex = trimSourceEnd(lines, startIndex, endIndex);
  return {
    startLine: startIndex + 1,
    endLine: endIndex,
    source: lines.slice(startIndex, endIndex).map((line) => line.replace(/\s+$/g, "")).join("\n").trim(),
  };
}

function editorLink(repoRoot: string, sourcePath: string, line: number): string {
  return `vscode://file/${join(repoRoot, sourcePath)}:${line}:1`;
}

export function relatedGroups(
  current: Pick<DeclarationSummary, "name" | "module" | "shortName">,
  declarations: DeclarationSummary[],
): RelatedGroup[] {
  const currentName = current.name;
  const currentShortName = current.shortName || shortName(currentName);
  const currentModule = current.module;
  const shortNamePattern = new RegExp(`(?<![\\w.])${escapeRegExp(currentShortName)}(?![\\w.])`);
  const relatedAll = declarations.filter((declaration) => {
    const signature = declaration.signatureText || "";
    return (
      declaration.name !== currentName &&
      declaration.kind === "theorem" &&
      (signature.includes(currentName) || shortNamePattern.test(signature))
    );
  });
  const currentModuleRelated = relatedAll.filter((declaration) => declaration.module === currentModule);
  return [
    {
      id: "current-module-mentions",
      title: "Mentions in current module",
      count: currentModuleRelated.length,
      allModulesCount: relatedAll.length,
      declarations: currentModuleRelated.map((declaration) => declaration.name),
    },
  ];
}

export function buildModuleGraph(
  modules: ModuleSummary[],
  imports: Array<[string, string]>,
): {
  nodes: Array<{
    id: string;
    label: string;
    sourcePath: string;
    group: string;
    imports: string[];
    importedBy: string[];
  }>;
  edges: Array<{ from: string; to: string }>;
} {
  const moduleNames = new Set(modules.map((module) => module.name));
  const importedBy = new Map(modules.map((module) => [module.name, [] as string[]]));
  const edges: Array<{ from: string; to: string }> = [];

  for (const [importer, imported] of imports) {
    if (moduleNames.has(importer) && moduleNames.has(imported)) {
      edges.push({ from: importer, to: imported });
      importedBy.get(imported)?.push(importer);
    }
  }

  return {
    nodes: modules.map((module) => ({
      id: module.name,
      label: module.name,
      sourcePath: module.sourcePath,
      group: module.group || displayGroup(module.name),
      imports: edges.filter((edge) => edge.from === module.name).map((edge) => edge.to),
      importedBy: [...(importedBy.get(module.name) || [])].sort(),
    })),
    edges,
  };
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqliteJson(dbPath: string, sql: string): SqlRow[] {
  const result = spawnSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`sqlite3 failed with status ${result.status}: ${result.stderr}`);
  }
  const output = result.stdout.trim();
  if (!output) return [];
  const parsed = JSON.parse(output) as unknown;
  if (!Array.isArray(parsed)) throw new Error("sqlite3 did not return a JSON array");
  return parsed as SqlRow[];
}

function loadModules(dbPath: string, localRoot: string): ModuleSummary[] {
  const rows = sqliteJson(
    dbPath,
    `select name, source_url from modules where name = ${sqlString(localRoot)} or name like ${sqlString(`${localRoot}.%`)} order by name`,
  );
  return rows.map((row) => {
    const name = String(row.name);
    return {
      name,
      sourcePath: moduleNameToRelativePath(name),
      editorLink: "",
      sourceUrl: typeof row.source_url === "string" ? row.source_url : "",
      group: displayGroup(name),
    };
  });
}

function loadImports(dbPath: string, localRoot: string): Array<[string, string]> {
  const rows = sqliteJson(
    dbPath,
    `select importer, imported from module_imports where importer = ${sqlString(localRoot)} or importer like ${sqlString(`${localRoot}.%`)} order by importer, imported`,
  );
  return rows.map((row) => [String(row.importer), String(row.imported)]);
}

function keyed(moduleName: SqlValue, position: SqlValue): string {
  return `${String(moduleName)}\0${String(position)}`;
}

function loadDocstrings(dbPath: string): Map<string, string> {
  const rows = sqliteJson(
    dbPath,
    "select module_name, position, text from declaration_markdown_docstrings",
  );
  return new Map(rows.map((row) => [keyed(row.module_name, row.position), String(row.text)]));
}

function loadModuleDocs(dbPath: string): Map<string, string> {
  const rows = sqliteJson(
    dbPath,
    "select module_name, text from module_docs_markdown order by module_name, position",
  );
  const docs = new Map<string, string[]>();
  for (const row of rows) {
    const moduleName = String(row.module_name);
    const values = docs.get(moduleName) || [];
    values.push(String(row.text));
    docs.set(moduleName, values);
  }
  return new Map([...docs.entries()].map(([moduleName, parts]) => [moduleName, parts.join("\n\n")]));
}

function loadAttributes(dbPath: string): Map<string, string[]> {
  const rows = sqliteJson(
    dbPath,
    "select module_name, position, attr from declaration_attrs order by sequence",
  );
  const attrs = new Map<string, string[]>();
  for (const row of rows) {
    const key = keyed(row.module_name, row.position);
    const values = attrs.get(key) || [];
    values.push(String(row.attr));
    attrs.set(key, values);
  }
  return attrs;
}

interface DeclarationRecord extends DeclarationSummary {
  namespace: string;
  sourcePath: string;
  line: number;
  column: number;
  sourceLocation: string;
  editorLink: string;
  docMarkdown: string;
  docText: string;
  leadingComment: string;
  sourceMatched: boolean;
  attributes: string[];
}

function loadDeclarations(dbPath: string, repoRoot: string, localRoot: string): DeclarationRecord[] {
  const docstrings = loadDocstrings(dbPath);
  const attributes = loadAttributes(dbPath);
  const rows = sqliteJson(
    dbPath,
    `
      select
        ni.module_name,
        ni.position,
        ni.kind,
        ni.name,
        dr.start_line,
        dr.start_column,
        dr.end_line,
        dr.end_column
      from name_info ni
      left join declaration_ranges dr
        on ni.module_name = dr.module_name and ni.position = dr.position
      where ni.module_name = ${sqlString(localRoot)} or ni.module_name like ${sqlString(`${localRoot}.%`)}
      order by ni.module_name, ni.position
    `,
  );

  return rows.map((row) => {
    const moduleName = String(row.module_name);
    const name = String(row.name);
    const kind = declarationKind(row);
    const sourcePath = moduleNameToRelativePath(moduleName);
    const sourceMatch = findDeclarationSource(repoRoot, moduleName, name, kind);
    const fallbackLine = typeof row.start_line === "number" ? row.start_line : 1;
    const line = sourceMatch ? sourceMatch.startLine : fallbackLine;
    const signature = sourceMatch ? sourceMatch.source : "";
    const leadingComment = readLeadingLineComment(repoRoot, moduleName, sourceMatch ? line : null);
    const doc =
      readSourceDocstring(repoRoot, moduleName, line) ||
      docstrings.get(keyed(moduleName, row.position)) ||
      "";
    return {
      name,
      shortName: shortName(name),
      namespace: namespaceName(name),
      kind,
      module: moduleName,
      sourcePath,
      line,
      column: typeof row.start_column === "number" ? row.start_column : 0,
      sourceLocation: `${sourcePath}:${line}`,
      editorLink: editorLink(repoRoot, sourcePath, line),
      docMarkdown: doc,
      docText: markdownToText(doc),
      leadingComment,
      sourceMatched: sourceMatch != null,
      signatureText: signature,
      attributes: attributes.get(keyed(moduleName, row.position)) || [],
    };
  });
}

export function buildPayload(
  dbPath: string,
  repoRoot: string,
  options: { localRoot?: string; projectName?: string } = {},
): JsonValue {
  const localRoot = options.localRoot || DEFAULT_LOCAL_ROOT;
  const projectName = options.projectName || DEFAULT_PROJECT_NAME;
  const modules = loadModules(dbPath, localRoot);
  const imports = loadImports(dbPath, localRoot);
  const moduleDocs = loadModuleDocs(dbPath);
  const declarations = loadDeclarations(dbPath, repoRoot, localRoot);
  const declarationByName: Record<string, JsonValue> = {};
  for (const declaration of declarations) declarationByName[declaration.name] = declaration as unknown as JsonValue;
  const related: Record<string, JsonValue> = {};
  for (const declaration of declarations) {
    related[declaration.name] = relatedGroups(declaration, declarations) as unknown as JsonValue;
  }

  const modulesByName: Record<string, JsonValue> = {};
  for (const module of modules) {
    const sourceDocs = readSourceDocs(repoRoot, module.name);
    const docMarkdown = sourceDocs.moduleDocMarkdown || moduleDocs.get(module.name) || "";
    modulesByName[module.name] = {
      ...module,
      editorLink: editorLink(repoRoot, module.sourcePath, 1),
      docMarkdown,
      docText: markdownToText(docMarkdown),
      namespaceDocs: readNamespaceDocs(repoRoot, module.name) as unknown as JsonValue,
      declarations: declarations
        .filter((declaration) => declaration.module === module.name)
        .map((declaration) => declaration.name),
    } as unknown as JsonValue;
  }

  return {
    schemaVersion: 1,
    project: { name: projectName, localRoot },
    modules: modulesByName,
    moduleOrder: modules.map((module) => module.name),
    declarations: declarationByName,
    declarationOrder: declarations.map((declaration) => declaration.name),
    related,
    moduleGraph: buildModuleGraph(modules, imports) as unknown as JsonValue,
  };
}

function sortForJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (value && typeof value === "object") {
    const sorted: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortForJson(value[key]);
    }
    return sorted;
  }
  return value;
}

function escapeNonAsciiJson(json: string): string {
  return json.replace(/[^\x00-\x7F]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}

export function writePayload(payload: JsonValue, outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `${escapeNonAsciiJson(JSON.stringify(sortForJson(payload), null, 2))}\n`,
    "utf8",
  );
}

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected positional argument: ${arg}`);
    const key = arg.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

export function main(args = argv.slice(2)): number {
  const parsed = parseArgs(args);
  const repoRoot = resolve(parsed["repo-root"] || cwd());
  const docGenPath = resolveDocGenDb(parsed["doc-gen"] || parsed.db || ".lean-view/doc-gen", cwd());
  const outPath = resolve(parsed.out || ".lean-view/data/index.json");
  const payload = buildPayload(docGenPath, repoRoot, {
    localRoot: parsed["local-root"] || DEFAULT_LOCAL_ROOT,
    projectName: parsed["project-name"] || DEFAULT_PROJECT_NAME,
  });
  writePayload(payload, outPath);
  return 0;
}

if (argv[1] && argv[1].endsWith("/extract.js")) {
  try {
    exit(main());
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    exit(1);
  }
}
