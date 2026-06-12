#!/usr/bin/env node
import { dirname } from "node:path";
import { argv, cwd, exit, stderr, stdout } from "node:process";
import { fileURLToPath } from "node:url";

import { parseCliArgs, resolveCliOptions } from "./cli-options.js";
import { createStaticServer, openUrl } from "./server.js";
import { generateSite } from "./site.js";

function usage(): string {
  return [
    "Usage:",
    "  npx lean-view --local-root <Module> [options]",
    "",
    "Options:",
    "  --doc-gen <path>         doc-gen output directory, DB directory, or api-docs.db",
    "  --db <path>              Compatibility alias for --doc-gen",
    "  --local-root <Module>    Local module root to include (default: GraphQL)",
    "  --repo-root <path>       Lean project root (default: current directory)",
    "  --project-name <name>    Display name (default: current directory name)",
    "  --out <path>             Static output directory (default: .lean-view/site)",
    "  --server                 Serve the generated site on a local HTTP server",
    "  --host <host>            Server host (default: 127.0.0.1)",
    "  --port <port>            Server port, or 0 for a random port (default: 0)",
    "  --open                   Open the served site in the system browser; implies --server",
    "  --help                   Show this help",
    "",
  ].join("\n");
}

export async function main(args = argv.slice(2)): Promise<number> {
  const parsed = parseCliArgs(args);
  if (parsed.help) {
    stdout.write(usage());
    return 0;
  }

  const options = resolveCliOptions(parsed, cwd());
  const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

  const written = generateSite({
    dbPath: options.docGenPath,
    repoRoot: options.repoRoot,
    outDir: options.outDir,
    localRoot: options.localRoot,
    projectName: options.projectName,
    packageRoot,
  });

  stdout.write(`Wrote Lean View site to ${written}\n`);
  if (options.server) {
    const server = await createStaticServer({
      root: written,
      host: options.host,
      port: options.port,
    });
    stdout.write(`Serving Lean View site at ${server.url}\n`);
    if (options.open) openUrl(server.url);
    await new Promise(() => undefined);
  }
  return 0;
}

try {
  exit(await main());
} catch (error) {
  stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  exit(1);
}
