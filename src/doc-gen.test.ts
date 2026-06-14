import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { discoverLeanModules, docGenCommands, runDocGen, writeDocBuildLakefile } from "./doc-gen.js";

function withTempRepo(fn: (root: string) => void): void {
  const root = mkdtempSync("/tmp/lean-view-doc-gen-");
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeModule(root: string, relativePath: string): void {
  const path = join(root, relativePath);
  mkdirSync(path.split("/").slice(0, -1).join("/"), { recursive: true });
  writeFileSync(path, "namespace MockProject\n\ndef marker : Nat := 0\n\nend MockProject\n", "utf8");
}

test("discovers Lean modules under the requested local root", () => {
  withTempRepo((root) => {
    writeModule(root, "MockProject.lean");
    writeModule(root, "MockProject/Core.lean");
    writeModule(root, "MockProject/Core/Values.lean");
    writeModule(root, "OtherProject.lean");

    assert.deepEqual(discoverLeanModules(root, "MockProject"), [
      "MockProject",
      "MockProject.Core",
      "MockProject.Core.Values",
    ]);
  });
});

test("builds project-only doc-gen4 commands", () => {
  const dbPath = "/repo/.lean-view/doc-gen/api-docs.db";
  const outDir = "/repo/.lean-view/doc-gen";
  const docBuildDir = "/repo/.lean-view/docbuild";

  assert.deepEqual(docGenCommands({
    repoRoot: "/repo",
    docBuildDir,
    dbPath,
    outDir,
    localRoot: "MockProject",
    modules: ["MockProject", "MockProject.Core"],
  }), [
    { command: "lake", args: ["build"], cwd: "/repo" },
    { command: "lake", args: ["update"], cwd: docBuildDir },
    { command: "lake", args: ["build", "doc-gen4"], cwd: docBuildDir },
    {
      command: "lake",
      args: [
        "env",
        "doc-gen4",
        "single",
        "--build",
        outDir,
        "MockProject",
        "api-docs.db",
        "vscode://file//repo/MockProject.lean",
      ],
      cwd: docBuildDir,
    },
    {
      command: "lake",
      args: [
        "env",
        "doc-gen4",
        "single",
        "--build",
        outDir,
        "MockProject.Core",
        "api-docs.db",
        "vscode://file//repo/MockProject/Core.lean",
      ],
      cwd: docBuildDir,
    },
    {
      command: "lake",
      args: ["env", "doc-gen4", "fromDb", "--build", outDir, dbPath, "MockProject"],
      cwd: docBuildDir,
    },
  ]);
});

test("writes a docbuild Lake workspace that depends on doc-gen4 and the target project", () => {
  withTempRepo((root) => {
    writeFileSync(join(root, "lean-toolchain"), "leanprover/lean4:v4.29.1\n", "utf8");
    const docBuildDir = join(root, ".lean-view", "docbuild");
    writeDocBuildLakefile({
      docBuildDir,
      packageName: "mock-project",
      repoRoot: root,
    });

    const lakefile = join(docBuildDir, "lakefile.toml");
    assert.equal(existsSync(lakefile), true);
    const content = readFileSync(lakefile, "utf8");
    assert.equal(content.includes('name = "lean_view_docbuild"'), true);
    assert.equal(content.includes('name = "doc-gen4"'), true);
    assert.equal(content.includes('rev = "v4.29.1"'), true);
    assert.equal(content.includes('name = "mock-project"'), true);
    assert.equal(content.includes(`path = "${root}"`), true);
    assert.equal(readFileSync(join(docBuildDir, "lean-toolchain"), "utf8"), "leanprover/lean4:v4.29.1\n");
  });
});

test("replaces stale docbuild toolchain and removes incompatible build artifacts", () => {
  withTempRepo((root) => {
    writeFileSync(join(root, "lean-toolchain"), "leanprover/lean4:v4.29.1\n", "utf8");
    const docBuildDir = join(root, ".lean-view", "docbuild");
    mkdirSync(join(docBuildDir, ".lake", "build"), { recursive: true });
    mkdirSync(join(docBuildDir, ".lake", "config"), { recursive: true });
    mkdirSync(join(docBuildDir, ".lake", "packages", "doc-gen4", ".lake", "build"), { recursive: true });
    writeFileSync(join(docBuildDir, "lean-toolchain"), "leanprover/lean4:v4.31.0-rc2\n", "utf8");
    writeFileSync(join(docBuildDir, ".lake", "build", "stale.olean"), "", "utf8");
    writeFileSync(join(docBuildDir, ".lake", "config", "lakefile.olean"), "", "utf8");
    writeFileSync(join(docBuildDir, ".lake", "packages", "doc-gen4", ".lake", "build", "stale.olean"), "", "utf8");

    writeDocBuildLakefile({
      docBuildDir,
      packageName: "mock-project",
      repoRoot: root,
    });

    assert.equal(readFileSync(join(docBuildDir, "lean-toolchain"), "utf8"), "leanprover/lean4:v4.29.1\n");
    assert.equal(existsSync(join(docBuildDir, ".lake", "build")), false);
    assert.equal(existsSync(join(docBuildDir, ".lake", "config")), false);
    assert.equal(existsSync(join(docBuildDir, ".lake", "packages", "doc-gen4")), true);
    assert.equal(existsSync(join(docBuildDir, ".lake", "packages", "doc-gen4", ".lake", "build")), false);
  });
});

test("runs doc-gen commands with a generated output directory", () => {
  withTempRepo((root) => {
    writeModule(root, "MockProject.lean");
    writeModule(root, "MockProject/Core.lean");
    const outDir = join(root, ".lean-view", "doc-gen");
    const docBuildDir = join(root, ".lean-view", "docbuild");
    const dbPath = join(outDir, "api-docs.db");
    const commands: string[] = [];
    const logs: string[] = [];

    runDocGen({
      repoRoot: root,
      docBuildDir,
      packageName: "mock-project",
      projectName: "Mock Project",
      localRoot: "MockProject",
      dbPath,
      outDir,
      log: (message) => logs.push(message),
      runner: (command) => {
        commands.push(`${command.command} ${command.args.join(" ")}`);
        return { status: 0, stderr: "" };
      },
    });

    assert.equal(existsSync(outDir), true);
    assert.equal(existsSync(join(docBuildDir, "lakefile.toml")), true);
    assert.deepEqual(commands, [
      "lake build",
      "lake update",
      "lake build doc-gen4",
      `lake env doc-gen4 single --build ${outDir} MockProject api-docs.db vscode://file/${join(root, "MockProject.lean")}`,
      `lake env doc-gen4 single --build ${outDir} MockProject.Core api-docs.db vscode://file/${join(root, "MockProject", "Core.lean")}`,
      `lake env doc-gen4 fromDb --build ${outDir} ${dbPath} MockProject`,
    ]);
    assert.deepEqual(logs, ["Building Mock Project", "Building doc-gen4", "Running doc-gen"]);
  });
});
