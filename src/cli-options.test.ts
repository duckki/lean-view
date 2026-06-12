import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { parseCliArgs, resolveCliOptions, resolveDocGenDb } from "./cli-options.js";

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
  const resolved = resolveCliOptions(parseCliArgs([]), "/repo");

  assert.equal(resolved.docGenPath, "/repo/.lean-view/doc-gen/api-docs.db");
  assert.equal(resolved.outDir, "/repo/.lean-view/site");
  assert.equal(resolved.host, "127.0.0.1");
  assert.equal(resolved.port, 0);
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
