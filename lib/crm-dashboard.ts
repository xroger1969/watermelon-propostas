/**
 * Pure CRM dashboard calculations.
 * Analytics conversion events are intentionally excluded: these counters
 * describe current CRM records, not historical marketing attribution.
 */
export type CRMStatus =
  | "new"
  | "in_review"
  | "awaiting_customer"
  | "proposal_drafting"
  | "proposal_sent"
  | "customer_replied"
  | "accepted"
  | "awaiting_payment"
  | "confirmed"
  | "in_service"
  | "completed"
  | "no_show"
  | "declined"
  | "cancelled";

export const IN_PROGRESS_STATUSES: CRMStatus[] = [
  "in_review",
  "awaiting_customer",
  "proposal_drafting",
  "customer_replied",
  "accepted",
];

export type DashboardRow = {
  status: CRMStatus;
  dates: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOffset(date: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return null;
  }
  const target = Date.parse(date + "T00:00:00Z");
  const start = Date.parse(today + "T00:00:00Z");
  if (!Number.isFinite(target) || !Number.isFinite(start)) return null;
  return Math.round((target - start) / DAY_MS);
}

export function countCRMRequests(requests: readonly DashboardRow[], today: string) {
  const isScheduled = (item: DashboardRow, min: number, max: number) =>
    item.dates.some((date) => {
      const days = dateOffset(date, today);
      return days !== null && days >= min && days <= max;
    });

  return {
    new: requests.filter((item) => item.status === "new").length,
    inReview: requests.filter((item) => IN_PROGRESS_STATUSES.includes(item.status)).length,
    proposalSent: requests.filter((item) => item.status === "proposal_sent").length,
    awaitingPayment: requests.filter((item) => item.status === "awaiting_payment").length,
    confirmed: requests.filter((item) => item.status === "confirmed").length,
    today: requests.filter(
      (item) =>
        ["confirmed", "in_service", "completed", "no_show"].includes(item.status) &&
        isScheduled(item, 0, 0)
    ).length,
    upcoming: requests.filter(
      (item) =>
        ["confirmed", "in_service"].includes(item.status) &&
        isScheduled(item, 1, 7)
    ).length,
    completed: requests.filter((item) => item.status === "completed").length,
  };
}
