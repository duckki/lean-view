# lean-view

`lean-view` is a static declaration browser for Lean 4 projects. It reads a
doc-gen4 `api-docs.db`, augments the indexed declarations with local source
snippets and comments, and writes a self-contained static web UI.

```sh
npx lean-view \
  --doc-gen .lean-view/doc-gen \
  --repo-root . \
  --local-root GraphQL \
  --project-name "My Lean Project" \
  --out .lean-view/site
```

Then serve the output directory with any static file server:

```sh
python3 -m http.server 8125 --bind 127.0.0.1 --directory .lean-view/site
```

Or let `lean-view` serve the generated site on a random local port:

```sh
npx lean-view --doc-gen .lean-view/doc-gen --local-root GraphQL --server
```

## Requirements

- Node.js 20 or newer.
- `sqlite3` on `PATH`.
- A doc-gen4 SQLite database generated for the project.

`lean-view` does not run Lean or doc-gen4 yet. It is currently the frontend and
data packaging layer on top of doc-gen4's extracted declaration database.

## CLI

Common options:

- `--doc-gen <path>`: doc-gen output directory, database directory, docbuild
  directory, or path to `api-docs.db`. Defaults to `.lean-view/doc-gen`.
- `--local-root <module>`: local module namespace to include, such as `GraphQL`
  or `MyProject`.
- `--repo-root <path>`: project root used to read `.lean` source files. Defaults
  to the current working directory.
- `--project-name <name>`: display name shown in the browser header. Defaults to
  the current directory name.
- `--out <path>`: static site output directory. Defaults to `.lean-view/site`.
- `--server`: serve the generated site with the built-in Node.js static server.
- `--host <host>`: server host. Defaults to `127.0.0.1`.
- `--port <port>`: server port. Defaults to `0`, which asks the OS for a random
  available port.
- `--open`: open the served site in the system browser. Implies `--server`.

`--db <path>` remains as a compatibility alias for `--doc-gen <path>`.

## Mock demo

This repository includes a synthetic Lean project under `examples/mock-lean/`.
It is checked in as source files, not as a submodule. Generate its doc-gen-like
SQLite fixture and browse it with:

```sh
node examples/mock-lean/create-docgen-db.mjs .lean-view/doc-gen/api-docs.db
npm run build
node dist/cli.js \
  --repo-root examples/mock-lean \
  --local-root MockProject \
  --doc-gen .lean-view/doc-gen \
  --project-name "Mock Lean" \
  --server
```

## Development

```sh
npm install
npm test
npm pack
```

The package intentionally has no runtime npm dependencies. The extractor shells
out to `sqlite3 -json` so it can stay small and easy to run through `npx`.
