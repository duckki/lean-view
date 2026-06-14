"use strict";

const DATA_URL = "data/index.json?v=20260613-brand-title";
const app = document.getElementById("app");

let data = null;
let state = {
  route: "decl",
  id: "",
  query: "",
  scope: "all",
  selectedGraphModule: "",
  selectedDefinitionName: "",
};

const collapsedFolders = new Set();
let collapsedFoldersInitialized = false;
const BASIC_DEFINITION_KINDS = new Set(["definition", "inductive", "structure", "class"]);
const LEAN_KEYWORDS = new Set([
  "abbrev",
  "axiom",
  "by",
  "class",
  "def",
  "deriving",
  "else",
  "end",
  "example",
  "false",
  "forall",
  "fun",
  "have",
  "if",
  "import",
  "in",
  "inductive",
  "instance",
  "let",
  "match",
  "mutual",
  "namespace",
  "opaque",
  "open",
  "Prop",
  "rfl",
  "some",
  "structure",
  "theorem",
  "then",
  "true",
  "Type",
  "where",
  "with",
]);
const LEAN_DECLARATION_KEYWORDS = new Set([
  "abbrev",
  "class",
  "def",
  "inductive",
  "instance",
  "opaque",
  "structure",
  "theorem",
]);

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const encodeRoute = (value) => encodeURIComponent(value);
const decodeRoute = (value) => decodeURIComponent(value || "");

function routeHash(route, id = "") {
  if (route === "decl") return `#/decl/${encodeRoute(id)}`;
  if (route === "module") return `#/module/${encodeRoute(id)}`;
  if (route === "search") return `#/search?query=${encodeRoute(id)}&scope=all`;
  if (route === "graph") return "#/graph";
  return "#/";
}

function parseHash() {
  const hash = window.location.hash || "";
  if (hash.startsWith("#/decl/")) {
    return { ...state, route: "decl", id: decodeRoute(hash.slice(7)) };
  }
  if (hash.startsWith("#/module/")) {
    return { ...state, route: "module", id: decodeRoute(hash.slice(9)) };
  }
  if (hash.startsWith("#/search")) {
    const params = new URLSearchParams(hash.split("?")[1] || "");
    return {
      ...state,
      route: "search",
      query: params.get("query") || "",
      scope: params.get("scope") || "all",
    };
  }
  if (hash.startsWith("#/graph")) {
    return { ...state, route: "graph" };
  }
  const firstDeclaration = data?.declarationOrder?.[0] || "";
  return { ...state, route: "decl", id: firstDeclaration };
}

function markdown(markdownText) {
  if (!markdownText) return "";
  const inline = (text) =>
    escapeHtml(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const paragraphHtml = (lines) => {
    const parts = [];
    let current = "";
    lines.forEach((line) => {
      if (/ {2}$|\\$/.test(line)) {
        current += `${line.replace(/\\$/, "").trimEnd()}<br>`;
      } else {
        current += `${current && !current.endsWith("<br>") ? " " : ""}${line.trim()}`;
      }
    });
    if (current) parts.push(inline(current).replace(/&lt;br&gt;/g, "<br>"));
    return `<p>${parts.join("")}</p>`;
  };
  const listHtml = (lines) =>
    `<ul>${lines
      .map((line) => `<li>${inline(line.trim().replace(/^-\s+/, ""))}</li>`)
      .join("")}</ul>`;
  const blocks = markdownText.trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      if (block.trim().startsWith("```") && block.trim().endsWith("```")) {
        return `<pre class="signature">${escapeHtml(block.trim().replace(/^```[^\n]*\n?/, "").replace(/```$/, ""))}</pre>`;
      }
      const sections = [];
      let paragraphLines = [];
      let listLines = [];
      const flushParagraph = () => {
        if (paragraphLines.length) sections.push(paragraphHtml(paragraphLines));
        paragraphLines = [];
      };
      const flushList = () => {
        if (listLines.length) sections.push(listHtml(listLines));
        listLines = [];
      };
      lines.forEach((line) => {
        if (/^-\s+/.test(line.trim())) {
          flushParagraph();
          listLines.push(line);
        } else if (listLines.length && line.trim() && /^\s+/.test(line)) {
          listLines[listLines.length - 1] += ` ${line.trim()}`;
        } else {
          flushList();
          paragraphLines.push(line);
        }
      });
      flushParagraph();
      flushList();
      return sections.join("");
    })
    .join("");
}

