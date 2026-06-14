import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { test } from "node:test";

import {
  findLakefile,
  parseLakefileMetadata,
  parseCliArgs,
  resolveCliOptions,
  resolveDocGenDb,
} from "./cli-options.js";

function withTempDir(fn: (root: string) => void): void {
  const root = mkdtempSync("/tmp/lean-view-cli-");
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("parses new CLI options and boolean server flags", () => {
  const parsed = parseCliArgs([
    "--doc-gen",
    "docbuild",
    "--out",
    "public",
    "--local-root",
    "MockProject",
    "--project-name",
    "Mock Lean",
    "--server",
    "--host",
    "0.0.0.0",
    "--port",
    "8765",
  ]);

  assert.deepEqual(parsed, {
    docGen: "docbuild",
    out: "public",
    localRoot: "MockProject",
    projectName: "Mock Lean",
    server: true,
    host: "0.0.0.0",
    port: 8765,
    open: false,
    help: false,
  });
});

test("open implies server and db remains a compatibility alias for doc-gen", () => {
  const parsed = parseCliArgs(["--db", "legacy/api-docs.db", "--open"]);
  const resolved = resolveCliOptions(parsed, "/repo");

  assert.equal(resolved.server, true);
  assert.equal(resolved.open, true);
  assert.equal(resolved.docGenPath, "/repo/legacy/api-docs.db");
});

test("defaults doc-gen and out paths under .lean-view", () => {
  const resolved = resolveCliOptions(parseCliArgs([]), "/CurrentProject");

  assert.equal(resolved.localRoot, "CurrentProject");
  assert.equal(resolved.projectName, "CurrentProject");
  assert.equal(resolved.docGenPath, "/CurrentProject/.lean-view/doc-gen/api-docs.db");
  assert.equal(resolved.docGenOutputDir, "/CurrentProject/.lean-view/doc-gen");
  assert.equal(resolved.docBuildDir, "/CurrentProject/.lean-view/docbuild");
  assert.equal(resolved.generateDocGen, true);
  assert.equal(resolved.outDir, "/CurrentProject/.lean-view/site");
  assert.equal(resolved.host, "127.0.0.1");
  assert.equal(resolved.port, 0);
});

test("does not generate doc-gen when doc-gen or db is explicitly provided", () => {
  assert.equal(resolveCliOptions(parseCliArgs(["--doc-gen", "docbuild"]), "/repo").generateDocGen, false);
  assert.equal(resolveCliOptions(parseCliArgs(["--db", "api-docs.db"]), "/repo").generateDocGen, false);
});

test("derives repo root, local root, and project name from ancestor lakefile.toml", () => {
  withTempDir((root) => {
    const project = join(root, "workspace");
    const nested = join(project, "src", "feature");
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(project, "lakefile.toml"),
      [
        'name = "mock-analytics"',
        'defaultTargets = ["MockProject"]',
        "",
        "[[lean_lib]]",
        'name = "MockProject"',
        "",
      ].join("\n"),
      "utf8",
    );

    assert.equal(findLakefile(nested), join(project, "lakefile.toml"));
    const resolved = resolveCliOptions(parseCliArgs(["--local-root", "Fallback", "--project-name", "Fallback Name"]), nested);

    assert.equal(resolved.repoRoot, project);
    assert.equal(resolved.localRoot, "MockProject");
    assert.equal(resolved.projectName, "mock-analytics");
    assert.equal(resolved.packageName, "mock-analytics");
    assert.equal(resolved.docGenPath, join(project, ".lean-view", "doc-gen", "api-docs.db"));
  });
});

test("derives project metadata from lakefile.lean", () => {
  assert.deepEqual(
    parseLakefileMetadata(
      [
        'package "mock-service" where',
        "",
        "lean_lib MockService where",
        "",
      ].join("\n"),
    ),
    { projectName: "mock-service", localRoot: "MockService" },
  );
});

test("uses local root and project name options as fallback when lakefile metadata is unavailable", () => {
  withTempDir((root) => {
    writeFileSync(join(root, "lakefile.toml"), 'version = "0.1.0"\n', "utf8");

    const resolved = resolveCliOptions(
      parseCliArgs(["--local-root", "FallbackRoot", "--project-name", "Fallback Name"]),
      root,
    );

    assert.equal(resolved.localRoot, "FallbackRoot");
    assert.equal(resolved.projectName, "Fallback Name");
    assert.equal(resolved.packageName, basename(root));
  });
});

test("falls back to the Lake directory name for local root when options are absent", () => {
  withTempDir((root) => {
    const project = join(root, "CurrentProject");
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "lakefile.toml"), 'version = "0.1.0"\n', "utf8");

    const resolved = resolveCliOptions(parseCliArgs([]), project);

    assert.equal(resolved.repoRoot, project);
    assert.equal(resolved.localRoot, "CurrentProject");
    assert.equal(resolved.projectName, "CurrentProject");
  });
});

test("resolves doc-gen file, database directory, and docbuild directory inputs", () => {
  withTempDir((root) => {
    const filePath = join(root, "explicit.db");
    writeFileSync(filePath, "", "utf8");
    assert.equal(resolveDocGenDb(filePath, root), filePath);

    const dbDir = join(root, "db-dir");
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(join(dbDir, "api-docs.db"), "", "utf8");
    assert.equal(resolveDocGenDb(dbDir, root), join(dbDir, "api-docs.db"));

    const docbuild = join(root, "docbuild");
    mkdirSync(join(docbuild, ".lake", "build", "doc", "DocGen4"), { recursive: true });
    writeFileSync(join(docbuild, ".lake", "build", "doc", "DocGen4", "api-docs.db"), "", "utf8");
    assert.equal(
      resolveDocGenDb(docbuild, root),
      join(docbuild, ".lake", "build", "doc", "DocGen4", "api-docs.db"),
    );

    assert.equal(resolveDocGenDb("missing-dir", root), resolve(root, "missing-dir", "api-docs.db"));
  });
});
