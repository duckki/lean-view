#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { argv, cwd, exit, stderr, stdout, version as nodeVersion } from "node:process";
import { fileURLToPath } from "node:url";

import { formatResolvedCliOptionsSummary, parseCliArgs, resolveCliOptions } from "./cli-options.js";
import { discoverLeanModules, docGenCommands, runDocGen, type DocGenCommand } from "./doc-gen.js";
import { createStaticServer, openUrl } from "./server.js";
import { generateSite } from "./site.js";

function usage(): string {
  return [
    "Usage:",
    "  npx lean-view [options]",
    "  npx lean-view doctor [options]",
    "",
    "Options:",
    "  --doc-gen <path>         Existing doc-gen output directory, DB directory, or api-docs.db",
    "  --root-module <Module>   Fallback root module if Lake metadata is unavailable",
    "  --repo-root <path>       Lean project root (default: nearest ancestor Lake directory)",
    "  --project-name <name>    Fallback display name if Lake package name is unavailable",
    "  --out <path>             Static output directory (default: .lean-view/site)",
    "  --server                 Serve the generated site on a local HTTP server",
    "  --host <host>            Server host (default: 127.0.0.1)",
    "  --port <port>            Server port, or 0 for a random port (default: 0)",
    "  --open                   Open the served site in the system browser; implies --server",
    "  --dry-run                Print resolved options and planned commands without writing output",
    "  --json                   Print machine-readable JSON",
    "  --help                   Show this help",
    "",
    "If --doc-gen is omitted, lean-view runs project-only doc-gen under .lean-view/doc-gen.",
    "",
  ].join("\n");
}

function commandText(command: DocGenCommand): string {
  return `${command.command} ${command.args.join(" ")}`;
}

function plannedDocGenCommands(options: ReturnType<typeof resolveCliOptions>): DocGenCommand[] {
  const modules = discoverLeanModules(options.repoRoot, options.rootModule);
  return docGenCommands({
    repoRoot: options.repoRoot,
    docBuildDir: options.docBuildDir,
    dbPath: options.docGenPath,
    outDir: options.docGenOutputDir,
    localRoot: options.rootModule,
    modules,
  });
}

function commandStatus(command: string, args: string[]): { ok: boolean; detail: string } {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) return { ok: false, detail: result.error.message };
  if (result.status !== 0) return { ok: false, detail: result.stderr || result.stdout || `exit ${result.status}` };
  return { ok: true, detail: (result.stdout || result.stderr).trim().split("\n")[0] || "available" };
}

interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  required?: boolean;
}

function runDocGenCommandForJson(command: DocGenCommand): { status: number | null; stderr: string; error?: Error } {
  const result = spawnSync(command.command, command.args, {
    cwd: command.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout) stderr.write(result.stdout);
  if (result.stderr) stderr.write(result.stderr);
  return { status: result.status, stderr: result.stderr, error: result.error };
}

function jsonOptions(options: ReturnType<typeof resolveCliOptions>, extra: Record<string, unknown> = {}): string {
  return `${JSON.stringify(
    {
      repoRoot: options.repoRoot,
      lakefileFound: options.lakefileFound,
      projectName: options.projectName,
      rootModule: options.rootModule,
      docGenPath: options.docGenPath,
      docGenOutputDir: options.docGenOutputDir,
      docBuildDir: options.docBuildDir,
      generateDocGen: options.generateDocGen,
      outDir: options.outDir,
      server: options.server,
      host: options.host,
      port: options.port,
      open: options.open,
      ...extra,
    },
    null,
    2,
  )}\n`;
}

function runDoctor(options: ReturnType<typeof resolveCliOptions>): number {
  const checks: DoctorCheck[] = [
    { name: "node", ok: true, detail: nodeVersion },
    { name: "sqlite3", ...commandStatus("sqlite3", ["--version"]) },
    { name: "lake", ...commandStatus("lake", ["--version"]), required: options.generateDocGen },
    {
      name: "lakefile",
      ok: options.lakefileFound,
      detail: options.lakefileFound ? "found" : "not found; using fallback root/project metadata",
      required: false,
    },
    {
      name: "doc-gen database",
      ok: options.generateDocGen || existsSync(options.docGenPath),
      detail: options.generateDocGen ? "will be generated" : options.docGenPath,
      required: !options.generateDocGen,
    },
  ];
  const failedRequired = checks.some((check) => check.required !== false && !check.ok);

  if (options.json) {
    stdout.write(jsonOptions(options, { checks, ok: !failedRequired }));
  } else {
    stdout.write(formatResolvedCliOptionsSummary(options));
    stdout.write("Doctor:\n");
    for (const check of checks) {
      stdout.write(`  - ${check.name}: ${check.ok ? "ok" : "missing"} (${check.detail})\n`);
    }
  }

  return failedRequired ? 1 : 0;
}

function runDryRun(options: ReturnType<typeof resolveCliOptions>): number {
  let commands: DocGenCommand[] = [];
  let moduleError: string | null = null;
  if (options.generateDocGen) {
    try {
      commands = plannedDocGenCommands(options);
    } catch (error) {
      moduleError = error instanceof Error ? error.message : String(error);
    }
  }

  if (options.json) {
    stdout.write(
      jsonOptions(options, {
        dryRun: true,
        plannedCommands: commands,
        error: moduleError,
      }),
    );
  } else {
    stdout.write(formatResolvedCliOptionsSummary(options));
    stdout.write("Dry run: no files written.\n");
    if (moduleError) stdout.write(`  - ${moduleError}\n`);
    else if (commands.length > 0) {
      stdout.write("Planned doc-gen commands:\n");
      for (const command of commands) {
        stdout.write(`  - (${command.cwd}) ${commandText(command)}\n`);
      }
    }
  }

  return moduleError ? 1 : 0;
}

export async function main(args = argv.slice(2)): Promise<number> {
  const parsed = parseCliArgs(args);
  if (parsed.help) {
    stdout.write(usage());
    return 0;
  }

  const options = resolveCliOptions(parsed, cwd());
  const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

  if (parsed.command === "doctor") return runDoctor(options);
  if (options.dryRun) return runDryRun(options);

  if (!options.json) stdout.write(formatResolvedCliOptionsSummary(options));

  if (options.generateDocGen) {
    runDocGen({
      repoRoot: options.repoRoot,
      docBuildDir: options.docBuildDir,
      packageName: options.packageName,
      projectName: options.projectName,
      localRoot: options.rootModule,
      dbPath: options.docGenPath,
      outDir: options.docGenOutputDir,
      log: (message) => (options.json ? stderr : stdout).write(`${message}\n`),
      runner: options.json ? runDocGenCommandForJson : undefined,
    });
  }

  const written = generateSite({
    dbPath: options.docGenPath,
    repoRoot: options.repoRoot,
    outDir: options.outDir,
    localRoot: options.rootModule,
    projectName: options.projectName,
    packageRoot,
  });

  if (options.server) {
    const server = await createStaticServer({
      root: written,
      host: options.host,
      port: options.port,
    });
    if (options.json) stdout.write(jsonOptions(options, { outDir: written, serverUrl: server.url }));
    else {
      stdout.write(`Wrote Lean View site to ${written}\n`);
      stdout.write(`Serving Lean View site at ${server.url}\n`);
    }
    if (options.open) openUrl(server.url);
    await new Promise(() => undefined);
  }
  if (options.json) stdout.write(jsonOptions(options, { outDir: written }));
  else stdout.write(`Wrote Lean View site to ${written}\n`);
  return 0;
}

try {
  exit(await main());
} catch (error) {
  stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  exit(1);
}
