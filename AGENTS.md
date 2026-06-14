# Repo Agent Memory

This repo is an npm package for a static Lean 4 declaration browser. It reads a
doc-gen4 SQLite database plus local Lean source files, then writes a
self-contained static site.

## Repository Layout

- `src/cli.ts`: CLI entry point for the `lean-view` binary. It parses arguments,
  resolves paths, and calls site generation.
- `src/site.ts`: static site generation orchestration. It copies the browser
  assets and writes `data/index.json`.
- `src/extract.ts`: core doc-gen4 SQLite extraction, local Lean source
  augmentation, namespace-adjacent comment extraction, related-theorem grouping,
  module graph construction, and stable JSON writing.
- `src/extract.test.ts`: Node test coverage for extraction helpers, source
  augmentation, graph filtering, JSON stability, and static asset copying.
- `src/cli-options.ts`: CLI parsing and doc-gen database path resolution.
  It also discovers `lakefile.toml` / `lakefile.lean` in the current directory
  or ancestors, derives the repo root, package display name, and first
  `lean_lib` local root, and treats `--project-name` / `--local-root` as
  fallbacks.
- `src/doc-gen.ts`: module discovery plus the `lake build` / `doc-gen4 single`
  / `doc-gen4 fromDb` command sequence used when no `--doc-gen` or `--db` input
  is supplied. It writes a generated `.lean-view/docbuild/lakefile.toml` that
  depends on `doc-gen4` and the target Lake package, then runs `doc-gen4` from
  that docbuild workspace. The docbuild workspace must copy the target
  project's `lean-toolchain` and pin `doc-gen4` to the matching Lean version tag
  when the toolchain is in `leanprover/lean4:<version>` form. If the copied value
  changes, clear generated docbuild build artifacts so `doc-gen4` cannot read
  incompatible `.olean` files. Keep `lake build doc-gen4` before the first
  `lake env doc-gen4 ...` invocation; otherwise the executable may not exist.
- `src/server.ts`: optional Node.js static server for generated sites.
- `static/`: dependency-free browser UI copied into every generated site. The
  frontend fetches only `data/index.json` and uses hash routes.
- `docs/design.md`: product and UX requirements. The module view is the primary
  workflow; search and graph are full-screen workflows.
- `docs/architecture.md`: package layout, data flow, static data contract, and
  publishing notes.
- `examples/mock-lean/`: checked-in synthetic Lean project for demos and tests.
  Its `create-docgen-db.mjs` script generates the doc-gen-like SQLite fixture
  consumed by integration-style tests.
- `dist/`: generated TypeScript build output. It is ignored locally, but the npm
  package publishes compiled files from this directory.

## Architecture Notes

- Runtime requirements are Node.js 20 or newer, `sqlite3` on `PATH`, and a
  project-only doc-gen4 `api-docs.db`.
- The package intentionally has no runtime npm dependencies. TypeScript is a
  development dependency only.
- CLI inputs are `--doc-gen`, `--local-root`, optional `--repo-root`, optional
  `--project-name`, optional `--out`, optional `--server`, optional `--host`,
  optional `--port`, and optional `--open`. `--db` remains a compatibility alias
  for `--doc-gen`.
- Default generated paths live under `.lean-view/`: `.lean-view/doc-gen` for
  doc-gen database lookup and `.lean-view/site` for static HTML output.
- By default, `repoRoot`, `projectName`, and `localRoot` come from the nearest
  ancestor Lake file. User-supplied `--project-name` and `--local-root` only
  fill gaps when that metadata is absent or unparsable. If no `lean_lib` is
  parsed and no fallback option is supplied, `localRoot` falls back to the Lake
  directory name, then the current directory name.
- If neither `--doc-gen` nor `--db` is supplied, the CLI runs project-only
  doc-gen generation before writing the static site. That path assumes `lake` is
  available and may need network access to fetch `doc-gen4` into the generated
  docbuild workspace. The generated docbuild workspace mirrors the target
  project's `lean-toolchain` to avoid incompatible `.olean` headers.
- `buildPayload` is the main static data contract producer. If its JSON shape
  changes, update `docs/architecture.md`, frontend reads in `static/app.js`, and
  focused tests in `src/extract.test.ts`.
- Local source augmentation maps Lean module names to `.lean` paths under
  `--repo-root`; source snippets are preferred over doc-gen ranges for the
  definition cards.
- Module records include `namespaceDocs` for comments placed directly before or
  after `namespace` lines. Doc comments render as markdown; plain comments render
  with monospace styling.

## Testing Infrastructure

- Primary check: `npm test`. It runs `npm run build --silent` and then
  `node --test dist/*.test.js`.
- Build-only check: `npm run build`.
- Publish packaging check: `npm pack`; the `prepack` script runs the test suite.
- Current tests cover extractor/source helpers, namespace-adjacent comment
  extraction, implicit doc-gen command planning, CLI option/path resolution,
  static server path handling, mock fixture database generation, graph
  filtering, JSON stability, and static asset copying. There are no browser/UI
  integration tests yet.
