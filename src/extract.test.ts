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
  readNamespaceDocs,
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
  assert.equal(moduleNameToRelativePath("MockProject.DataModel.Store"), "MockProject/DataModel/Store.lean");
  assert.equal(shortName("MockProject.DataModel.FieldAccess.eqBool"), "eqBool");
  assert.equal(namespaceName("MockProject.DataModel.FieldAccess.eqBool"), "MockProject.DataModel.FieldAccess");
  assert.equal(displayGroup("MockProject.NormalForm.GroundTypeNormalization.Semantics"), "proof");
  assert.equal(
    formatSourceLocation({ sourcePath: "MockProject/DataModel.lean", line: 22 }),
    "MockProject/DataModel.lean:22",
  );
});

test("finds current source declaration and ignores generated projections", () => {
  withTempRepo((repoRoot) => {
    writeModule(repoRoot, "MockProject.Example", [
      "namespace MockProject",
      "-- First definition.",
      "def first : Nat :=",
      "  1 +",
      "  2",
      "",
      "structure Box where",
      "  value : Nat",
      "deriving Repr",
    ]);

    const match = findDeclarationSource(repoRoot, "MockProject.Example", "MockProject.first", "definition");

    assert.ok(match);
    if (!match) throw new Error("expected declaration source match");
    assert.equal(match.startLine, 3);
    assert.equal(match.source, "def first : Nat :=\n  1 +\n  2");
    assert.equal(
      findDeclarationSource(repoRoot, "MockProject.Example", "MockProject.Box.value", "definition"),
      null,
    );
  });
});

test("matches declarations with dotted local names", () => {
  withTempRepo((repoRoot) => {
    writeModule(repoRoot, "MockProject.Schema", [
      "namespace MockProject.Schema",
      "",
      "structure ObjectType where",
      "  fields : List String",
      "",
      "def ObjectType.isEmpty (objectType : ObjectType) : Bool :=",
      "  objectType.fields.isEmpty",
      "",
      "end MockProject.Schema",
    ]);

    const match = findDeclarationSource(
      repoRoot,
      "MockProject.Schema",
      "MockProject.Schema.ObjectType.isEmpty",
      "definition",
    );

    assert.ok(match);
    if (!match) throw new Error("expected declaration source match");
    assert.equal(
      match.source,
      "def ObjectType.isEmpty (objectType : ObjectType) : Bool :=\n  objectType.fields.isEmpty",
    );
  });
});

test("stops declaration source before the next declaration docstring", () => {
  withTempRepo((repoRoot) => {
    writeModule(repoRoot, "MockProject.Schema", [
      "namespace MockProject.Schema",
      "",
      "/-- A field on an object. -/",
      "structure Field where",
      "  name : String",
      "  deriving Repr",
      "",
      "/-- An object with fields. -/",
      "structure ObjectType where",
      "  fields : List Field",
      "  deriving Repr",
      "",
      "end MockProject.Schema",
    ]);

    const match = findDeclarationSource(repoRoot, "MockProject.Schema", "MockProject.Schema.Field", "structure");

    assert.ok(match);
    if (!match) throw new Error("expected declaration source match");
    assert.equal(match.source, "structure Field where\n  name : String\n  deriving Repr");
  });
});

test("stops declaration source before private theorem siblings", () => {
  withTempRepo((repoRoot) => {
    writeModule(repoRoot, "MockProject.Example", [
      "namespace MockProject.Example",
      "",
      "def visible : Nat :=",
      "  1",
      "",
      "private theorem helper : visible = 1 := by",
      "  rfl",
      "",
      "def after : Nat :=",
      "  2",
      "",
      "end MockProject.Example",
    ]);

    const visible = findDeclarationSource(
      repoRoot,
      "MockProject.Example",
      "MockProject.Example.visible",
      "definition",
    );
    const helper = findDeclarationSource(
      repoRoot,
      "MockProject.Example",
      "MockProject.Example.helper",
      "theorem",
    );

    assert.ok(visible);
    assert.ok(helper);
    if (!visible || !helper) throw new Error("expected declaration source matches");
    assert.equal(visible.source, "def visible : Nat :=\n  1");
    assert.equal(helper.source, "private theorem helper : visible = 1 := by\n  rfl");
  });
});

test("stops declaration source before a following namespace block", () => {
  withTempRepo((repoRoot) => {
    writeModule(repoRoot, "MockProject.Example", [
      "namespace MockProject.Example",
      "",
      "def beforeNamespace : Nat :=",
      "  1",
      "",
      "-----------------------------------------------------------------------------------------",
      "-- Separate helper namespace.",
      "-----------------------------------------------------------------------------------------",
      "",
      "namespace Helpers",
      "def helper : Nat :=",
      "  2",
      "end Helpers",
      "",
      "end MockProject.Example",
    ]);

    const match = findDeclarationSource(
      repoRoot,
      "MockProject.Example",
      "MockProject.Example.beforeNamespace",
      "definition",
    );

    assert.ok(match);
    if (!match) throw new Error("expected declaration source match");
    assert.equal(match.source, "def beforeNamespace : Nat :=\n  1");
  });
});

