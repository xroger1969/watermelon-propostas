import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://bwujfaptrrkshxarzbid.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable__Hywg4n3BIjC_R0hPpj0yQ_WHGLKldf";
const OWNER_EMAIL = "c.vasconcelos1969@gmail.com";

type ResendEmailResponse = {
  id?: string;
  message?: string;
  name?: string;
  statusCode?: number;
  last_event?: string;
  created_at?: string;
  from?: string;
  to?: string[];
  subject?: string;
};

async function authenticateOwner(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return { ok: false as const, status: 401, error: "Missing CRM session." };
  }

  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: {
      Authorization: authorization,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return { ok: false as const, status: 401, error: "CRM session is invalid or expired." };
  }

  const user = (await response.json().catch(() => ({}))) as { email?: string };
  if ((user.email || "").toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    return { ok: false as const, status: 403, error: "This account is not authorized to send CRM email." };
  }

  return { ok: true as const };
}

function clean(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateOwner(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CRM_EMAIL_FROM || "Watermelon Experiences <info@watermelonexperiences.pt>";
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "CRM email provider is not configured." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    to?: string;
    subject?: string;
    text?: string;
    request_id?: string;
    reference?: string;
  };

  const to = clean(body.to, 320);
  const subject = clean(body.subject, 200);
  const text = clean(body.text, 20000);
  const requestId = clean(body.request_id, 80);
  const reference = clean(body.reference, 80);

  if (!validEmail(to)) {
    return NextResponse.json({ ok: false, error: "Customer email address is invalid." }, { status: 400 });
  }
  if (!subject) {
    return NextResponse.json({ ok: false, error: "Email subject is required." }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ ok: false, error: "Email message is empty." }, { status: 400 });
  }

  const tags = [
    reference ? { name: "request_reference", value: reference.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256) } : null,
    requestId ? { name: "request_id", value: requestId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256) } : null,
    { name: "source", value: "watermelon_crm" },
  ].filter(Boolean);

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      tags,
    }),
    cache: "no-store",
  });

  const data = (await resendResponse.json().catch(() => ({}))) as ResendEmailResponse;

  if (!resendResponse.ok || !data.id) {
    return NextResponse.json(
      {
        ok: false,
        error: data.message || "The email provider could not send this message.",
      },
      { status: resendResponse.status || 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    status: "sent",
  });
}

export async function GET(request: NextRequest) {
  const auth = await authenticateOwner(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "CRM email provider is not configured." },
      { status: 503 }
    );
  }

  const ids = (request.nextUrl.searchParams.get("ids") || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[a-zA-Z0-9_-]{8,80}$/.test(value))
    .slice(0, 20);

  const statuses: Record<string, string> = {};

  await Promise.all(
    ids.map(async (id) => {
      try {
        const response = await fetch("https://api.resend.com/emails/" + encodeURIComponent(id), {
          headers: { Authorization: "Bearer " + apiKey },
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json().catch(() => ({}))) as ResendEmailResponse;
        statuses[id] = data.last_event || "sent";
      } catch {
        // Keep the locally recorded status when Resend cannot be reached.
      }
    })
  );

  return NextResponse.json({ ok: true, statuses });
}
