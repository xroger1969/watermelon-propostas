const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (relative) => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

const business = "351965637736";
const personal = "351918404101";

test("public site booking and AI Concierge routes use only the new Watermelon Business WhatsApp", () => {
  for (const p of [
    "components/AIConcierge.tsx",
    "components/BookingRequest.tsx",
    "components/ProposalBuilder.tsx",
  ]) {
    const source = read(p);
    assert.ok(source.includes("https://wa.me/" + business), p);
    assert.ok(!source.includes("https://wa.me/" + personal), p);
  }
});

test("iOS Watermelon contact links point only to the business phone", () => {
  const source = read("ios/Watermelon/Watermelon/TripViews.swift");
  assert.ok(source.includes("https://wa.me/" + business));
  assert.ok(!source.includes("https://wa.me/" + personal));
});

test("admin CRM never opens personal WhatsApp from payment, reminders or review actions", () => {
  const source = read("components/AdminCRM.tsx");
  assert.ok(!source.includes("https://wa.me/"));
  assert.ok(!source.includes("window.location.href =\n      \"https://wa.me/"));
  assert.match(source, /manualWhatsAppText/);
  assert.match(source, /Copiar mensagem para WhatsApp Business/);
  assert.match(source, /setPendingReviewRequestId\(request.id\)/);
  assert.match(source, /Confirmar pedido de avaliação enviado/);
  assert.match(source, /window.confirm\("Confirmas que JÁ enviaste/);
});

test("booking management uses a clipboard draft rather than an arbitrary WhatsApp app", () => {
  const source = read("components/AdminBookings.tsx");
  assert.ok(!source.includes("https://wa.me/"));
  assert.ok(source.includes("Copiar para WhatsApp Business"));
  assert.ok(source.includes("setManualWhatsAppText(messageText)"));
  assert.ok(source.includes("Preparar mensagem WhatsApp Business"));
});

test("automated WhatsApp webhook remains paused until new Meta Business phone validated", () => {
  const source = read("supabase/functions/watermelon-whatsapp-webhook/index.ts");
  assert.match(source, /const CRM_INBOUND_ENABLED = false;/);
  assert.match(source, /const CRM_OUTBOUND_ENABLED = false;/);
});
