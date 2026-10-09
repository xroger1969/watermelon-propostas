const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyAttribution } = require("../lib/attribution.ts");

const classify = (search = "", referrerHost = "", previous = null) =>
  classifyAttribution({ search, referrerHost, previous });

test("Google gclid is attributed as paid search, without persisting the click ID", () => {
  const result = classify("?gclid=private-token");
  assert.equal(result.source, "google");
  assert.equal(result.medium, "cpc");
  assert.equal(JSON.stringify(result).includes("private-token"), false);
});

test("gbraid and wbraid are recognized as Google CPC", () => {
  for (const key of ["gbraid", "wbraid"]) {
    assert.equal(classify("?" + key + "=token").medium, "cpc");
  }
});

test("manual Google UTM uses the same reporting bucket", () => {
  assert.deepEqual(classify("?utm_source=GoogleAds&utm_medium=paid_search&utm_campaign=oct"),
    { source: "google", medium: "cpc", campaign: "oct", referrerHost: "" });
});

test("auto-tagging takes precedence over conflicting UTMs", () => {
  const result = classify("?gclid=token&utm_source=facebook&utm_medium=social&utm_campaign=x");
  assert.equal(result.source, "google");
  assert.equal(result.medium, "cpc");
  assert.equal(result.campaign, "x");
});

test("Google organic search is not wrongly counted as paid traffic", () => {
  assert.deepEqual(classify("", "www.google.com"),
    { source: "www.google.com", medium: "referral", campaign: "", referrerHost: "www.google.com" });
});

test("Google syndicated search referrers without click identifiers remain unverified", () => {
  assert.equal(classify("", "syndicatedsearch.goog").medium, "referral");
});

test("known Google ads redirector is classified as paid traffic", () => {
  assert.equal(classify("", "googleads.g.doubleclick.net").medium, "cpc");
});

test("stored session attribution survives internal navigation", () => {
  const old = classify("?gclid=token&utm_campaign=first");
  assert.deepEqual(classify("", "", old), old);
});

test("new paid arrival updates a previously direct session", () => {
  const old = classify();
  const next = classify("?wbraid=token&utm_campaign=new", "", old);
  assert.equal(next.source, "google");
  assert.equal(next.campaign, "new");
});

test("non-Google paid sources are not counted as Google CPC", () => {
  const result = classify("?utm_source=bing&utm_medium=cpc&utm_campaign=search");
  assert.equal(result.source, "bing");
  assert.equal(result.medium, "cpc");
});

test("direct visitors remain direct", () => {
  assert.equal(classify().source, "direct");
});

test("a new tagged source replaces previously stored attribution", () => {
  const old = classify("?utm_source=google&utm_medium=cpc");
  assert.equal(classify("?utm_source=instagram&utm_medium=social", "", old).source, "instagram");
});
