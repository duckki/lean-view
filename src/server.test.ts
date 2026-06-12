import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { readStaticResponse, resolveStaticPath } from "./server.js";

async function withTempSite(fn: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync("/tmp/lean-view-server-");
  try {
    mkdirSync(join(root, "data"), { recursive: true });
    writeFileSync(join(root, "index.html"), "index", "utf8");
    writeFileSync(join(root, "app.js"), "app", "utf8");
    writeFileSync(join(root, "data", "index.json"), "{}", "utf8");
    await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("resolves static paths and rejects path traversal", () => {
  withTempSite(async (root) => {
    assert.equal(resolveStaticPath(root, "/"), join(root, "index.html"));
    assert.equal(resolveStaticPath(root, "/app.js"), join(root, "app.js"));
    assert.equal(resolveStaticPath(root, "/data/index.json"), join(root, "data", "index.json"));
    assert.equal(resolveStaticPath(root, "/../package.json"), null);
    assert.equal(resolveStaticPath(root, "/%2e%2e/package.json"), null);
  });
});

test("reads static file responses without allowing traversal", async () => {
  await withTempSite(async (root) => {
    const response = readStaticResponse(root, "/app.js");
    assert.equal(response.status, 200);
    assert.equal(response.contentType, "text/javascript; charset=utf-8");
    assert.equal(response.body, "app");

    const missing = readStaticResponse(root, "/missing.js");
    assert.equal(missing.status, 404);

    const traversal = readStaticResponse(root, "/../package.json");
    assert.equal(traversal.status, 404);
  });
});
