# Mock Fixture And CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the private `tests/graphql-lean` submodule with a checked-in mock Lean project and update the CLI to support doc-gen path resolution, default `.lean-view` output paths, and optional static serving.

**Architecture:** Keep extraction unchanged. Add small CLI support modules for argument parsing, doc-gen database resolution, and static HTTP serving so `src/cli.ts` stays focused on orchestration. Put demo source under `examples/mock-lean/` and generate its synthetic doc-gen SQLite database on demand with a script.

**Tech Stack:** TypeScript, Node.js standard library, `sqlite3` command-line tool, Node's built-in test runner.

---

### Task 1: CLI Option Parsing And Path Resolution

**Files:**
- Create: `src/cli-options.ts`
- Modify: `src/cli.ts`
- Test: `src/extract.test.ts`

- [ ] Write failing tests for `parseCliArgs`, default `.lean-view` paths, `--doc-gen` file/directory handling, `--open` implying `--server`, and `--db` compatibility.
- [ ] Run `npm test` and verify the new tests fail because `src/cli-options.ts` does not exist.
- [ ] Implement `src/cli-options.ts` with `parseCliArgs`, `resolveDocGenDb`, and `defaultOutputDir`.
- [ ] Update `src/cli.ts` to use the parsed options and `--doc-gen` instead of requiring `--db`.
- [ ] Run `npm test` and verify the CLI option tests pass.

### Task 2: Static Server

**Files:**
- Create: `src/server.ts`
- Modify: `src/cli.ts`
- Test: `src/extract.test.ts`

- [ ] Write failing tests for serving files from an output directory and rejecting path traversal.
- [ ] Run `npm test` and verify the server tests fail because `src/server.ts` does not exist.
- [ ] Implement `src/server.ts` using Node's `http`, `fs`, and `path` modules.
- [ ] Update `src/cli.ts` so `--server` starts the server, prints the URL, and keeps the process alive.
- [ ] Add `--host`, `--port`, and `--open` support; `--open` spawns the platform browser opener and implies `--server`.
- [ ] Run `npm test` and verify all tests pass.

### Task 3: Mock Lean Demo And Synthetic Doc-Gen Fixture

**Files:**
- Delete: `.gitmodules`
- Delete: `tests/graphql-lean`
- Create: `examples/mock-lean/`
- Create: `examples/mock-lean/create-docgen-db.mjs`
- Modify: `.gitignore`
- Modify: `package.json`
- Test: `src/extract.test.ts`

- [ ] Remove the submodule checkout and `.gitmodules`.
- [ ] Add a sizable mock Lean source tree with many modules and namespaces under `examples/mock-lean/MockProject`.
- [ ] Add `create-docgen-db.mjs` to create doc-gen-like tables used by `src/extract.ts`.
- [ ] Add tests that generate the DB into a temp directory and run `buildPayload` against the mock project.
- [ ] Run `npm test` and verify all tests pass.

### Task 4: Documentation And Agent Memory

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `AGENTS.md`

- [ ] Update README CLI examples to use `--doc-gen`, `.lean-view/site`, and optional `--server` / `--open`.
- [ ] Update architecture notes to document the mock fixture and server mode.
- [ ] Update agent memory to remove the submodule note and record the mock fixture layout.
- [ ] Run `npm test` and `npm pack` for final verification.
