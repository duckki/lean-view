# lean-view

`lean-view` is a static declaration browser for Lean 4 projects. It reads a
doc-gen4 `api-docs.db`, augments the indexed declarations with local source
snippets and comments, and writes a self-contained static web UI.

The recommended way to generate and browse a project locally is:

```sh
npx lean-view --server
```

To also open that served URL in the system browser:

```sh
npx lean-view --open
```

## Requirements

- Node.js 20 or newer.
- `sqlite3` on `PATH`.
- `lake` on `PATH` when `--doc-gen` is not supplied. A normal Lean 4
  installation through `elan` includes Lake.
- Network access to fetch `doc-gen4` the first time implicit doc-gen generation
  runs.
- Or, an existing doc-gen4 SQLite database for the project, supplied through
  `--doc-gen`.

When no doc-gen database is supplied, `lean-view` creates a generated
`.lean-view/docbuild` Lake workspace that depends on `doc-gen4` and the target
project, then uses that workspace to build a project-only doc-gen database.

## CLI

Common options:

- `--doc-gen <path>`: existing doc-gen output directory, database directory,
  docbuild directory, or path to `api-docs.db`. When omitted, `lean-view` runs
  project-only doc-gen generation under `.lean-view/doc-gen`.
- `--root-module <module>`: root module namespace to include, such as
  `MyProject`. If a Lake file can be parsed, the first `lean_lib` name is
  used. If no `lean_lib` is found, this option is used as a fallback, then the
  Lake directory name, then the current directory name.
- `--repo-root <path>`: project root used to read `.lean` source files. Defaults
  to the directory containing a discovered `lakefile.toml` or `lakefile.lean`;
  otherwise defaults to the current working directory.
- `--project-name <name>`: display name shown in the browser header. Defaults to
  the Lake package name when available, then this option, then the repo
  directory name.
- `--out <path>`: static site output directory. Defaults to `.lean-view/site`.
- `--server`: serve the generated site with the built-in Node.js static server.
- `--host <host>`: server host. Defaults to `127.0.0.1`.
- `--port <port>`: server port. Defaults to `0`, which asks the OS for a random
  available port.
- `--open`: open the served site in the system browser. Implies `--server`.
- `--dry-run`: print resolved options and planned doc-gen commands without
  building doc-gen or writing the static site.
- `--json`: print machine-readable JSON. With `--server`, the JSON includes
  `serverUrl`.

Use `lean-view doctor` to check the resolved project, Lake metadata, `sqlite3`,
`lake`, and doc-gen database availability:

```sh
npx lean-view doctor
npx lean-view doctor --json
```

When `--doc-gen` is omitted, `lean-view` discovers modules under `--root-module`,
runs `lake build` in the target project, writes
`.lean-view/docbuild/lakefile.toml`, runs `lake update` in that docbuild
workspace, builds the executable with `lake build doc-gen4`, then runs
`lake env doc-gen4 single` and `lake env doc-gen4 fromDb` from the docbuild
workspace. The generated docbuild workspace mirrors the target project's
`lean-toolchain` and pins `doc-gen4` to the matching Lean version tag so
generated `.olean` files are read with the same Lean version.

## Mock demo

This repository includes a synthetic Lean project under `examples/mock-lean/`.
It is checked in as source files, not as a submodule. The mock includes sibling
and nested namespaces, namespace-adjacent comments, plain comments, and
docstrings with varied lengths. Generate its doc-gen-like SQLite fixture and
browse it with:

```sh
node examples/mock-lean/create-docgen-db.mjs .lean-view/doc-gen/api-docs.db
npm run build
node dist/cli.js \
  --repo-root examples/mock-lean \
  --root-module MockProject \
  --doc-gen .lean-view/doc-gen \
  --project-name "Mock Lean" \
  --server
```

## Development

```sh
npm install
npm test
npm pack --dry-run
```

The package intentionally has no runtime npm dependencies. The extractor shells
out to `sqlite3 -json` so it can stay small and easy to run through `npx`.

## Publishing

Publishing is handled by `.github/workflows/publish-npm.yml` on pushes to
`main`, with `package.json` as the source of truth for the release version.
Add an npm automation token as the repository secret `NPM_TOKEN` before running
the workflow.

To release a new version, update `package.json`, commit, and push to `main`.
The workflow reads the version, skips if npm already has that version, otherwise
runs the test suite, publishes with npm provenance enabled, and creates the
matching GitHub Release tag such as `v0.1.1`.
