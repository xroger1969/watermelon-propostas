const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
function file(name) { return fs.readFileSync(path.join(root, name), "utf8"); }
const coexistence = file("supabase/functions/watermelon-whatsapp-coexistence/index.ts");
const templates = file("supabase/functions/watermelon-whatsapp-templates/index.ts");
const setup = file("components/WhatsAppSetup.tsx");
const conversation = file("components/WhatsAppConversation.tsx");
const webhook = file("supabase/functions/watermelon-whatsapp-webhook/index.ts");

test("the old personal WhatsApp number cannot be authorized from the dedicated onboarding endpoint", () => {
  assert.match(coexistence, /EXPECTED_BUSINESS_NUMBER = "351965637736"/);
  assert.doesNotMatch(coexistence, /351918404101|874910289048462/);
  assert.match(coexistence, /digits\(phone\.display_phone_number\) === EXPECTED_BUSINESS_NUMBER/);
  assert.match(coexistence, /user\.rpc\("watermelon_whatsapp_admin_status"\)/);
  assert.match(coexistence, /subscription_confirmed: true/);
});

test("CRM stays paused and cannot open the personal WhatsApp app", () => {
  assert.match(webhook, /const CRM_OUTBOUND_ENABLED = false;/);
  assert.match(webhook, /const CRM_INBOUND_ENABLED = false;/);
  assert.match(conversation, /const WHATSAPP_CRM_ENABLED = false;/);
  assert.match(conversation, /Copiar para WhatsApp Business/);
  assert.doesNotMatch(conversation, /wa\.me\/|Open in WhatsApp/);
  assert.match(conversation, /message\.phone_number_id !== LEGACY_PERSONAL_PHONE_ID/);
  assert.match(setup, /WATERMELON_BUSINESS_DIGITS = "351965637736"/);
  assert.doesNotMatch(setup, /p_access_token: accessToken\.trim\(\)/);
  assert.match(templates, /configuredBusiness !== "351965637736"/);
});

function runtime(overrides = {}) {
  const calls = [], saves = [];
  const source = coexistence.replace(/^import .*;\n/gm, "");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  let handler;
  const phoneList = overrides.phones ?? [
    { id: "874910289048462", display_phone_number: "+351 918 404 101" },
    { id: "999000111222333", display_phone_number: "+351 965 637 736" },
  ];
  const createClient = (...args) => ({
    async rpc(name, params) {
      calls.push({ type: "rpc", name });
      if (name === "watermelon_whatsapp_admin_status")
        return { data: {}, error: overrides.adminDenied ? { message: "denied" } : null };
      if (name === "watermelon_whatsapp_server_config")
        return { data: { app_secret: "synthetic-app-secret" }, error: null };
      if (name === "watermelon_save_whatsapp_config") {
        saves.push(params);
        return { data: {}, error: null };
      }
      throw new Error("Unexpected RPC " + name);
    },
  });
  const fetch = async (url, opts) => {
    const input = String(url);
    calls.push({ type: "graph", path: new URL(input).pathname, method: opts?.method || "GET" });
    if (input.includes("oauth/access_token")) {
      if (overrides.rejectCode) return new Response(JSON.stringify({ error: { code: 190 } }), { status: 400 });
      return Response.json({ access_token: "synthetic-token" });
    }
    if (input.includes("phone_numbers")) return Response.json({ data: phoneList });
    if (input.includes("subscribed_apps")) {
      if (opts?.method === "POST") return Response.json({ success: true });
      return Response.json({ data: overrides.subscriptionMissing ? [] : [{ id: "1725466825210094" }] });
    }
    throw new Error("Unexpected Graph endpoint");
  };
  vm.runInNewContext(compiled.outputText, {
    Deno: { env: { get(name) { return "synthetic-" + name; } }, serve(fn) { handler = fn; } },
    createClient, fetch, Request, Response, URL, console: { log() {}, error() {} },
  });
  async function post(input = {}) {
    const body = JSON.stringify({
      code: "synthetic-new-code",
      redirect_uri: "https://developers.facebook.com/es/oauth/callback/",
      waba_id: "555666777888",
      ...input,
    });
    return handler(new Request("https://watermelonexperiences.pt/function", {
      method: "POST",
      headers: { origin: "https://www.watermelonexperiences.pt", Authorization: "Bearer synthetic-user" },
      body,
    }));
  }
  return { calls, saves, post };
}

test("wrong or personal phone cannot overwrite the saved Meta CRM configuration", async () => {
  const r = runtime({ phones: [{ id: "874910289048462", display_phone_number: "+351918404101" }] });
  const res = await r.post({ phone_number_id: "874910289048462" });
  assert.equal(res.status, 409);
  assert.equal(r.saves.length, 0);
  assert.equal(r.calls.filter(c => c.path.includes("/subscribed_apps")).length, 0);
});
test("new dedicated phone is validated against the Meta Graph result before saving", async () => {
  const r = runtime();
  const res = await r.post({ phone_number_id: "999000111222333" });
  assert.equal(res.status, 200, await res.text());
  assert.equal(r.saves.length, 1);
  assert.equal(r.saves[0].p_business_phone, "+351965637736");
  assert.equal(r.saves[0].p_phone_number_id, "999000111222333");
  assert.equal(r.saves[0].p_waba_id, "555666777888");
  assert.equal(r.calls.filter(c => c.path.includes("/subscribed_apps")).length, 2);
});
test("inconsistent phone ID and invalid WABA are rejected", async () => {
  const r = runtime();
  assert.equal((await r.post({ phone_number_id: "874910289048462" })).status, 409);
  assert.equal((await r.post({ waba_id: "bad" })).status, 400);
  assert.equal(r.saves.length, 0);
});
test("unsubscribed Meta app or rejected OAuth code must not save anything", async () => {
  const unsubscribed = runtime({ subscriptionMissing: true });
  assert.equal((await unsubscribed.post()).status, 409);
  assert.equal(unsubscribed.saves.length, 0);
  const rejected = runtime({ rejectCode: true });
  assert.equal((await rejected.post()).status, 409);
  assert.equal(rejected.saves.length, 0);
});
test("non-admin users cannot perform an exchange", async () => {
  const r = runtime({ adminDenied: true });
  assert.equal((await r.post()).status, 403);
  assert.equal(r.saves.length, 0);
  assert.equal(r.calls.filter(c => c.type === "graph").length, 0);
});
