/**
 * A successful API request is not equivalent to successful WhatsApp delivery.
 * Only explicit text/payment_template responses mean a message was submitted.
 */
export type WhatsAppDeliveryMode = "text" | "template" | "pending" | "payment_template";

const KNOWN_MODES: WhatsAppDeliveryMode[] = ["text", "template", "pending", "payment_template"];

export function requireWhatsAppDeliveryMode(value: unknown): WhatsAppDeliveryMode {
  if (typeof value === "string" && KNOWN_MODES.includes(value as WhatsAppDeliveryMode)) {
    return value as WhatsAppDeliveryMode;
  }
  throw new Error(
    "WhatsApp returned no confirmed delivery state. Check the conversation before attempting to send again."
  );
}

export function wasWhatsAppMessageSubmitted(mode: WhatsAppDeliveryMode): boolean {
  return mode === "text" || mode === "payment_template";
}

export function isWhatsAppMessageQueued(mode: WhatsAppDeliveryMode): boolean {
  return mode === "template" || mode === "pending";
}
