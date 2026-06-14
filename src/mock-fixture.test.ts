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
      modules: Record<
        string,
        {
          docMarkdown: string;
          declarations: string[];
          namespaceDocs: Array<{ namespace: string; kind: string; placement: string; text: string }>;
        }
      >;
      declarations: Record<
        string,
        { sourceMatched: boolean; leadingComment: string; docMarkdown: string; signatureText: string }
      >;
    };

    assert.ok(payload.moduleOrder.length >= 14);
    assert.ok(payload.declarationOrder.length >= 29);
    assert.ok(payload.moduleOrder.includes("MockProject.Analytics.Events"));
    assert.ok(payload.moduleOrder.includes("MockProject.Proofs.Soundness"));
    assert.equal(payload.modules["MockProject"].docMarkdown.includes("MockProject is a synthetic"), true);
    assert.equal(payload.declarations["MockProject.Analytics.Events.Event"].sourceMatched, true);
    assert.equal(
      payload.declarations["MockProject.Analytics.Events.normalizeEvent"].leadingComment,
      "Ordinary implementation note used by Lean View.",
    );
    assert.deepEqual(payload.modules["MockProject.Schema"].declarations, [
      "MockProject.Schema.Field",
      "MockProject.Schema.ObjectType",
      "MockProject.Schema.ObjectType.isEmpty",
      "MockProject.Schema.ObjectType.fieldCount",
      "MockProject.Schema.Validation.validateObject",
      "MockProject.Schema.Rendering.label",
    ]);
    assert.equal(payload.declarations["MockProject.Schema.ObjectType"].sourceMatched, true);
    assert.equal(payload.declarations["MockProject.Schema.ObjectType.isEmpty"].sourceMatched, true);
    assert.equal(payload.declarations["MockProject.Schema.Validation.validateObject"].sourceMatched, true);
    assert.equal(payload.declarations["MockProject.Schema.Rendering.label"].sourceMatched, true);
    assert.equal(
      payload.declarations["MockProject.Schema.ObjectType.fieldCount"].leadingComment,
      "Plain declaration comment before a helper definition.\nIt should render in monospace on definition cards.",
    );
    assert.equal(payload.declarations["MockProject.Schema.Validation.validateObject"].docMarkdown.split("\n").length, 10);
    assert.equal(
      payload.declarations["MockProject.Schema.Field"].signatureText.includes("A schema object with a flat field list"),
      false,
    );
    assert.deepEqual(
      payload.modules["MockProject.Schema"].namespaceDocs.map((doc) => ({
        namespace: doc.namespace,
        kind: doc.kind,
        placement: doc.placement,
      })),
      [
        { namespace: "MockProject.Schema", kind: "comment", placement: "before" },
        { namespace: "MockProject.Schema", kind: "doc", placement: "after" },
        { namespace: "MockProject.Schema.Validation", kind: "comment", placement: "before" },
        { namespace: "MockProject.Schema.Validation", kind: "doc", placement: "after" },
        { namespace: "MockProject.Schema.Rendering", kind: "doc", placement: "before" },
        { namespace: "MockProject.Schema.Rendering", kind: "comment", placement: "after" },
      ],
    );
    assert.equal(
      payload.modules["MockProject.Schema"].namespaceDocs.some((doc) =>
        doc.text.includes("plain namespace note before the root schema namespace")
      ),
      true,
    );
  });
});
