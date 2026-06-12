import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  buildModuleGraph,
  displayGroup,
  findDeclarationSource,
  formatSourceLocation,
  markdownToText,
  moduleNameToRelativePath,
  namespaceName,
  readLeadingLineComment,
  readSourceDocs,
  readSourceDocstring,
  relatedGroups,
  shortName,
  writePayload,
} from "./extract.js";
import { copyStaticAssets as copyFrontendAssets } from "./site.js";

function withTempRepo(fn: (repoRoot: string) => void): void {
  const repoRoot = mkdtempSync("/tmp/lean-view-ts-");
  try {
    fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

function writeModule(repoRoot: string, moduleName: string, lines: string[]): void {
  const relativePath = moduleNameToRelativePath(moduleName);
  const sourcePath = join(repoRoot, relativePath);
  mkdirSync(sourcePath.split("/").slice(0, -1).join("/"), { recursive: true });
  writeFileSync(sourcePath, `${lines.join("\n")}\n`, "utf8");
}

test("formats module names and source locations", () => {
  assert.equal(moduleNameToRelativePath("GraphQL.DataModel.Store"), "GraphQL/DataModel/Store.lean");
  assert.equal(shortName("GraphQL.DataModel.FieldAccess.eqBool"), "eqBool");
  assert.equal(namespaceName("GraphQL.DataModel.FieldAccess.eqBool"), "GraphQL.DataModel.FieldAccess");
  assert.equal(displayGroup("GraphQL.NormalForm.GroundTypeNormalization.Semantics"), "proof");
  assert.equal(
    formatSourceLocation({ sourcePath: "GraphQL/DataModel.lean", line: 22 }),
    "GraphQL/DataModel.lean:22",
  );
});

test("finds current source declaration and ignores generated projections", () => {
  withTempRepo((repoRoot) => {
    writeModule(repoRoot, "GraphQL.Example", [
      "namespace GraphQL",
      "-- First definition.",
      "def first : Nat :=",
      "  1 +",
      "  2",
      "",
      "structure Box where",
      "  value : Nat",
      "deriving Repr",
    ]);

    const match = findDeclarationSource(repoRoot, "GraphQL.Example", "GraphQL.first", "definition");

    assert.ok(match);
    if (!match) throw new Error("expected declaration source match");
    assert.equal(match.startLine, 3);
    assert.equal(match.source, "def first : Nat :=\n  1 +\n  2");
    assert.equal(
      findDeclarationSource(repoRoot, "GraphQL.Example", "GraphQL.Box.value", "definition"),
      null,
    );
  });
});

test("extracts module docs, declaration docstrings, and line comments from source", () => {
  withTempRepo((repoRoot) => {
    writeModule(repoRoot, "GraphQL.Example", [
      "/-! Module overview.",
      "",
      "More module detail.",
      "-/",
      "namespace GraphQL",
      "",
      "/-! Namespace docs are ignored by this browser. -/",
      "",
      "/--",
      "Declaration overview.",
      "",
      "- First point.",
      "-/",
      "inductive Sample where",
      "  | value",
      "",
      "-- Ordinary line comment.",
      "def sample : Nat := 1",
    ]);

    assert.deepEqual(readSourceDocs(repoRoot, "GraphQL.Example"), {
      moduleDocMarkdown: "Module overview.\n\nMore module detail.",
    });
    assert.equal(
      readSourceDocstring(repoRoot, "GraphQL.Example", 14),
      "Declaration overview.\n\n- First point.",
    );
    assert.equal(readLeadingLineComment(repoRoot, "GraphQL.Example", 18), "Ordinary line comment.");
  });
});

test("finds theorem statements related to a declaration", () => {
  const current = {
    name: "GraphQL.DataModel.FieldAccess",
    shortName: "FieldAccess",
    module: "GraphQL.DataModel",
  };
  const groups = relatedGroups(current, [
    {
      name: "GraphQL.DataModel.fieldAccess_helper",
      kind: "theorem",
      module: "GraphQL.DataModel",
      signatureText: "FieldAccess -> Prop",
    },
    {
      name: "GraphQL.DataModel.Store.external_helper",
      kind: "theorem",
      module: "GraphQL.DataModel.Store",
      signatureText: "GraphQL.DataModel.FieldAccess -> Prop",
    },
    {
      name: "GraphQL.DataModel.other_helper",
      kind: "theorem",
      module: "GraphQL.DataModel",
      signatureText: "GraphQL.DataModel.ObjectPath -> Prop",
    },
  ]);

  assert.equal(groups[0].count, 1);
  assert.equal(groups[0].allModulesCount, 2);
  assert.deepEqual(groups[0].declarations, ["GraphQL.DataModel.fieldAccess_helper"]);
});

test("builds local module import graph", () => {
  const graph = buildModuleGraph(
    [
      { name: "GraphQL", sourcePath: "GraphQL.lean" },
      { name: "GraphQL.DataModel", sourcePath: "GraphQL/DataModel.lean" },
    ],
    [
      ["GraphQL", "GraphQL.DataModel"],
      ["GraphQL", "Init"],
    ],
  );

  assert.deepEqual(graph.edges, [{ from: "GraphQL", to: "GraphQL.DataModel" }]);
  assert.deepEqual(graph.nodes.find((node) => node.id === "GraphQL.DataModel")?.importedBy, ["GraphQL"]);
});

test("turns markdown into search text", () => {
  assert.equal(markdownToText("Use `Value` **here**."), "Use Value **here**.");
});

test("writes JSON with escaped non-ASCII characters for stable diffs", () => {
  withTempRepo((repoRoot) => {
    const outputPath = join(repoRoot, "data.json");

    writePayload({ symbol: "∀ argument ∧ value" }, outputPath);

    assert.equal(
      readFileSync(outputPath, "utf8"),
      '{\n  "symbol": "\\u2200 argument \\u2227 value"\n}\n',
    );
  });
});

test("copies static frontend assets into the generated site directory", () => {
  withTempRepo((repoRoot) => {
    const packageRoot = join(repoRoot, "pkg");
    const staticRoot = join(packageRoot, "static");
    const outDir = join(repoRoot, "out");
    mkdirSync(staticRoot, { recursive: true });
    writeFileSync(join(staticRoot, "index.html"), "index", "utf8");
    writeFileSync(join(staticRoot, "app.js"), "app", "utf8");
    writeFileSync(join(staticRoot, "styles.css"), "styles", "utf8");

    copyFrontendAssets(packageRoot, outDir);

    assert.equal(readFileSync(join(outDir, "index.html"), "utf8"), "index");
    assert.equal(readFileSync(join(outDir, "app.js"), "utf8"), "app");
    assert.equal(readFileSync(join(outDir, "styles.css"), "utf8"), "styles");
  });
});
