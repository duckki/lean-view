import { copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { buildPayload, writePayload } from "./extract.js";

const STATIC_ASSETS = ["index.html", "app.js", "styles.css"];

export interface GenerateSiteOptions {
  dbPath: string;
  repoRoot: string;
  outDir: string;
  localRoot: string;
  projectName: string;
  packageRoot: string;
}

export function copyStaticAssets(packageRoot: string, outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  for (const fileName of STATIC_ASSETS) {
    copyFileSync(join(packageRoot, "static", fileName), join(outDir, fileName));
  }
}

export function generateSite(options: GenerateSiteOptions): string {
  const outDir = resolve(options.outDir);
  copyStaticAssets(options.packageRoot, outDir);
  const payload = buildPayload(resolve(options.dbPath), resolve(options.repoRoot), {
    localRoot: options.localRoot,
    projectName: options.projectName,
  });
  writePayload(payload, join(outDir, "data", "index.json"));
  return outDir;
}
