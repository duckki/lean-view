#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const outputPath = process.argv[2] || join(projectRoot, ".lean-view", "doc-gen", "api-docs.db");

const kindByKeyword = {
  class: "class",
  def: "definition",
  inductive: "inductive",
  structure: "structure",
  theorem: "theorem",
};

function sql(value) {
  if (value == null) return "null";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function listLeanFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith(".lean")) files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

function moduleName(filePath) {
  return relative(projectRoot, filePath)
    .replace(/\.lean$/, "")
    .split("/")
    .join(".");
}

function readBlock(lines, index, startMarker) {
  const parts = [];
  const first = lines[index].split(startMarker, 2)[1] || "";
  if (first.includes("-/")) return { text: first.split("-/", 1)[0].trim(), endIndex: index };
  parts.push(first);
  let cursor = index + 1;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line.includes("-/")) {
      parts.push(line.split("-/", 1)[0]);
      break;
    }
    parts.push(line);
    cursor += 1;
  }
  return {
    text: parts.join("\n").trim(),
    endIndex: cursor,
  };
}

function parseFile(filePath) {
  const name = moduleName(filePath);
  const lines = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n").split("\n");
  const imports = [];
  const declarations = [];
  const moduleDocs = [];
  const namespaceStack = [];
  const namespaceFrameLengths = [];
  const currentNamespace = () => (namespaceStack.length ? namespaceStack.join(".") : name);

  for (let index = 0; index < lines.length; index += 1) {
    const stripped = lines[index].trim();
    if (stripped.startsWith("import ")) {
      imports.push(...stripped.slice("import ".length).split(/\s+/).filter(Boolean));
      continue;
    }

    if (stripped.startsWith("/-!")) {
      const block = readBlock(lines, index, "/-!");
      if (block.text) moduleDocs.push(block.text);
      index = block.endIndex;
      continue;
    }

    const namespaceMatch = /^namespace\s+([A-Za-z0-9_'.]+)\s*$/.exec(stripped);
    if (namespaceMatch) {
      const segments = namespaceMatch[1].split(".");
      namespaceStack.push(...segments);
      namespaceFrameLengths.push(segments.length);
      continue;
    }
    if (/^end(?:\s+[A-Za-z0-9_'.]+)?\s*$/.test(stripped)) {
      const frameLength = namespaceFrameLengths.pop() || 0;
      namespaceStack.splice(namespaceStack.length - frameLength, frameLength);
      continue;
    }

    const declarationMatch = /^(?:partial\s+)?(class|def|inductive|structure|theorem)\s+([A-Za-z0-9_?!'.]+)/.exec(stripped);
    if (!declarationMatch) continue;
    declarations.push({
      moduleName: name,
      position: index + 1,
      kind: kindByKeyword[declarationMatch[1]],
      name: `${currentNamespace()}.${declarationMatch[2]}`,
      line: index + 1,
    });
  }

  return { name, imports, declarations, moduleDocs };
}

const parsedModules = listLeanFiles(projectRoot).map(parseFile);
const statements = [
  "pragma foreign_keys = off;",
  "drop table if exists modules;",
  "drop table if exists module_imports;",
  "drop table if exists name_info;",
  "drop table if exists declaration_ranges;",
  "drop table if exists declaration_markdown_docstrings;",
  "drop table if exists module_docs_markdown;",
  "drop table if exists declaration_attrs;",
  "create table modules (name text primary key, source_url text);",
  "create table module_imports (importer text, imported text);",
  "create table name_info (module_name text, position integer, kind text, name text);",
  "create table declaration_ranges (module_name text, position integer, start_line integer, start_column integer, end_line integer, end_column integer);",
  "create table declaration_markdown_docstrings (module_name text, position integer, text text);",
  "create table module_docs_markdown (module_name text, position integer, text text);",
  "create table declaration_attrs (module_name text, position integer, attr text, sequence integer);",
];

for (const module of parsedModules) {
  statements.push(`insert into modules (name, source_url) values (${sql(module.name)}, ${sql("")});`);
  module.imports.forEach((importName) => {
    statements.push(`insert into module_imports (importer, imported) values (${sql(module.name)}, ${sql(importName)});`);
  });
  module.moduleDocs.forEach((text, index) => {
    statements.push(`insert into module_docs_markdown (module_name, position, text) values (${sql(module.name)}, ${index + 1}, ${sql(text)});`);
  });
  module.declarations.forEach((declaration, index) => {
    statements.push(
      `insert into name_info (module_name, position, kind, name) values (${sql(declaration.moduleName)}, ${declaration.position}, ${sql(declaration.kind)}, ${sql(declaration.name)});`,
    );
    statements.push(
      `insert into declaration_ranges (module_name, position, start_line, start_column, end_line, end_column) values (${sql(declaration.moduleName)}, ${declaration.position}, ${declaration.line}, 1, ${declaration.line}, 1);`,
    );
    if (declaration.kind === "theorem") {
      statements.push(
        `insert into declaration_attrs (module_name, position, attr, sequence) values (${sql(declaration.moduleName)}, ${declaration.position}, ${sql("simp")}, ${index});`,
      );
    }
  });
}

mkdirSync(dirname(outputPath), { recursive: true });
rmSync(outputPath, { force: true });
const result = spawnSync("sqlite3", [outputPath], {
  encoding: "utf8",
  input: `${statements.join("\n")}\n`,
});

if (result.error) throw result.error;
if (result.status !== 0) {
  console.error(result.stderr);
  process.exit(result.status || 1);
}

console.log(`Wrote mock doc-gen database to ${outputPath}`);
