# Lean View Architecture

## Overview

Lean View is distributed as an npm package with a `lean-view` binary. The binary
generates a static site from a doc-gen4 SQLite database and local Lean source
files. The generated site can be opened through any static web server and does
not require a backend after generation.

```text
doc-gen4 api-docs.db + local .lean files
        |
        v
lean-view CLI
        |
        +-- copies static frontend assets
        +-- writes data/index.json
        v
static browser directory
```

## Package Layout

- `src/cli.ts`: command-line entry point used by `npx lean-view`.
- `src/cli-options.ts`: command-line option parsing and doc-gen database path
  resolution.
- `src/server.ts`: optional Node.js static file server used by `--server` and
  `--open`.
- `src/site.ts`: static site generation orchestration.
- `src/extract.ts`: doc-gen4 database reader and source augmentation logic.
- `static/`: browser application assets copied into every generated site.
- `examples/mock-lean/`: synthetic Lean project and doc-gen fixture generator
  used for demos and integration-style tests.
- `docs/`: project design and architecture notes.

## Data Extraction

The extractor shells out to `sqlite3 -json` and reads doc-gen4 tables for:

- modules and source URLs,
- module import relationships,
- declaration names, kinds, and ranges,
- declaration doc strings,
- module docs,
- declaration attributes.

The extractor filters modules to `--local-root` so a project can avoid generating
or displaying all of Mathlib, Std, Lean, or Lake.

After reading the database, Lean View reopens local source files under
`--repo-root` to recover source snippets, module docs, declaration doc strings,
and ordinary leading comments. Source snippets are used for the main definition
cards because they preserve the form the developer expects to read.

## Static Data Contract

The CLI writes `data/index.json` with:

- project metadata,
- module records keyed by module name,
- declarations keyed by full declaration name,
- source-order arrays for modules and declarations,
- related-theorem groups,
- a module import graph.

The frontend is intentionally static and fetches only `data/index.json`.

## CLI Path Conventions

`--doc-gen` accepts a path to `api-docs.db`, a directory containing
`api-docs.db`, or common docbuild/doc-gen output directories containing the
database. When omitted, Lean View looks under `.lean-view/doc-gen/api-docs.db`.

`--out` controls the generated static site directory. When omitted, Lean View
writes to `.lean-view/site`.

`--server` starts the built-in Node.js static server for the generated site.
`--port 0` is the default and asks the OS for a random available port. `--open`
implies `--server` and opens the generated URL with the system browser.

## Frontend

The frontend is a dependency-free browser application in `static/app.js` and
`static/styles.css`. It uses hash routes:

- `#/module/<module>` for file browsing,
- `#/decl/<declaration>` for legacy declaration detail pages,
- `#/search?...` for full-screen declaration search,
- `#/graph` for the import graph.

The module route is the main workflow. It renders a file explorer, definition
cards, and a contextual right pane without requiring additional network calls.

## Mock Fixture

The repository no longer depends on a private `tests/graphql-lean` submodule.
`examples/mock-lean/` contains a sizable synthetic Lean source tree with many
files, imports, namespaces, structures, inductives, definitions, and theorems.
`examples/mock-lean/create-docgen-db.mjs` creates a deterministic SQLite
database with the subset of doc-gen tables consumed by the extractor.

## Publishing

The npm package publishes compiled JavaScript under `dist/`, static frontend
assets under `static/`, and documentation under `docs/`. The package has no
runtime npm dependencies; Node.js and a system `sqlite3` executable are the
runtime requirements.

`npm pack` runs the build and test suite through the `prepack` script so the
published tarball contains compiled CLI files and verified frontend assets.
