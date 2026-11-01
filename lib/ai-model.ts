// Reviewed against the official OpenAI model catalogue on 2026-11-01.
// Future upgrades require compatibility checks and a successful live response.
export const REQUIRED_CONCIERGE_MODEL = "gpt-6-astra";

export function conciergeModel() {
  return process.env.OPENAI_CONCIERGE_MODEL?.trim() || REQUIRED_CONCIERGE_MODEL;
}

export function matchesRequestedModel(requested: string, actual: unknown): actual is string {
  if (typeof actual !== "string") return false;
  if (actual === requested) return true;
  return actual.startsWith(requested + "-") && /^\d{4}-\d{2}-\d{2}$/.test(actual.slice(requested.length + 1));
}
