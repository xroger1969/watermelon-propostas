const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const { getAdsReportState, validateAdsReport } = require("../lib/google-ads-report.ts");
const { buildGoogleAdsSyncScript } = require("../lib/google-ads-sync-script.ts");
const token = "a".repeat(64);
const now = Date.parse("2026-10-11T17:00:00Z");
const status = (today = 0) => ({
  latestReportDate: "2026-10-09", lastReceivedAt: null, timeZone: "Europe/Lisbon",
  coverage: { today: { reportedDays: today, expectedDays: 1 }, last7: { reportedDays: 5, expectedDays: 7 }, last30: { reportedDays: 10, expectedDays: 30 } },
});

test("today without a report is unknown even when old totals contain zero", () => {
  const result = getAdsReportState(status(), "today", "2026-10-09T17:53:53Z", now);
  assert.equal(result.hasReport, false);
  assert.equal(result.stale, true);
  assert.equal(result.incomplete, true);
  assert.equal(result.automatic, false);
});
test("an imported zero-activity day is available and an older response cannot prove coverage", () => {
  assert.equal(getAdsReportState(status(1), "today", "2026-10-11T16:00:00Z", now).hasReport, true);
  assert.equal(getAdsReportState(null, "today", "2026-10-11T16:00:00Z", now).hasReport, false);
});
test("older partial totals stay available and a stalled automatic feed is stale", () => {
  const data = status(); data.lastReceivedAt = "2026-10-09T17:00:00Z";
  const result = getAdsReportState(data, "last7", null, now);
  assert.equal(result.hasReport, true);
  assert.equal(result.incomplete, true);
  assert.equal(result.automatic, true);
  assert.equal(result.stale, true);
});

function runScript({ date = "2026-10-11", accountId = "575-598-5719", preview = false, fail = false } = {}) {
  let posted = null;
  let calls = 0;
  const context = {
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [date + "T17:00:00Z"])); } },
    AdsApp: {
      currentAccount: () => ({ getCustomerId: () => accountId, getTimeZone: () => "Europe/Lisbon", getCurrencyCode: () => "EUR" }),
      performanceMaxCampaigns: () => ({
        withIds: () => ({
          get: () => ({
            hasNext: () => true,
            next: () => ({
              getStartDate: () => ({ year: 2026, month: 9, day: 29 }),
              getEndDate: () => ({ year: 2026, month: 10, day: 20 })
            })
          })
        })
      }),
      getExecutionInfo: () => ({ isPreview: () => preview }),
      search: (query) => {
        calls++;
        if (fail && calls === 2) throw new Error("Google query failed");
        const values = calls === 1 ? [{
          campaign: { name: "Watermelon", status: "ENABLED", startDate: "2026-09-29", endDate: "2026-10-20", primaryStatusReasons: [] },
          campaignBudget: { amountMicros: 5000000 },
        }] : [{ segments: { date }, metrics: { impressions: 778, clicks: 15, costMicros: 3851000, conversions: 0.5, conversionsValue: 12.25 } }];
        let index = 0;
        if (calls === 2) { assert.ok(query.includes("BETWEEN")); assert.ok(query.includes(date)); }
        return { hasNext: () => index < values.length, next: () => values[index++] };
      },
    },
    Utilities: { formatDate: (value, zone) => { assert.equal(zone, "Europe/Lisbon"); return date; } },
    Logger: { log() {} },
    UrlFetchApp: { fetch: (url, options) => {
      assert.equal(url, "https://www.watermelonexperiences.pt/api/google-ads-sync");
      assert.equal(options.headers.Authorization, "Bearer " + token);
      assert.equal(options.followRedirects, false);
      posted = JSON.parse(options.payload);
      return { getResponseCode: () => 200, getContentText: () => '{"ok":true}' };
    } },
  };
  vm.createContext(context);
  vm.runInContext(buildGoogleAdsSyncScript(token), context);
  vm.runInContext("main()", context);
  return posted;
}
test("script imports a full report including today, explicit zero days and unrounded currency", () => {
  const report = runScript();
  validateAdsReport(report);
  assert.equal(report.daily.length, 30);
  assert.equal(report.daily.at(-1).reportDate, "2026-10-11");
  assert.equal(report.daily.at(-1).cost, 3.851);
  assert.equal(report.daily.at(-1).conversions, 0.5);
  assert.equal(report.daily[0].impressions, 0);
  assert.equal(report.campaign.budgetAmount, 5);
  assert.equal(report.campaign.startDate, "2026-09-29");
  assert.equal(report.campaign.endDate, "2026-10-20");
});
test("report calendar days stay consecutive across a daylight saving transition", () => {
  const report = runScript({ date: "2026-03-29" });
  validateAdsReport(report);
  assert.equal(report.daily[0].reportDate, "2026-02-28");
  assert.equal(new Set(report.daily.map(day => day.reportDate)).size, 30);
});
test("preview and failed queries never upload a synthetic zero report", () => {
  assert.equal(runScript({ preview: true }), null);
  assert.throws(() => runScript({ fail: true }), /Google query failed/);
  assert.throws(() => runScript({ accountId: "123-456-7890" }), /Watermelon Google Ads account/);
});
test("invalid, partial, duplicated and foreign-account reports are rejected", () => {
  const report = runScript();
  for (const mutate of [
    r => { r.accountId = "123"; }, r => { r.currency = "USD"; },
    r => { r.daily.pop(); }, r => { r.daily[0] = r.daily[1]; },
    r => { r.daily[0].cost = -1; }, r => { r.daily[0].clicks = 1.5; },
    r => { r.daily[0].cost = "12"; }, r => { r.reportDate = "2026-02-30"; },
  ]) { const copy = structuredClone(report); mutate(copy); assert.throws(() => validateAdsReport(copy)); }
});

