# Mock Lean Project

This is a synthetic Lean project used to demonstrate and test `lean-view`.
It is intentionally broad rather than mathematically meaningful: the source tree
contains many modules, namespaces, comments, doc strings, definitions, and
theorems so the static browser has realistic navigation data.

Generate a doc-gen-like SQLite fixture with:

```sh
node examples/mock-lean/create-docgen-db.mjs .lean-view/doc-gen/api-docs.db
```

Then generate and serve the browser:

```sh
npm run build
node dist/cli.js --repo-root examples/mock-lean --local-root MockProject --doc-gen .lean-view/doc-gen --server
```
