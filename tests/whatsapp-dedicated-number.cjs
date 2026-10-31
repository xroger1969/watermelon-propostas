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

test("manual CRM replies use the dedicated endpoint and webhook automated sends stay paused", () => {
  assert.match(webhook, /const CRM_OUTBOUND_ENABLED = false;/);
  assert.match(webhook, /const CRM_INBOUND_ENABLED = true;/);
  assert.match(webhook, /const CRM_INBOUND_TEST_ONLY = false;/);
  assert.match(webhook, /INBOUND_TEST_PHRASE = "TESTE WATERMELON 965"/);
  assert.match(conversation, /const WHATSAPP_CRM_ENABLED = true;/);
  assert.match(conversation, /functions\.invoke\("watermelon-whatsapp-reply"/);
  assert.doesNotMatch(conversation, /watermelon-whatsapp-send-v2/);
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
        return { data: { app_secret: "synthetic-app-secret", access_token: overrides.serverToken === undefined ? "synthetic-server-token" : overrides.serverToken }, error: null };
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
    if (input.includes("debug_token")) {
      assert.equal(new URL(input).searchParams.get("input_token"), "synthetic-server-token");
      assert.equal(opts.headers.Authorization, "Bearer 1725466825210094|synthetic-app-secret");
      return Response.json({ data: overrides.debug ?? { is_valid: true, app_id: "1725466825210094", scopes: ["whatsapp_business_management", "whatsapp_business_messaging"], granular_scopes: [{ scope: "whatsapp_business_management", target_ids: ["4408982439363483"] }, { scope: "whatsapp_business_messaging", target_ids: ["4408982439363483"] }] } });
    }
    if (input.includes("oauth/access_token")) {
      if (overrides.rejectCode) return new Response(JSON.stringify({ error: { code: 190 } }), { status: 400 });
      return Response.json({ access_token: "synthetic-token" });
    }
    if (input.includes("phone_numbers")) {
      if (overrides.phoneDenied) return Response.json({ error: { code: 200 } }, { status: 403 });
      return Response.json({ data: phoneList });
    }
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
    const body = JSON.stringify(input.operation ? input : {
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
  assert.equal(r.calls.filter(c => c.path?.includes("/subscribed_apps")).length, 0);
});

const dedicatedPhones = [{ id: "1423415737522090", display_phone_number: "+351 965 637 736" }];
test("existing server authorization validates only the exact dedicated WABA and never exchanges or returns tokens", async () => {
  const r = runtime({ phones: dedicatedPhones });
  const res = await r.post({ operation: "validate_existing_authorization" });
  const responseText = await res.text();
  assert.equal(res.status, 200, responseText);
  assert.ok(!responseText.includes("synthetic-server-token") && !responseText.includes("synthetic-app-secret"));
  assert.equal(JSON.parse(responseText).authorization_source, "existing_server_token");
  assert.equal(JSON.parse(responseText).message_delivery_verified, false);
  assert.equal(r.saves.length, 1);
  assert.equal(r.saves[0].p_access_token, null, "The saved secret token must not be replaced");
  assert.equal(r.saves[0].p_phone_number_id, "1423415737522090");
  assert.equal(r.saves[0].p_waba_id, "4408982439363483");
  assert.equal(r.saves[0].p_business_phone, "+351965637736");
  assert.equal(r.calls.filter(c => c.path?.includes("oauth/access_token")).length, 0);
  assert.deepEqual(r.calls.filter(c => c.path?.includes("phone_numbers") || c.path?.includes("subscribed_apps")).map(c => c.path), ["/v25.0/4408982439363483/phone_numbers", "/v25.0/4408982439363483/subscribed_apps", "/v25.0/4408982439363483/subscribed_apps"]);
  assert.equal(r.calls.filter(c => c.path?.endsWith("/messages") || c.path?.endsWith("/register")).length, 0);
});
test("existing authorization rejects browser-supplied account identifiers, codes or tokens", async () => {
  for (const extra of [{ waba_id: "1785473568789104" }, { phone_number_id: "874910289048462" }, { access_token: "synthetic-client-token" }, { code: "synthetic-code" }, { redirect_uri: "https://developers.facebook.com/es/oauth/callback/" }]) {
    const r = runtime({ phones: dedicatedPhones });
    assert.equal((await r.post({ operation: "validate_existing_authorization", ...extra })).status, 400);
    assert.equal(r.saves.length, 0);
    assert.equal(r.calls.filter(c => c.type === "graph").length, 0);
  }
});
test("invalid, expired, wrong-app and insufficient existing grants preserve all settings", async () => {
  const base = { is_valid: true, app_id: "1725466825210094", scopes: ["whatsapp_business_management", "whatsapp_business_messaging"] };
  for (const extra of [
    { is_valid: false }, { app_id: "another-app" }, { expires_at: 1 }, { data_access_expires_at: 1 },
    { scopes: [] }, { scopes: ["whatsapp_business_management"] },
    { granular_scopes: [{ scope: "whatsapp_business_messaging", target_ids: ["1785473568789104"] }] },
    { granular_scopes: [{ scope: "whatsapp_business_management", target_ids: [] }] },
  ]) {
    const r = runtime({ phones: dedicatedPhones, debug: { ...base, ...extra } });
    assert.equal((await r.post({ operation: "validate_existing_authorization" })).status, 409);
    assert.equal(r.saves.length, 0);
    assert.equal(r.calls.filter(c => c.path?.includes("phone_numbers") || c.method === "POST").length, 0);
  }
});
test("missing token, inaccessible dedicated WABA, mismatching phone or unconfirmed subscription cannot save", async () => {
  for (const options of [
    { serverToken: "" }, { phoneDenied: true },
    { phones: [{ id: "1423415737522090", display_phone_number: "+351918404101" }] },
    { phones: [{ id: "874910289048462", display_phone_number: "+351965637736" }] },
    { subscriptionMissing: true },
  ]) {
    const r = runtime({ phones: dedicatedPhones, ...options });
    const res = await r.post({ operation: "validate_existing_authorization" });
    assert.ok(res.status >= 400);
    assert.equal(r.saves.length, 0);
    if (!options.subscriptionMissing) assert.equal(r.calls.filter(c => c.method === "POST").length, 0);
  }
});
test("existing authorization remains admin-only and the UI provides an explicit paused validation action", async () => {
  const r = runtime({ adminDenied: true, phones: dedicatedPhones });
  assert.equal((await r.post({ operation: "validate_existing_authorization" })).status, 403);
  assert.equal(r.saves.length, 0);
  assert.equal(r.calls.filter(c => c.type === "graph").length, 0);
  assert.match(setup, /Validar autorização Meta já concedida/);
  assert.match(setup, /operation: "validate_existing_authorization"/);
  assert.match(setup, /Receção ativa/);
  assert.match(setup, /Respostas manuais/);
});
test("existing-authorization UI explains grant failures without exposing unknown error bodies", async () => {
  const functionSource = setup.match(/  async function validateExistingAuthorization\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(functionSource);
  const compiled = ts.transpileModule(functionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [body, expected] of [
    [{ error: "The saved Meta authorization does not grant valid access" }, /É necessária uma nova autorização Meta/],
    [{ error: "No server authorization is available" }, /Ainda não existe autorização/],
    [{ error: "synthetic-sensitive-token-do-not-display" }, /Não foi possível confirmar/],
  ]) {
    let run;
    const messages = [], busy = [];
    vm.runInNewContext(compiled + "\nrun = validateExistingAuthorization;", {
      set run(value) { run = value; }, Response,
      supabase: { functions: { async invoke(name, request) {
        assert.equal(name, "watermelon-whatsapp-coexistence");
        assert.equal(request.body.operation, "validate_existing_authorization");
        assert.deepEqual(Object.keys(request.body), ["operation"]);
        return { data: null, error: { context: Response.json(body) } };
      } } },
      setCoexistenceBusy: value => busy.push(value), setCoexistenceMessage: value => messages.push(value),
      load: async () => { throw new Error("Failed authorization must not reload as success"); },
    });
    await run();
    assert.match(messages.at(-1), expected);
    assert.ok(!messages.join().includes("synthetic-sensitive-token"));
    assert.deepEqual(busy, [true, false]);
  }
});
test("new dedicated phone is validated against the Meta Graph result before saving", async () => {
  const r = runtime();
  const res = await r.post({ phone_number_id: "999000111222333" });
  assert.equal(res.status, 200, await res.text());
  assert.equal(r.saves.length, 1);
  assert.equal(r.saves[0].p_business_phone, "+351965637736");
  assert.equal(r.saves[0].p_phone_number_id, "999000111222333");
  assert.equal(r.saves[0].p_waba_id, "555666777888");
  assert.equal(r.calls.filter(c => c.path?.includes("/subscribed_apps")).length, 2);
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


