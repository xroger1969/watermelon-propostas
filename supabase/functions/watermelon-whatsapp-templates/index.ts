import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "https://www.watermelonexperiences.pt",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function cleanTemplateName(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Not authorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: adminError } = await userClient.rpc("watermelon_whatsapp_admin_status");
    if (adminError) return json({ error: "Not authorized" }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: config, error: configError } = await admin.rpc("watermelon_whatsapp_server_config");
    if (configError || !config) return json({ error: "WhatsApp configuration unavailable" }, 500);
    // Production guard: the legacy personal phone can never manage business templates.
    const configuredBusiness = String(config.business_phone || "").replace(/\D/g, "");
    if (configuredBusiness !== "351965637736" || String(config.phone_number_id || "") === "874910289048462") {
      return json({ error: "WhatsApp CRM is paused until the dedicated Watermelon business number is verified.", code: "DEDICATED_WHATSAPP_REQUIRED" }, 503);
    }

    const token = String(config.access_token || "");
    const wabaId = String(config.waba_id || "");
    const graphVersion = String(config.graph_version || "v23.0");

    if (!token || !wabaId) return json({ error: "WhatsApp WABA/token not configured" }, 409);

    const endpoint = `https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates`;

    if (req.method === "GET") {
      const response = await fetch(endpoint + "?limit=100", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return json({ error: data?.error?.message || "Could not load templates", meta: data?.error || null }, response.status);

      const templates = Array.isArray(data?.data) ? data.data.map((item: any) => ({
        id: item.id || null,
        name: item.name || "",
        status: item.status || "",
        category: item.category || "",
        language: item.language || "",
      })) : [];

      return json({ templates });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const input = await req.json().catch(() => ({}));
    const name = cleanTemplateName(input?.name);
    const language = String(input?.language || "en_US").trim().slice(0, 20);
    const category = String(input?.category || "UTILITY").trim().toUpperCase();
    const body = String(input?.body || "").trim().slice(0, 900);

    if (!name || name.length < 3) return json({ error: "Template name is required" }, 400);
    if (!["UTILITY", "MARKETING", "AUTHENTICATION"].includes(category)) {
      return json({ error: "Invalid template category" }, 400);
    }
    if (!body || body.length < 10) return json({ error: "Template body is required" }, 400);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        language,
        category,
        components: [{ type: "BODY", text: body }],
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json({
        error: data?.error?.message || "Could not create template",
        code: data?.error?.code || null,
        meta: data?.error || null,
      }, response.status);
    }

    return json({
      template: {
        id: data?.id || null,
        name,
        status: data?.status || "PENDING",
        category,
        language,
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});