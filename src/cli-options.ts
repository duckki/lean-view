import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export interface ParsedCliArgs {
  docGen?: string;
  out?: string;
  repoRoot?: string;
  localRoot?: string;
  projectName?: string;
  server: boolean;
  host?: string;
  port: number;
  open: boolean;
  help: boolean;
}

export interface ResolvedCliOptions {
  docGenPath: string;
  repoRoot: string;
  outDir: string;
  localRoot: string;
  projectName: string;
  server: boolean;
  host: string;
  port: number;
  open: boolean;
}

const DEFAULT_LOCAL_ROOT = "GraphQL";
const DEFAULT_HOST = "127.0.0.1";
const DOC_GEN_CANDIDATES = [
  "api-docs.db",
  "doc-gen/api-docs.db",
  ".lake/build/doc/DocGen4/api-docs.db",
  ".lake/build/doc/api-docs.db",
  "build/doc/DocGen4/api-docs.db",
  "build/doc/api-docs.db",
];

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
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
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
    if (!arg.startsWith("--")) throw new Error(`Unexpected positional argument: ${arg}`);

    const value = requireValue(args, index, arg);
    if (arg === "--doc-gen" || arg === "--db") parsed.docGen = value;
    else if (arg === "--out") parsed.out = value;
    else if (arg === "--repo-root") parsed.repoRoot = value;
    else if (arg === "--local-root") parsed.localRoot = value;
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

export function resolveCliOptions(parsed: ParsedCliArgs, currentDirectory: string): ResolvedCliOptions {
  const repoRoot = resolve(currentDirectory, parsed.repoRoot || ".");
  const docGenInput = parsed.docGen || join(repoRoot, ".lean-view", "doc-gen");
  return {
    docGenPath: resolveDocGenDb(docGenInput, currentDirectory),
    repoRoot,
    outDir: parsed.out ? resolve(currentDirectory, parsed.out) : join(repoRoot, ".lean-view", "site"),
    localRoot: parsed.localRoot || DEFAULT_LOCAL_ROOT,
    projectName: parsed.projectName || basename(repoRoot),
    server: parsed.server || parsed.open,
    host: parsed.host || DEFAULT_HOST,
    port: parsed.port,
    open: parsed.open,
  };
}
