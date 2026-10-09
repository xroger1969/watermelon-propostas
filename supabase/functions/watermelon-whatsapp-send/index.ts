// Owner-requested pause. This legacy endpoint must never bypass send-v2's suspension.
// No Supabase client, credentials, Graph requests or message parsing are permitted here.
Deno.serve(async (req) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Allow": "POST",
  };
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers });
  }
  return new Response(JSON.stringify({
    error: "WhatsApp CRM integration is paused. Use WhatsApp Business directly.",
    code: "WHATSAPP_INTEGRATION_PAUSED",
  }), { status: 503, headers });
});
