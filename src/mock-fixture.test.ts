import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { buildPayload } from "./extract.js";

function withTempDir(fn: (root: string) => void): void {
  const root = mkdtempSync("/tmp/lean-view-mock-");
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("mock Lean project generates a doc-gen fixture usable by buildPayload", () => {
  withTempDir((tempRoot) => {
    const repoRoot = resolve("examples/mock-lean");
    const generator = join(repoRoot, "create-docgen-db.mjs");
    const dbPath = join(tempRoot, "api-docs.db");

    assert.equal(existsSync(generator), true);
    const result = spawnSync("node", [generator, dbPath], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);

    const payload = buildPayload(dbPath, repoRoot, {
      localRoot: "MockProject",
      projectName: "Mock Lean",
    }) as {
      moduleOrder: string[];
      declarationOrder: string[];
      modules: Record<string, { docMarkdown: string; declarations: string[] }>;
      declarations: Record<string, { sourceMatched: boolean; leadingComment: string; docMarkdown: string }>;
    };

    assert.ok(payload.moduleOrder.length >= 14);
    assert.ok(payload.declarationOrder.length >= 30);
    assert.ok(payload.moduleOrder.includes("MockProject.Analytics.Events"));
    assert.ok(payload.moduleOrder.includes("MockProject.Proofs.Soundness"));
    assert.equal(payload.modules["MockProject"].docMarkdown.includes("MockProject is a synthetic"), true);
    assert.equal(payload.declarations["MockProject.Analytics.Events.Event"].sourceMatched, true);
    assert.equal(
      payload.declarations["MockProject.Analytics.Events.normalizeEvent"].leadingComment,
      "Ordinary implementation note used by Lean View.",
    );
  });
});
