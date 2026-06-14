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
- `src/doc-gen.ts`: project-local Lean module discovery and doc-gen4 command
  orchestration when the CLI needs to generate its own database.
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
ordinary leading comments, and namespace-adjacent comments. Source snippets are
used for the main definition cards because they preserve the form the developer
expects to read.

## Static Data Contract

The CLI writes `data/index.json` with:

- project metadata,
- module records keyed by module name,
- declarations keyed by full declaration name,
- source-order arrays for modules and declarations,
- related-theorem groups,
- a module import graph.

Each module record can include `namespaceDocs`, a source-order array of comments
found directly before or after `namespace` lines. Entries include the namespace,
line, placement (`before` or `after`), kind (`doc` or `comment`), and text.

The frontend is intentionally static and fetches only `data/index.json`.

## CLI Path Conventions

At startup the CLI looks for `lakefile.toml` or `lakefile.lean` in the current
directory or an ancestor directory. When found, that directory becomes the
default repo root. Lean View derives the display project name from the Lake
package name and the local root from the first `lean_lib` declaration. The
`--project-name` and `--local-root` options are fallback values when Lake
metadata cannot be found or parsed. If no `lean_lib` is available and no
fallback option is supplied, the local root falls back to the Lake directory name
or, without a Lake file, the current directory name.

`--doc-gen` accepts a path to `api-docs.db`, a directory containing
`api-docs.db`, or common docbuild/doc-gen output directories containing the
database. When omitted, Lean View generates project-only doc-gen output under
`.lean-view/doc-gen` and then reads `.lean-view/doc-gen/api-docs.db`.

Implicit doc-gen generation scans `.lean` files under `--local-root` and orders
parent modules before child modules. It runs `lake build` in the target project,
then writes `.lean-view/docbuild/lakefile.toml` with dependencies on
`doc-gen4` and the target Lake package. The generated docbuild workspace also
copies the target project's `lean-toolchain` and pins `doc-gen4` to the matching
Lean version tag when the toolchain uses the standard `leanprover/lean4:<version>`
form. If that value changes, Lean View clears generated docbuild build artifacts
while preserving fetched packages so Lake cannot reuse `.olean` files built with
an incompatible Lean version. The docbuild workspace runs `lake update`, builds
the executable with `lake build doc-gen4`, then invokes `lake env doc-gen4
single --build <doc-gen-dir> <module> api-docs.db <source-uri>` for each
discovered project module. It finishes with `lake env doc-gen4 fromDb --build
<doc-gen-dir> <db> <local-root>` from the docbuild workspace so the doc-gen
output directory is populated alongside the database.

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

The module route is the main workflow. It renders a file explorer, namespace
notes, definition cards, and a contextual right pane without requiring
additional network calls. Namespace doc comments render as markdown; plain
namespace comments render in monospace.

## Mock Fixture

The repository no longer depends on a private Lean project submodule.
`examples/mock-lean/` contains a sizable synthetic Lean source tree with many
files, imports, sibling and nested namespaces, namespace comments, variable
length doc strings, structures, inductives, definitions, and theorems.
`examples/mock-lean/create-docgen-db.mjs` creates a deterministic SQLite
database with the subset of doc-gen tables consumed by the extractor.

## Publishing

The npm package publishes compiled JavaScript under `dist/`, static frontend
assets under `static/`, and documentation under `docs/`. The package has no
runtime npm dependencies; Node.js and a system `sqlite3` executable are the
runtime requirements when reading an existing doc-gen database. Implicit doc-gen
generation also requires `lake` on `PATH`, a Lake project, and network access
the first time the generated docbuild workspace fetches `doc-gen4`. A normal
Lean 4 installation through `elan` includes Lake.

`npm pack` runs the build and test suite through the `prepack` script so the
published tarball contains compiled CLI files and verified frontend assets.