function highlightLean(source) {
  const escaped = escapeHtml(source || "");
  const pattern =
    /(--.*$)|("(?:\\.|[^"\\])*")|((?<![&#])\b\d+(?:\.\d+)?\b)|((?<![&])\b[A-Za-z_][A-Za-z0-9_?!']*\b)/gm;
  return escaped.replace(pattern, (match, comment, string, number, word) => {
    if (comment) return `<span class="lean-comment">${comment}</span>`;
    if (string) return `<span class="lean-string">${string}</span>`;
    if (number) return `<span class="lean-number">${number}</span>`;
    if (word && LEAN_DECLARATION_KEYWORDS.has(word)) {
      return `<span class="lean-decl-keyword">${word}</span>`;
    }
    if (word && LEAN_KEYWORDS.has(word)) {
      return `<span class="lean-keyword">${word}</span>`;
    }
    return match;
  });
}

function declaration(id) {
  return data.declarations[id] || data.declarations[data.declarationOrder[0]];
}

function currentModule() {
  const decl = state.route === "decl" ? declaration(state.id) : null;
  return decl ? data.modules[decl.module] : data.modules[state.id];
}

function kindBadge(kind) {
  return `<span class="kind ${escapeHtml(kind)}">${escapeHtml(kind || "declaration")}</span>`;
}

