import type { CRMStatus } from "./crm-dashboard";

export type OperationalStatus = "in_service" | "completed" | "no_show";

/** Both action panels must follow the same ordered service workflow. */
export function allowedOperationalStatuses(
  status: CRMStatus,
  paid: boolean,
  scheduled: boolean
): OperationalStatus[] {
  if (status === "in_service") return ["completed", "no_show"];
  if (status === "confirmed" && paid && scheduled) return ["in_service", "no_show"];
  return [];
}

type PersistedOperation = {
  status?: string | null;
  linked_booking_id?: string | null;
  booking?: { status?: string | null } | { status?: string | null }[] | null;
};

/** Verify the persisted request and its linked booking before reporting success. */
export function hasPersistedOperationalStatus(
  row: PersistedOperation | null,
  status: OperationalStatus
): boolean {
  if (!row || row.status !== status) return false;
  if (!row.linked_booking_id) return true;
  const booking = Array.isArray(row.booking) ? row.booking[0] : row.booking;
  return booking?.status === status;
}
