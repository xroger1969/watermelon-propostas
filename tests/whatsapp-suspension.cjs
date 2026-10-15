const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function isolatedHandler() {
  const source = fs.readFileSync(
    path.join(__dirname, "../supabase/functions/watermelon-whatsapp-send/index.ts"), "utf8"
  );
  let handler;
  const calls = { network: 0, body: 0, credentials: 0 };
  class ResponseFixture {
    constructor(body, init) { this.body = body; this.status = init.status; this.headers = init.headers; }
  }
  vm.runInNewContext(source, {
    Deno: { serve(fn) { handler = fn; } },
    Response: ResponseFixture,
    fetch() { calls.network++; throw new Error("Network is forbidden in suspension tests"); },
  }, { timeout: 1000 });
  const request = (method) => ({
    method,
    json() { calls.body++; throw new Error("Request body must remain unread"); },
    text() { calls.body++; throw new Error("Request body must remain unread"); },
    headers: { get() { calls.credentials++; throw new Error("Credentials must remain unread"); } },
  });
  return { handler, request, calls };
}

test("legacy POST is paused before reading a destination, body or credentials", async () => {
  const { handler, request, calls } = isolatedHandler();
  const response = await handler(request("POST"));
  assert.equal(response.status, 503);
  assert.equal(JSON.parse(response.body).code, "WHATSAPP_INTEGRATION_PAUSED");
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.deepEqual(calls, { network: 0, body: 0, credentials: 0 });
});

for (const method of ["GET", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
  test("legacy " + method + " cannot send or change integration settings", async () => {
    const { handler, request, calls } = isolatedHandler();
    assert.equal((await handler(request(method))).status, 405);
    assert.deepEqual(calls, { network: 0, body: 0, credentials: 0 });
  });
}