function iconSvg(name) {
  if (name === "copy") {
    return `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M5 5h8v8H5z"></path>
        <path d="M3 11H2V2h9v1"></path>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 13h10"></path>
      <path d="M8 3h5v5"></path>
      <path d="M13 3 6 10"></path>
    </svg>
  `;
}

function metadataBox(label, value, actions = {}) {
  const actionButtons = `
    <div class="metadata-actions">
      ${
        actions.open
          ? `<a class="icon-button" href="${escapeHtml(actions.open)}" title="Open in editor" aria-label="Open in editor">${iconSvg("open")}</a>`
          : ""
      }
      ${
        actions.copy
          ? `<button class="icon-button" type="button" data-copy="${escapeHtml(actions.copy)}" title="Copy" aria-label="Copy">${iconSvg("copy")}</button>`
          : ""
      }
    </div>
  `;
  return `
    <div class="metadata-item copyable">
      <div class="metadata-row-head">
        <div class="metadata-label">${escapeHtml(label)}</div>
        ${actionButtons}
      </div>
      <div class="metadata-value">${escapeHtml(value)}</div>
    </div>
  `;
}

function topbar() {
  const moduleCount = data.moduleOrder.length;
  const declarationCount = data.declarationOrder.length;
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-title">
          <span class="brand-project">${escapeHtml(data.project.name)}</span>
          <span class="brand-suffix">declarations</span>
        </div>
        <div class="brand-meta">${moduleCount} files · ${declarationCount} declarations</div>
      </div>
      <form class="global-search" data-global-search>
        <input name="query" value="${escapeHtml(state.query)}" placeholder="Search names, theorem statements, doc strings">
        <button class="primary" type="submit">Search</button>
      </form>
      <nav class="topbar-actions">
        <a class="button" href="${routeHash("graph")}">Module map</a>
      </nav>
    </header>
  `;
}

function sidebar() {
  const activeModule = currentModule()?.name || "";
  const tree = buildFileTree();

  return `
    <aside class="sidebar">
      <div class="section-title">Files</div>
      <nav class="file-tree" aria-label="Lean files">${renderFileTree(tree, activeModule)}</nav>
    </aside>
  `;
}

function buildFileTree() {
  const root = { folders: Object.create(null), files: [] };
  data.moduleOrder.forEach((moduleName) => {
    const module = data.modules[moduleName];
    const parts = module.sourcePath.split("/");
    const fileName = parts.pop();
    let node = root;
    let folderKey = "";
    parts.forEach((part) => {
      folderKey = folderKey ? `${folderKey}/${part}` : part;
      node.folders[part] ||= { key: folderKey, name: part, folders: Object.create(null), files: [] };
      node = node.folders[part];
    });
    node.files.push({ ...module, fileName });
  });
  return root;
}

function initializeCollapsedFolders() {
  if (collapsedFoldersInitialized) return;
  const tree = buildFileTree();
  const walk = (node, depth = 0) => {
    Object.values(node.folders).forEach((folder) => {
      if (depth > 0) collapsedFolders.add(folder.key);
      walk(folder, depth + 1);
    });
  };
  walk(tree);
  collapsedFoldersInitialized = true;
}

function renderFileTree(node, activeModule, depth = 0) {
  const folders = Object.values(node.folders)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((folder) => {
      const collapsed = collapsedFolders.has(folder.key);
      return `
        <div class="tree-folder-group">
          <button class="tree-folder" type="button" data-folder-key="${escapeHtml(folder.key)}" aria-expanded="${!collapsed}" style="--indent:${8 + depth * 14}px">
            <span class="tree-twist">${collapsed ? ">" : "v"}</span>
            <span class="tree-name">${escapeHtml(folder.name)}</span>
          </button>
          ${collapsed ? "" : `<div class="tree-children">${renderFileTree(folder, activeModule, depth + 1)}</div>`}
        </div>
      `;
    })
    .join("");
  const files = node.files
    .sort((left, right) => left.fileName.localeCompare(right.fileName))
    .map((module) => {
      const label = module.fileName.replace(/\.lean$/, "");
      return `
        <a class="tree-file ${module.name === activeModule ? "active" : ""}" href="${routeHash("module", module.name)}" style="--indent:${8 + depth * 14}px">
          <span class="tree-file-icon" aria-hidden="true">&forall;</span>
          <span class="tree-name">${escapeHtml(label)}</span>
        </a>
      `;
    })
    .join("");
  return `${folders}${files}`;
}

function declarationView() {
  const decl = declaration(state.id);
  state.id = decl.name;
  const doc = decl.docMarkdown
    ? `<div class="doc-box markdown">${markdown(decl.docMarkdown)}</div>`
    : `<div class="doc-box empty">No doc string found for this declaration.</div>`;
  const attrs = decl.attributes?.length
    ? `<div class="pill-row">${decl.attributes.map((attr) => `<span class="pill">${escapeHtml(attr)}</span>`).join("")}</div>`
    : `<div class="empty-state">No indexed attributes.</div>`;

  return `
    <main class="content">
      <article>
        <header class="decl-header">
          <div class="eyebrow">
            ${kindBadge(decl.kind)}
            <a href="${routeHash("module", decl.module)}">${escapeHtml(decl.module)}</a>
            <span>${escapeHtml(decl.sourceLocation)}</span>
          </div>
          <h1>${escapeHtml(decl.shortName)}</h1>
          <div class="source-actions">
            <a class="button" href="${escapeHtml(decl.editorLink)}">Open in editor</a>
            <button type="button" data-copy="${escapeHtml(decl.sourceLocation)}">Copy path:line</button>
            <span class="status" data-status></span>
          </div>
        </header>

        <h2>Signature</h2>
        <pre class="signature lean-code">${highlightLean(decl.signatureText || decl.name)}</pre>

        <h2>Doc String</h2>
        ${doc}

        <h2>Metadata</h2>
        <div class="metadata-grid">
          <div class="metadata-item">
            <div class="metadata-label">Full name</div>
            <div class="metadata-value">${escapeHtml(decl.name)}</div>
          </div>
          <div class="metadata-item">
            <div class="metadata-label">Namespace</div>
            <div class="metadata-value">${escapeHtml(decl.namespace || "(root)")}</div>
          </div>
          <div class="metadata-item">
            <div class="metadata-label">Source</div>
            <div class="metadata-value">${escapeHtml(decl.sourceLocation)}</div>
          </div>
        </div>

        <h2>Attributes</h2>
        ${attrs}
      </article>
    </main>
  `;
}

function relatedPanel() {
  const decl = declaration(state.id);
  const groups = data.related[decl.name] || [];
  const group = groups[0] || { declarations: [], count: 0, allModulesCount: 0 };
  const rows = group.declarations
    .slice(0, 32)
    .map((name) => {
      const related = data.declarations[name];
      return `
        <a class="related-row" href="${routeHash("decl", name)}">
          ${escapeHtml(related.shortName)}
          <span class="path">${escapeHtml(related.sourceLocation)}</span>
        </a>
      `;
    })
    .join("");
  const empty = `<div class="empty-state">No current-module theorem statements mention this declaration in the extracted index.</div>`;
  return `
    <aside class="related-panel">
      <div class="section-title">Related Theorems</div>
      <div class="metadata-item">
        <div class="metadata-label">Current module</div>
        <div class="metadata-value">${group.count || 0}</div>
      </div>
      <div class="metadata-item" style="margin-top: 8px;">
        <div class="metadata-label">All modules</div>
        <div class="metadata-value">${group.allModulesCount || 0}</div>
      </div>
      <div class="related-actions">
        <a class="button primary" href="${routeHash("search", decl.shortName)}">Search all modules</a>
      </div>
      <div class="related-list">${rows || empty}</div>
    </aside>
  `;
}

function moduleView() {
  const module = data.modules[state.id] || data.modules[data.moduleOrder[0]];
  state.id = module.name;
  const groups = moduleDefinitionGroups(module);
  const moduleDoc = module.docMarkdown
    ? `<div class="module-doc doc-box markdown compact">${markdown(module.docMarkdown)}</div>`
    : "";

  return `
    <main class="content">
      <article>
        <header class="module-header">
          <h1>${escapeHtml(module.name)}</h1>
          <div class="source-actions">
            <a class="button" href="${escapeHtml(module.editorLink)}">Open in editor</a>
            <button type="button" data-copy="${escapeHtml(module.sourcePath)}">Copy path</button>
            <a class="button" href="${routeHash("graph")}">Open module map</a>
            <span class="status" data-status></span>
          </div>
        </header>
        ${moduleDoc}
        <div class="definition-page">
          ${groups.map((group) => definitionSection(group, module)).join("") || `<div class="empty-state">No basic definitions indexed for this file.</div>`}
        </div>
      </article>
    </main>
  `;
}

function namespaceNotesForGroup(group, module) {
  const notes = (module.namespaceDocs || []).filter((note) => note.namespace === group.namespace);
  if (!notes.length) return "";
  return `
    <div class="namespace-note-list" aria-label="Namespace notes">
      ${notes.map(namespaceNote).join("")}
    </div>
  `;
}

function namespaceNote(note) {
  const body =
    note.kind === "comment"
      ? `<pre class="namespace-comment">${escapeHtml(note.text)}</pre>`
      : `<div class="namespace-doc markdown">${markdown(note.text)}</div>`;
  return `
    <div class="namespace-note ${escapeHtml(note.kind)}">
      ${body}
    </div>
  `;
}

function isBasicDefinition(decl) {
  const signature = (decl.signatureText || "").trim();
  if (!decl.sourceMatched) return false;
  if (!BASIC_DEFINITION_KINDS.has(decl.kind)) return false;
  if (decl.kind === "definition") return signature.startsWith("def ");
  return signature.startsWith(`${decl.kind} `);
}

function moduleDefinitionGroups(module) {
  const definitions = module.declarations
    .map((name) => data.declarations[name])
    .filter(isBasicDefinition)
    .sort((left, right) => left.line - right.line || left.column - right.column);
  const baseNamespace = commonNamespacePrefix(definitions.map((decl) => decl.namespace).filter(Boolean));
  const groups = [];
  const byNamespace = Object.create(null);
  definitions.forEach((decl) => {
    const title = namespaceSectionTitle(baseNamespace, decl);
    if (!byNamespace[title]) {
      byNamespace[title] = {
        title,
        namespace: decl.namespace,
        declarations: [],
      };
      groups.push(byNamespace[title]);
    }
    byNamespace[title].declarations.push(decl);
  });
  return groups;
}

function commonNamespacePrefix(namespaces) {
  if (!namespaces.length) return "";
  const prefix = namespaces[0].split(".");
  namespaces.slice(1).forEach((namespace) => {
    const parts = namespace.split(".");
    while (prefix.length && parts.slice(0, prefix.length).join(".") !== prefix.join(".")) {
      prefix.pop();
    }
  });
  return prefix.join(".");
}

function namespaceSectionTitle(baseNamespace, decl) {
  const namespace = decl.namespace || "(root)";
  if (baseNamespace && namespace === baseNamespace) return "(module)";
  if (baseNamespace && namespace.startsWith(`${baseNamespace}.`)) {
    return namespace.slice(baseNamespace.length + 1);
  }
  return namespace;
}

function definitionSection(group, module) {
  const namespaceNotes = namespaceNotesForGroup(group, module);
  return `
    <section class="definition-section">
      <h2>${escapeHtml(group.title)}</h2>
      ${namespaceNotes}
      <div class="definition-card-list">
        ${group.declarations.map(definitionCard).join("")}
      </div>
    </section>
  `;
}

function definitionCard(decl) {
  const doc = decl.docMarkdown
    ? `<div class="definition-doc markdown">${markdown(decl.docMarkdown)}</div>`
    : "";
  const comment = decl.leadingComment
    ? `<div class="definition-comment">${escapeHtml(decl.leadingComment)}</div>`
    : "";
  const selected = decl.name === state.selectedDefinitionName;
  return `
    <div class="definition-card ${selected ? "selected" : ""}" data-definition-card="${escapeHtml(decl.name)}" tabindex="0" role="button" aria-pressed="${selected}">
      <div class="definition-card-header">
        ${kindBadge(decl.kind)}
        <span class="definition-name">${escapeHtml(decl.shortName)}</span>
      </div>
      ${doc}
      ${comment}
      <pre class="definition-signature lean-code">${highlightLean(decl.signatureText || decl.name)}</pre>
    </div>
  `;
}

function moduleTheoremPanel(module) {
  const theorems = module.declarations
    .map((name) => data.declarations[name])
    .filter((decl) => decl.kind === "theorem");
  const baseNamespace = commonNamespacePrefix(theorems.map((decl) => decl.namespace).filter(Boolean));
  const theoremRows = theorems
    .slice(0, 24)
    .map(
      (decl) => `
        <a class="related-row" href="${routeHash("decl", decl.name)}">
          ${escapeHtml(decl.shortName)}
          <span class="path">${escapeHtml(namespaceSectionTitle(baseNamespace, decl))}</span>
        </a>
      `
    )
    .join("");
  return `
    <aside class="related-panel">
      <div class="section-title">Theorems</div>
      <div class="metadata-item">
        <div class="metadata-label">Current file</div>
        <div class="metadata-value">${theorems.length}</div>
      </div>
      <div class="related-actions">
        <a class="button primary" href="#/search?query=${encodeRoute(module.name)}&scope=theorems">Search file theorems</a>
      </div>
      <div class="related-list">${theoremRows || `<div class="empty-state">No theorems indexed for this file.</div>`}</div>
    </aside>
  `;
}

function selectedDefinitionForModule(module) {
  if (
    state.selectedDefinitionName &&
    module.declarations.includes(state.selectedDefinitionName)
  ) {
    return data.declarations[state.selectedDefinitionName];
  }
  return null;
}

function moduleSidePanel(module) {
  const selected = selectedDefinitionForModule(module);
  if (selected) return definitionInfoPanel(selected);
  return moduleTheoremPanel(module);
}

function definitionInfoPanel(decl) {
  const attrs = decl.attributes?.length
    ? `<div class="pill-row">${decl.attributes.map((attr) => `<span class="pill">${escapeHtml(attr)}</span>`).join("")}</div>`
    : `<div class="empty-state">No indexed attributes.</div>`;
  return `
    <aside class="related-panel">
      <div class="section-title">Selected Definition</div>
      <div class="selected-definition-title">
        <span>${escapeHtml(decl.shortName)}</span>
        ${kindBadge(decl.kind)}
      </div>
      <span class="status side-status" data-status></span>
      ${metadataBox("Full name", decl.name, { copy: decl.name })}
      ${metadataBox("Source", decl.sourceLocation, {
        copy: decl.sourceLocation,
        open: decl.editorLink,
      })}
      ${metadataBox("Namespace", decl.namespace || "(root)", {
        copy: decl.namespace || "(root)",
      })}
      <h3>Attributes</h3>
      ${attrs}
      ${relatedTheoremSection(decl)}
    </aside>
  `;
}

function relatedTheoremSection(decl) {
  const group = (data.related[decl.name] || [])[0] || {
    declarations: [],
    count: 0,
    allModulesCount: 0,
  };
  const rows = group.declarations
    .slice(0, 16)
    .map((name) => {
      const theorem = data.declarations[name];
      return `
        <a class="related-row" href="${routeHash("decl", name)}">
          ${escapeHtml(theorem.shortName)}
          <span class="path">${escapeHtml(theorem.sourceLocation)}</span>
        </a>
      `;
    })
    .join("");
  return `
    <div class="side-section">
      <div class="section-title">Related Theorems</div>
      <div class="metadata-item">
        <div class="metadata-label">Current file</div>
        <div class="metadata-value">${group.count || 0}</div>
      </div>
      <div class="metadata-item">
        <div class="metadata-label">All files</div>
        <div class="metadata-value">${group.allModulesCount || 0}</div>
      </div>
      <div class="related-actions">
        <a class="button primary" href="${routeHash("search", decl.shortName)}">Search all files</a>
      </div>
      <div class="related-list">${rows || `<div class="empty-state">No current-file theorem statements mention this definition.</div>`}</div>
    </div>
  `;
}

function moduleLinkList(names) {
  if (!names?.length) return `<div class="empty-state">None.</div>`;
  return names
    .map((name) => `<a class="module-link" href="${routeHash("module", name)}">${escapeHtml(name)}</a>`)
    .join("");
}

function searchView() {
  const query = state.query.trim();
  const results = searchDeclarations(query, state.scope);
  return `
    <main class="search-panel">
      <header class="search-header">
        <div class="eyebrow"><span class="pill">Full-screen search</span></div>
        <h1>Search declarations</h1>
        <form class="search-controls" data-search-form>
          <input name="query" value="${escapeHtml(query)}" placeholder="Try FieldAccess, conforms, normal form">
          <select name="scope">
            <option value="all" ${state.scope === "all" ? "selected" : ""}>All modules</option>
            <option value="theorems" ${state.scope === "theorems" ? "selected" : ""}>Theorems only</option>
            <option value="docs" ${state.scope === "docs" ? "selected" : ""}>Doc strings</option>
          </select>
        </form>
      </header>
      <div class="section-title">${results.length} results</div>
      <div class="result-list">
        ${results.map(resultRow).join("") || `<div class="empty-state">No matches.</div>`}
      </div>
    </main>
  `;
}

function searchDeclarations(query, scope) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const declarations = data.declarationOrder.map((name) => data.declarations[name]);
  const filtered = declarations.filter((decl) => {
    if (scope === "theorems" && decl.kind !== "theorem") return false;
    const haystack =
      scope === "docs"
        ? `${decl.docText}`.toLowerCase()
        : `${decl.name} ${decl.kind} ${decl.module} ${decl.docText} ${decl.signatureText}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  return filtered.slice(0, 160);
}

function resultRow(decl) {
  const snippet = decl.docText || decl.signatureText || decl.sourceLocation;
  return `
    <a class="result-row" href="${routeHash("decl", decl.name)}">
      <div class="result-title">
        ${kindBadge(decl.kind)}
        <span>${escapeHtml(decl.name)}</span>
      </div>
      <span class="path">${escapeHtml(decl.sourceLocation)}</span>
      <div class="result-snippet">${escapeHtml(snippet).slice(0, 260)}</div>
    </a>
  `;
}

function graphView() {
  const layout = graphLayout();
  const graphWidth = layout.__width;
  const graphHeight = layout.__height;
  const selected = state.selectedGraphModule || currentModule()?.name || "";
  const lines = data.moduleGraph.edges
    .map((edge) => {
      const from = layout[edge.from];
      const to = layout[edge.to];
      if (!from || !to) return "";
      return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#b9c2d0" stroke-width="1.4" marker-end="url(#arrow)" />`;
    })
    .join("");
  const nodes = data.moduleGraph.nodes
    .map((node) => {
      const point = layout[node.id];
      return `
        <a class="graph-node ${node.id === selected ? "selected" : ""}" href="${routeHash("module", node.id)}" style="left:${point.left}px;top:${point.top}px">
          <span class="graph-node-name">${escapeHtml(node.id)}</span>
          <span class="graph-node-meta">${node.imports.length} imports · ${node.importedBy.length} dependents</span>
        </a>
      `;
    })
    .join("");
  return `
    <main class="graph-panel">
      <header class="graph-header">
        <div class="eyebrow"><span class="pill">Import graph</span></div>
        <h1>Module map</h1>
        <div class="graph-toolbar">
          <a class="button" href="${routeHash("module", selected || data.moduleOrder[0])}">Open selected module</a>
          <a class="button" href="${routeHash("search", "")}">Search declarations</a>
        </div>
      </header>
      <section class="graph-canvas" aria-label="Navigable module import graph">
        <div class="graph-inner" style="width:${graphWidth}px;height:${graphHeight}px">
          <svg class="graph-lines" viewBox="0 0 ${graphWidth} ${graphHeight}" preserveAspectRatio="none">
            <defs>
              <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L8,3 z" fill="#b9c2d0"></path>
              </marker>
            </defs>
            ${lines}
          </svg>
          ${nodes}
        </div>
      </section>
    </main>
  `;
}

function graphLayout() {
  const nodes = data.moduleGraph.nodes;
  const depthById = {};
  const importsById = Object.fromEntries(nodes.map((node) => [node.id, node.imports]));
  function depth(id, seen = new Set()) {
    if (depthById[id] !== undefined) return depthById[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    const imports = importsById[id] || [];
    const value = imports.length ? 1 + Math.max(...imports.map((name) => depth(name, seen))) : 0;
    depthById[id] = Math.min(value, 5);
    return depthById[id];
  }
  nodes.forEach((node) => depth(node.id));
  const buckets = {};
  nodes.forEach((node) => {
    const bucket = depthById[node.id] || 0;
    buckets[bucket] ||= [];
    buckets[bucket].push(node.id);
  });
  const layout = {};
  Object.keys(buckets).forEach((bucketKey) => {
    const bucket = Number(bucketKey);
    buckets[bucket].sort().forEach((id, index) => {
      const left = 34 + bucket * 230;
      const top = 34 + index * 76;
      layout[id] = { left, top, x: left + 105, y: top + 25 };
    });
  });
  const points = Object.values(layout);
  layout.__width = Math.max(1320, ...points.map((point) => point.left + 250));
  layout.__height = Math.max(840, ...points.map((point) => point.top + 96));
  return layout;
}

function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const value = key(item) || "declaration";
    groups[value] ||= [];
    groups[value].push(item);
    return groups;
  }, Object.create(null));
}