function receiver({ authorized = true, reject = false } = {}) {
  const exports = {};
  const calls = [];
  const source = ts.transpileModule(readFileSync(require.resolve("../app/api/google-ads-sync/route.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (name) => {
    if (name === "@/lib/google-ads-report") return require("../lib/google-ads-report.ts");
    if (name === "@/lib/google-ads-sync-script") return require("../lib/google-ads-sync-script.ts");
    if (name === "@/lib/supabase/config") return { SUPABASE_BOOKING_URL: "https://example.supabase.co", SUPABASE_BOOKING_PUBLISHABLE_KEY: "publishable" };
    if (name === "@supabase/supabase-js") return { createClient: () => ({ rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: {}, error: name === "watermelon_marketing_summary" ? (authorized ? null : { message: "Not authorized" }) : (reject ? { message: "Rejected" } : null) };
    } }) };
    return require(name);
  };
  new Function("require", "exports", "process", "Buffer", source)(localRequire, exports, { env: { GOOGLE_ADS_REPORT_TOKEN: token } }, Buffer);
  return { ...exports, calls };
}
test("receiver rejects missing or invalid import tokens before accessing storage", async () => {
  const handler = receiver();
  const response = await handler.POST(new Request("https://example.test", { method: "POST", body: "{}" }));
  assert.equal(response.status, 401);
  assert.equal(handler.calls.length, 0);
});
test("receiver rejects malformed payloads and preserves storage errors", async () => {
  const handler = receiver({ reject: true });
  const request = body => new Request("https://example.test", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await handler.POST(request({}))).status, 400);
  assert.equal(handler.calls.length, 0);
  assert.equal((await handler.POST(request(runScript()))).status, 422);
  assert.equal(handler.calls.length, 1);
});
test("setup token is not returned without verified CRM administrator access", async () => {
  const handler = receiver({ authorized: false });
  assert.equal((await handler.GET(new Request("https://example.test"))).status, 401);
  const response = await handler.GET(new Request("https://example.test", { headers: { Authorization: "Bearer user-session" } }));
  assert.equal(response.status, 403);
  assert.equal((await response.text()).includes(token), false);
});
test("successful report uploads are acknowledged and admin setup is never cached", async () => {
  const handler = receiver();
  const upload = await handler.POST(new Request("https://example.test", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(runScript()) }));
  assert.equal(upload.status, 200);
  assert.equal((await upload.json()).ok, true);
  const setup = await handler.GET(new Request("https://example.test", { headers: { Authorization: "Bearer user-session" } }));
  assert.ok(setup.headers.get("cache-control").includes("no-store"));
  assert.ok((await setup.json()).script.includes(token));
});