test("cuts definition source before termination_by", () => {
  withTempRepo((repoRoot) => {
    writeModule(repoRoot, "MockProject.Example", [
      "namespace MockProject.Example",
      "",
      "def recursive : Nat -> Nat",
      "  | 0 => 0",
      "  | n + 1 => recursive n",
      "termination_by n => n",
      "",
      "def after : Nat :=",
      "  2",
      "",
      "end MockProject.Example",
    ]);

    const match = findDeclarationSource(
      repoRoot,
      "MockProject.Example",
      "MockProject.Example.recursive",
      "definition",
    );

    assert.ok(match);
    if (!match) throw new Error("expected declaration source match");
    assert.equal(match.source, "def recursive : Nat -> Nat\n  | 0 => 0\n  | n + 1 => recursive n");
  });
});

test("extracts module docs, declaration docstrings, and line comments from source", () => {
  withTempRepo((repoRoot) => {
    writeModule(repoRoot, "MockProject.Example", [
      "/-! Module overview.",
      "",
      "More module detail.",
      "-/",
      "namespace MockProject",
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

    assert.deepEqual(readSourceDocs(repoRoot, "MockProject.Example"), {
      moduleDocMarkdown: "Module overview.\n\nMore module detail.",
    });
    assert.equal(
      readSourceDocstring(repoRoot, "MockProject.Example", 14),
      "Declaration overview.\n\n- First point.",
    );
    assert.equal(readLeadingLineComment(repoRoot, "MockProject.Example", 18), "Ordinary line comment.");
  });
});

test("extracts doc and plain comments around sibling and nested namespaces", () => {
  withTempRepo((repoRoot) => {
    writeModule(repoRoot, "MockProject.Schema", [
      "/-! Module overview. -/",
      "",
      "-- Plain comment before schema namespace.",
      "-- Second plain line.",
      "/-- Doc comment before schema namespace. -/",
      "namespace MockProject.Schema",
      "-- Plain comment after schema namespace.",
      "/--",
      "Doc comment after schema namespace.",
      "Second doc line.",
      "-/",
      "",
      "structure Field where",
      "  name : String",
      "",
      "-- Plain comment before nested namespace.",
      "namespace Validation",
      "/-- Nested namespace doc after the declaration line. -/",
      "def ok : Bool := true",
      "end Validation",
      "",
      "/-- Sibling namespace doc before the declaration line. -/",
      "namespace Rendering",
      "-- Plain comment after sibling namespace.",
      "def label : String := \"field\"",
      "end Rendering",
      "",
      "end MockProject.Schema",
    ]);

    assert.deepEqual(readNamespaceDocs(repoRoot, "MockProject.Schema"), [
      {
        namespace: "MockProject.Schema",
        line: 6,
        placement: "before",
        kind: "comment",
        text: "Plain comment before schema namespace.\nSecond plain line.",
      },
      {
        namespace: "MockProject.Schema",
        line: 6,
        placement: "before",
        kind: "doc",
        text: "Doc comment before schema namespace.",
      },
      {
        namespace: "MockProject.Schema",
        line: 6,
        placement: "after",
        kind: "comment",
        text: "Plain comment after schema namespace.",
      },
      {
        namespace: "MockProject.Schema",
        line: 6,
        placement: "after",
        kind: "doc",
        text: "Doc comment after schema namespace.\nSecond doc line.",
      },
      {
        namespace: "MockProject.Schema.Validation",
        line: 17,
        placement: "before",
        kind: "comment",
        text: "Plain comment before nested namespace.",
      },
      {
        namespace: "MockProject.Schema.Validation",
        line: 17,
        placement: "after",
        kind: "doc",
        text: "Nested namespace doc after the declaration line.",
      },
      {
        namespace: "MockProject.Schema.Rendering",
        line: 23,
        placement: "before",
        kind: "doc",
        text: "Sibling namespace doc before the declaration line.",
      },
      {
        namespace: "MockProject.Schema.Rendering",
        line: 23,
        placement: "after",
        kind: "comment",
        text: "Plain comment after sibling namespace.",
      },
    ]);
  });
});

test("finds theorem statements related to a declaration", () => {
  const current = {
    name: "MockProject.DataModel.FieldAccess",
    shortName: "FieldAccess",
    module: "MockProject.DataModel",
  };
  const groups = relatedGroups(current, [
    {
      name: "MockProject.DataModel.fieldAccess_helper",
      kind: "theorem",
      module: "MockProject.DataModel",
      signatureText: "FieldAccess -> Prop",
    },
    {
      name: "MockProject.DataModel.Store.external_helper",
      kind: "theorem",
      module: "MockProject.DataModel.Store",
      signatureText: "MockProject.DataModel.FieldAccess -> Prop",
    },
    {
      name: "MockProject.DataModel.other_helper",
      kind: "theorem",
      module: "MockProject.DataModel",
      signatureText: "MockProject.DataModel.ObjectPath -> Prop",
    },
  ]);

  assert.equal(groups[0].count, 1);
  assert.equal(groups[0].allModulesCount, 2);
  assert.deepEqual(groups[0].declarations, ["MockProject.DataModel.fieldAccess_helper"]);
});

test("builds local module import graph", () => {
  const graph = buildModuleGraph(
    [
      { name: "MockProject", sourcePath: "MockProject.lean" },
      { name: "MockProject.DataModel", sourcePath: "MockProject/DataModel.lean" },
    ],
    [
      ["MockProject", "MockProject.DataModel"],
      ["MockProject", "Init"],
    ],
  );

  assert.deepEqual(graph.edges, [{ from: "MockProject", to: "MockProject.DataModel" }]);
  assert.deepEqual(graph.nodes.find((node) => node.id === "MockProject.DataModel")?.importedBy, ["MockProject"]);
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
