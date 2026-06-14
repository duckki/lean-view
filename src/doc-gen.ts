import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

export interface DocGenCommand {
  command: string;
  args: string[];
  cwd: string;
}

export interface DocGenRunResult {
  status: number | null;
  stderr: string;
  error?: Error;
}

export type DocGenRunner = (command: DocGenCommand) => DocGenRunResult;

export interface RunDocGenOptions {
  repoRoot: string;
  docBuildDir: string;
  packageName: string;
  localRoot: string;
  dbPath: string;
  outDir: string;
  runner?: DocGenRunner;
}

export interface WriteDocBuildLakefileOptions {
  docBuildDir: string;
  packageName: string;
  repoRoot: string;
}

function moduleRootPath(repoRoot: string, localRoot: string): string {
  return join(repoRoot, ...localRoot.split("."));
}

function moduleNameFromPath(repoRoot: string, filePath: string): string {
  return relative(repoRoot, filePath)
    .replace(/\.lean$/, "")
    .split("/")
    .join(".");
}

function collectLeanFiles(directory: string, files: string[]): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectLeanFiles(path, files);
    else if (entry.isFile() && entry.name.endsWith(".lean")) files.push(path);
  }
}

export function discoverLeanModules(repoRoot: string, localRoot: string): string[] {
  const files: string[] = [];
  const rootFile = `${moduleRootPath(repoRoot, localRoot)}.lean`;
  if (existsSync(rootFile)) files.push(rootFile);
  collectLeanFiles(moduleRootPath(repoRoot, localRoot), files);
  return files
    .map((file) => moduleNameFromPath(repoRoot, file))
    .sort((left, right) => {
      const depth = left.split(".").length - right.split(".").length;
      return depth === 0 ? left.localeCompare(right) : depth;
    });
}

export function docGenCommands(options: {
  repoRoot: string;
  docBuildDir: string;
  dbPath: string;
  outDir: string;
  localRoot: string;
  modules: string[];
}): DocGenCommand[] {
  const dbBuildDir = dirname(options.dbPath);
  const dbFileName = basename(options.dbPath);

  return [
    { command: "lake", args: ["build"], cwd: options.repoRoot },
    { command: "lake", args: ["update"], cwd: options.docBuildDir },
    { command: "lake", args: ["build", "doc-gen4"], cwd: options.docBuildDir },
    ...options.modules.map((moduleName) => ({
      command: "lake",
      args: [
        "env",
        "doc-gen4",
        "single",
        "--build",
        dbBuildDir,
        moduleName,
        dbFileName,
        `vscode://file/${join(options.repoRoot, ...moduleName.split(".")).replace(/\.lean$/, "")}.lean`,
      ],
      cwd: options.docBuildDir,
    })),
    {
      command: "lake",
      args: ["env", "doc-gen4", "fromDb", "--build", options.outDir, options.dbPath, options.localRoot],
      cwd: options.docBuildDir,
    },
  ];
}

function tomlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function readTextIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function removeDocBuildArtifacts(docBuildDir: string): void {
  rmSync(join(docBuildDir, ".lake", "build"), { recursive: true, force: true });
  rmSync(join(docBuildDir, ".lake", "config"), { recursive: true, force: true });

  const packagesDir = join(docBuildDir, ".lake", "packages");
  if (!existsSync(packagesDir)) return;
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      rmSync(join(packagesDir, entry.name, ".lake", "build"), { recursive: true, force: true });
    }
  }
}

function syncDocBuildToolchain(options: WriteDocBuildLakefileOptions): void {
  const sourceToolchain = readTextIfExists(join(options.repoRoot, "lean-toolchain"));
  const targetPath = join(options.docBuildDir, "lean-toolchain");
  const previousToolchain = readTextIfExists(targetPath);

  if (sourceToolchain == null) rmSync(targetPath, { force: true });
  else writeFileSync(targetPath, sourceToolchain, "utf8");

  if (previousToolchain !== sourceToolchain) removeDocBuildArtifacts(options.docBuildDir);
}

function docGenRevForToolchain(toolchain: string | null): string {
  const version = /^leanprover\/lean4:(\S+)$/m.exec(toolchain?.trim() || "")?.[1];
  return version || "main";
}

export function writeDocBuildLakefile(options: WriteDocBuildLakefileOptions): void {
  mkdirSync(options.docBuildDir, { recursive: true });
  syncDocBuildToolchain(options);
  const docGenRev = docGenRevForToolchain(readTextIfExists(join(options.repoRoot, "lean-toolchain")));
  writeFileSync(
    join(options.docBuildDir, "lakefile.toml"),
    [
      'name = "lean_view_docbuild"',
      'version = "0.1.0"',
      "",
      "[[require]]",
      'name = "doc-gen4"',
      'git = "https://github.com/leanprover/doc-gen4"',
      `rev = ${tomlString(docGenRev)}`,
      "",
      "[[require]]",
      `name = ${tomlString(options.packageName)}`,
      `path = ${tomlString(options.repoRoot)}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

function defaultRunner(command: DocGenCommand): DocGenRunResult {
  return spawnSync(command.command, command.args, {
    cwd: command.cwd,
    encoding: "utf8",
    stdio: ["ignore", "inherit", "pipe"],
  });
}

export function runDocGen(options: RunDocGenOptions): void {
  const modules = discoverLeanModules(options.repoRoot, options.localRoot);
  if (modules.length === 0) {
    throw new Error(`No Lean modules found for local root ${options.localRoot}`);
  }

  mkdirSync(options.outDir, { recursive: true });
  mkdirSync(dirname(options.dbPath), { recursive: true });
  writeDocBuildLakefile({
    docBuildDir: options.docBuildDir,
    packageName: options.packageName,
    repoRoot: options.repoRoot,
  });
  rmSync(options.dbPath, { force: true });
  const runner = options.runner || defaultRunner;
  for (const command of docGenCommands({
    repoRoot: options.repoRoot,
    docBuildDir: options.docBuildDir,
    dbPath: options.dbPath,
    outDir: options.outDir,
    localRoot: options.localRoot,
    modules,
  })) {
    const result = runner(command);
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`${command.command} ${command.args.join(" ")} failed: ${result.stderr}`);
    }
  }
}
