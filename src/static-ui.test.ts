import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function cssRule(stylesCss: string, selector: string): string {
  const selectorIndex = stylesCss.indexOf(`${selector} {`);
  if (selectorIndex < 0) return "";
  const blockStart = stylesCss.indexOf("{", selectorIndex);
  const blockEnd = stylesCss.indexOf("}", blockStart);
  return stylesCss.slice(blockStart + 1, blockEnd);
}

test("namespace notes render without source-location metadata", () => {
  const appJs = readFileSync("static/app.js", "utf8");
  const stylesCss = readFileSync("static/styles.css", "utf8");
  const namespaceNoteFunction = appJs.match(/function namespaceNote\(note\) \{[\s\S]*?\n\}/)?.[0] || "";

  assert.ok(namespaceNoteFunction !== "");
  assert.equal(namespaceNoteFunction.includes("namespace ${escapeHtml(note.namespace)}"), false);
  assert.equal(namespaceNoteFunction.includes("escapeHtml(note.placement)"), false);
  assert.equal(namespaceNoteFunction.includes("escapeHtml(note.line)"), false);
  assert.equal(namespaceNoteFunction.includes('<pre class="namespace-comment">'), true);
  assert.equal(stylesCss.includes(".namespace-note + .namespace-note"), true);
  assert.equal(stylesCss.includes("border-top: 1px solid var(--border);"), true);
});

test("module page typography and file explorer icon stay compact", () => {
  const appJs = readFileSync("static/app.js", "utf8");
  const stylesCss = readFileSync("static/styles.css", "utf8");
  const moduleTitleRule = cssRule(stylesCss, ".module-header h1");
  const sourceActionRule = cssRule(stylesCss, ".source-actions .button,\n.source-actions button");
  const namespaceTitleRule = cssRule(stylesCss, ".definition-section h2");
  const relatedRowRule = cssRule(stylesCss, ".related-panel .related-row");

  assert.equal(appJs.includes('<span class="tree-file-icon" aria-hidden="true">&forall;</span>'), true);
  assert.equal(moduleTitleRule.includes("font-size: 22px;"), true);
  assert.equal(sourceActionRule.includes("font-size: 13px;"), true);
  assert.equal(namespaceTitleRule.includes("font-size: 14px;"), true);
  assert.equal(relatedRowRule.includes("font-size: 12px;"), true);
});

test("app shell title, branding, and initial folder state are configured", () => {
  const appJs = readFileSync("static/app.js", "utf8");
  const stylesCss = readFileSync("static/styles.css", "utf8");
  const brandTitleRule = cssRule(stylesCss, ".brand-title");
  const brandProjectRule = cssRule(stylesCss, ".brand-project");
  const brandSuffixRule = cssRule(stylesCss, ".brand-suffix");

  assert.equal(appJs.includes("document.title = `${data.project.name} - Lean View`;"), true);
  assert.equal(appJs.includes('<span class="brand-project">${escapeHtml(data.project.name)}</span>'), true);
  assert.equal(appJs.includes('<span class="brand-suffix">declarations</span>'), true);
  assert.equal(appJs.includes("initializeCollapsedFolders();"), true);
  assert.equal(appJs.includes("if (depth > 0) collapsedFolders.add(folder.key);"), true);
  assert.equal(brandTitleRule.includes("font-weight: 400;"), true);
  assert.equal(brandProjectRule.includes("font-family: inherit;"), true);
  assert.equal(brandProjectRule.includes("font-weight: 700;"), true);
  assert.equal(brandProjectRule.includes("color: var(--text);"), true);
  assert.equal(brandSuffixRule.includes("color: var(--muted);"), true);
  assert.equal(brandSuffixRule.includes("font-weight: 400;"), true);
});
