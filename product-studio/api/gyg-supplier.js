import { timingSafeEqual } from 'node:crypto';

const METHODS = {
  'get-availabilities': 'GET',
  'reserve': 'POST',
  'cancel-reservation': 'POST',
  'book': 'POST',
  'cancel-booking': 'POST',
};
const fail = (res, code, payload) => {
  res.status(code);
  return res.json(payload);
};
function validBasicAuth(value, user, pass) {
  if (!value || !value.startsWith('Basic ') || !user || !pass) return false;
  try {
    const supplied = Buffer.from(value.slice(6), 'base64').toString('utf8');
    const expected = user + ':' + pass;
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
function sandboxConfigured(env) {
  return env.VERCEL_ENV !== 'production' && env.GYG_SUPPLIER_MODE === 'sandbox' &&
    env.GYG_SUPPLIER_ENABLED === 'true' &&
    !!env.GYG_SUPPLIER_BASIC_USER && !!env.GYG_SUPPLIER_BASIC_PASSWORD &&
    !!env.SUPABASE_PRODUCT_STUDIO_URL && !!env.PRODUCT_STUDIO_INTERNAL_KEY;
}
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Deliberately no live branch. Production must pass an explicit future review.
  if (!sandboxConfigured(process.env)) {
    return fail(res, 503, { errorCode: 'INTERNAL_SYSTEM_FAILURE', errorMessage: 'Connectivity testing is not enabled.' });
  }
  if (!validBasicAuth(req.headers.authorization, process.env.GYG_SUPPLIER_BASIC_USER, process.env.GYG_SUPPLIER_BASIC_PASSWORD)) {
    return fail(res, 200, { errorCode: 'AUTHORIZATION_FAILURE', errorMessage: 'Authentication required.' });
  }
  const operation = String(req.query.operation || '');
  if (!Object.hasOwn(METHODS, operation)) return fail(res, 404, { errorCode: 'VALIDATION_FAILURE', errorMessage: 'Unsupported endpoint.' });
  if (req.method !== METHODS[operation]) {
    res.setHeader('Allow', METHODS[operation]);
    return fail(res, 405, { errorCode: 'VALIDATION_FAILURE', errorMessage: 'Unsupported method.' });
  }
  if (operation !== 'get-availabilities' &&
      (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || typeof req.body.data !== 'object' || !req.body.data)) {
    return fail(res, 200, { errorCode: 'VALIDATION_FAILURE', errorMessage: 'JSON data object is required.' });
  }
  const params = operation === 'get-availabilities' ? {
    productId: req.query.productId,
    fromDateTime: req.query.fromDateTime,
    toDateTime: req.query.toDateTime
  } : req.body?.data;

  try {
    const base = new URL(process.env.SUPABASE_PRODUCT_STUDIO_URL);
    if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co')) throw Error('Invalid upstream configuration');
    const target = new URL('/functions/v1/gyg-connectivity-dispatch', base);
    const upstream = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-studio-key': process.env.PRODUCT_STUDIO_INTERNAL_KEY },
      body: JSON.stringify({ operation, params }),
      signal: AbortSignal.timeout(8500)
    });
    if (!upstream.ok) throw new Error('Upstream rejected the request');
    const payload = await upstream.json().catch(() => null);
    if (!payload || typeof payload !== 'object') throw Error('Upstream response was not JSON');
    return fail(res, 200, payload);
  } catch (e) {
    console.error('GYG sandbox request failed:', e?.name || 'Upstream error');
    return fail(res, 503, { errorCode: 'INTERNAL_SYSTEM_FAILURE', errorMessage: 'Connectivity temporarily unavailable.' });
  }
}
