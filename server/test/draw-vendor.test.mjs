// The vendored Anatomy Live bundle must match ../anatomy-live, and the draw
// route must load it without a build step.

import assert from "node:assert/strict";
import { test } from "node:test";
import vendored from "../vendor/anatomy-live-bundle.mjs";
import { buildBundleSource } from "../scripts/vendor-anatomy-live.mjs";
import { createServer } from "../index.mjs";

test("server/vendor/anatomy-live-bundle.mjs is up to date (run server/scripts/vendor-anatomy-live.mjs)", () => {
  assert.equal(vendored, buildBundleSource());
});

test("/api/draw loads the vendored bundle and answers without a key", async () => {
  const srv = createServer({ config: { apiKey: "" }, log: { info() {} } });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  try {
    const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/draw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "the water cycle" }),
    });
    // 503 API_KEY_MISSING comes from anatomy-live itself, so the bundle loaded.
    // (SKETCH_UNAVAILABLE would mean it failed to load.)
    const text = await res.text();
    assert.notEqual(res.status, 404, text);
    assert.ok(!text.includes("SKETCH_UNAVAILABLE"), text);
  } finally {
    srv.close();
  }
});