function render() {
  if (!data) return;
  state = parseHash();
  if (state.route === "search") {
    app.innerHTML = `${topbar()}<div class="workspace full">${searchView()}</div>`;
    bindForms();
    return;
  }
  if (state.route === "graph") {
    app.innerHTML = `${topbar()}<div class="workspace full">${graphView()}</div>`;
    bindForms();
    return;
  }
  const main = state.route === "module" ? moduleView() : declarationView();
  const sidePanel =
    state.route === "module"
      ? moduleSidePanel(data.modules[state.id] || data.modules[data.moduleOrder[0]])
      : relatedPanel();
  app.innerHTML = `${topbar()}<div class="workspace">${sidebar()}${main}${sidePanel}</div>`;
  bindForms();
}

function bindForms() {
  document.querySelectorAll("[data-global-search]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = new FormData(form).get("query") || "";
      window.location.hash = routeHash("search", String(query));
    });
  });
  document.querySelectorAll("[data-search-form]").forEach((form) => {
    form.addEventListener("input", () => {
      const params = new FormData(form);
      state.query = String(params.get("query") || "");
      state.scope = String(params.get("scope") || "all");
      window.history.replaceState(null, "", `#/search?query=${encodeRoute(state.query)}&scope=${encodeRoute(state.scope)}`);
      const results = searchDeclarations(state.query, state.scope);
      const list = document.querySelector(".result-list");
      const title = document.querySelector(".section-title");
      if (title) title.textContent = `${results.length} results`;
      if (list) list.innerHTML = results.map(resultRow).join("") || `<div class="empty-state">No matches.</div>`;
    });
  });
  document.querySelectorAll("[data-folder-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-folder-key");
      if (!key) return;
      if (collapsedFolders.has(key)) {
        collapsedFolders.delete(key);
      } else {
        collapsedFolders.add(key);
      }
      render();
    });
  });
  document.querySelectorAll("[data-definition-card]").forEach((card) => {
    card.addEventListener("click", () => {
      if (window.getSelection()?.toString()) return;
      selectDefinition(card.getAttribute("data-definition-card") || "");
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectDefinition(card.getAttribute("data-definition-card") || "");
    });
  });
}

