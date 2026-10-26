import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createMaintenanceServer } from "../src/maintenance.mjs";

test("only the existing health probe is available during maintenance", async () => {
  const server = createMaintenanceServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const method of ["GET", "HEAD"]) {
      const response = await fetch(`${origin}/setup/healthz`, { method });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("set-cookie"), null);
      if (method === "GET") {
        assert.deepEqual(await response.json(), {
          ok: true, maintenance: true, paperclipStarted: false,
        });
      } else {
        assert.equal(await response.text(), "");
      }
    }
    for (const [method, path] of [
      ["GET", "/"], ["GET", "/setup"], ["GET", "/api/health"],
      ["POST", "/setup/api/bootstrap"], ["POST", "/setup/healthz"],
      ["GET", "/mcp"], ["GET", "/setup/healthz?extra=1"],
    ]) {
      const response = await fetch(origin + path, { method });
      assert.equal(response.status, 503, `${method} ${path}`);
      assert.equal(response.headers.get("retry-after"), "300");
      assert.equal(response.headers.get("set-cookie"), null);
      assert.deepEqual(await response.json(), { error: "maintenance" });
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
