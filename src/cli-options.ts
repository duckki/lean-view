import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export interface ParsedCliArgs {
  command?: "doctor";
  docGen?: string;
  out?: string;
  repoRoot?: string;
  rootModule?: string;
  projectName?: string;
  server: boolean;
  host?: string;
  port: number;
  open: boolean;
  help: boolean;
  dryRun: boolean;
  json: boolean;
}

export interface ResolvedCliOptions {
  docGenPath: string;
  docGenOutputDir: string;
  docBuildDir: string;
  docGenInput: string;
  generateDocGen: boolean;
  lakefileFound: boolean;
  repoRoot: string;
  outDir: string;
  rootModule: string;
  projectName: string;
  packageName: string;
  server: boolean;
  host: string;
  port: number;
  open: boolean;
  dryRun: boolean;
  json: boolean;
}

const DEFAULT_HOST = "127.0.0.1";
const DOC_GEN_CANDIDATES = [
  "api-docs.db",
  "doc-gen/api-docs.db",
  ".lake/build/doc/DocGen4/api-docs.db",
  ".lake/build/doc/api-docs.db",
  "build/doc/DocGen4/api-docs.db",
  "build/doc/api-docs.db",
];
const LAKEFILE_NAMES = ["lakefile.toml", "lakefile.lean"];

export interface LakefileMetadata {
  projectName?: string;
  rootModule?: string;
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${option}`);
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid --port value: ${value}`);
  }
  return port;
}

export function parseCliArgs(args: string[]): ParsedCliArgs {
  const parsed: ParsedCliArgs = {
    server: false,
    port: 0,
    open: false,
    help: false,
    dryRun: false,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (index === 0 && arg === "doctor") {
      parsed.command = "doctor";
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--server") {
      parsed.server = true;
      continue;
    }
    if (arg === "--open") {
      parsed.open = true;
      parsed.server = true;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`Unexpected positional argument: ${arg}`);

    const value = requireValue(args, index, arg);
    if (arg === "--doc-gen") parsed.docGen = value;
    else if (arg === "--out") parsed.out = value;
    else if (arg === "--repo-root") parsed.repoRoot = value;
    else if (arg === "--root-module") parsed.rootModule = value;
    else if (arg === "--project-name") parsed.projectName = value;
    else if (arg === "--host") parsed.host = value;
    else if (arg === "--port") parsed.port = parsePort(value);
    else throw new Error(`Unknown option: ${arg}`);
    index += 1;
  }

  return parsed;
}

export function resolveDocGenDb(input: string, cwd: string): string {
  const target = resolve(cwd, input);
  if (target.endsWith(".db")) return target;

  for (const candidate of DOC_GEN_CANDIDATES) {
    const candidatePath = join(target, candidate);
    if (existsSync(candidatePath)) return candidatePath;
  }

  return join(target, "api-docs.db");
}

function unquoteLakeName(value: string): string {
  return value
    .trim()
    .replace(/^«(.+)»$/, "$1")
    .replace(/^"(.+)"$/, "$1");
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.slice(1).find((capture) => capture != null && capture !== "");
    if (value) return unquoteLakeName(value);
  }
  return undefined;
}

export function parseLakefileMetadata(text: string): LakefileMetadata {
  return {
    projectName: firstMatch(text, [
      /^\s*name\s*=\s*"([^"]+)"/m,
      /^\s*package\s+(?:"([^"]+)"|«([^»]+)»|([A-Za-z0-9_'.-]+))/m,
    ]),
    rootModule: firstMatch(text, [
      /^\s*\[\[lean_lib\]\][\s\S]*?^\s*name\s*=\s*"([^"]+)"/m,
      /^\s*lean_lib\s+(?:"([^"]+)"|«([^»]+)»|([A-Za-z0-9_'.]+))/m,
    ]),
  };
}

function parentDirectory(path: string): string {
  const parent = dirname(path);
  return parent === path ? path : parent;
}

function directoryNameFallback(path: string): string {
  return basename(path) || basename(resolve(path));
}