function selectDefinition(name) {
  state.selectedDefinitionName = name;
  document.querySelectorAll("[data-definition-card]").forEach((card) => {
    const selected = card.getAttribute("data-definition-card") === name;
    card.classList.toggle("selected", selected);
    card.setAttribute("aria-pressed", String(selected));
  });
  const selected = declaration(name);
  const module = data.modules[state.id] || data.modules[selected?.module];
  const panel = document.querySelector(".related-panel");
  if (module && panel) {
    panel.outerHTML = moduleSidePanel(module);
  }
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-copy]");
  if (!target) return;
  const text = target.getAttribute("data-copy") || "";
  try {
    await navigator.clipboard.writeText(text);
    const status = document.querySelector("[data-status]");
    if (status) status.textContent = `Copied ${text}`;
  } catch {
    window.prompt("Copy path", text);
  }
});

window.addEventListener("hashchange", render);

fetch(DATA_URL)
  .then((response) => {
    if (!response.ok) throw new Error(`Failed to load ${DATA_URL}: ${response.status}`);
    return response.json();
  })
  .then((payload) => {
    data = payload;
    document.title = `${data.project.name} - Lean View`;
    initializeCollapsedFolders();
    if (!window.location.hash) {
      window.location.hash = routeHash("module", data.moduleOrder[0]);
      return;
    }
    render();
  })
  .catch((error) => {
    app.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  });