export function findLakefile(startDirectory: string): string | null {
  let directory = resolve(startDirectory);
  while (true) {
    for (const fileName of LAKEFILE_NAMES) {
      const candidate = join(directory, fileName);
      if (existsSync(candidate)) return candidate;
    }
    const parent = parentDirectory(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

function readLakefileMetadata(startDirectory: string): { root: string; metadata: LakefileMetadata } | null {
  const lakefile = findLakefile(startDirectory);
  if (!lakefile) return null;
  return {
    root: dirname(lakefile),
    metadata: parseLakefileMetadata(readFileSync(lakefile, "utf8")),
  };
}

export function resolveCliOptions(parsed: ParsedCliArgs, currentDirectory: string): ResolvedCliOptions {
  const explicitRepoRoot = parsed.repoRoot
    ? isAbsolute(parsed.repoRoot)
      ? parsed.repoRoot
      : resolve(currentDirectory, parsed.repoRoot)
    : null;
  const lake = readLakefileMetadata(explicitRepoRoot || currentDirectory);
  const repoRoot = explicitRepoRoot || lake?.root || resolve(currentDirectory);
  const defaultDocGenOutputDir = join(repoRoot, ".lean-view", "doc-gen");
  const docGenInput = parsed.docGen || defaultDocGenOutputDir;
  const docGenPath = resolveDocGenDb(docGenInput, currentDirectory);
  return {
    docGenPath,
    docGenOutputDir: parsed.docGen ? dirname(docGenPath) : defaultDocGenOutputDir,
    docBuildDir: join(repoRoot, ".lean-view", "docbuild"),
    docGenInput,
    generateDocGen: parsed.docGen == null,
    lakefileFound: lake != null,
    repoRoot,
    outDir: parsed.out ? resolve(currentDirectory, parsed.out) : join(repoRoot, ".lean-view", "site"),
    rootModule: lake?.metadata.rootModule || parsed.rootModule || directoryNameFallback(repoRoot),
    projectName: lake?.metadata.projectName || parsed.projectName || directoryNameFallback(repoRoot),
    packageName: lake?.metadata.projectName || directoryNameFallback(repoRoot),
    server: parsed.server || parsed.open,
    host: parsed.host || DEFAULT_HOST,
    port: parsed.port,
    open: parsed.open,
    dryRun: parsed.dryRun,
    json: parsed.json,
  };
}

export function formatResolvedCliOptionsSummary(options: ResolvedCliOptions): string {
  const displayPath = (path: string, originalInput?: string): string => {
    if (originalInput && !isAbsolute(originalInput)) {
      const resolvedOriginal = resolve(originalInput);
      const relativeOriginal = relative(options.repoRoot, resolvedOriginal);
      if (relativeOriginal.startsWith("..") || isAbsolute(relativeOriginal)) return originalInput;
    }

    const relativePath = relative(options.repoRoot, path);
    if (relativePath === "") return ".";
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) return path;
    return relativePath;
  };
  const serverValue = options.server ? `enabled on ${options.host}:${options.port}` : "disabled";
  const lines = [
    `Repository root: ${options.repoRoot}`,
    `  - Lakefile ${options.lakefileFound ? "found" : "not found"}`,
    `  - Project name: ${options.projectName}`,
    `  - Root module: ${options.rootModule}`,
    options.generateDocGen ? "doc-gen not provided -> doc-gen to be generated" : "doc-gen provided -> existing doc-gen database to be used",
  ];

  if (options.generateDocGen) {
    lines.push(
      `  - doc-gen directory: ${displayPath(options.docGenOutputDir)}`,
      `  - doc-gen database: ${displayPath(options.docGenPath)}`,
    );
  } else {
    lines.push(`  - doc-gen database: ${displayPath(options.docGenPath, options.docGenInput)}`);
  }

  lines.push(`Output: ${displayPath(options.outDir)}`, `  - Server: ${serverValue}`);

  return `${lines.join("\n")}\n`;
}
