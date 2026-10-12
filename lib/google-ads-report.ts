export type AdsReportPeriod = "today" | "last7" | "last30";

export type AdsReportStatus = {
  latestReportDate: string | null;
  lastReceivedAt: string | null;
  timeZone: string;
  coverage: Record<AdsReportPeriod, { reportedDays: number; expectedDays: number }> & {
    previous7?: { reportedDays: number; expectedDays: number };
  };
};

export function getAdsReportState(
  status: AdsReportStatus | null | undefined,
  period: AdsReportPeriod,
  lastSyncedAt: string | null,
  now = Date.now()
) {
  const received = status?.lastReceivedAt || lastSyncedAt;
  const timestamp = received ? Date.parse(received) : NaN;
  const stale = !Number.isFinite(timestamp) || now - timestamp > 6 * 60 * 60 * 1000;
  const coverage = status?.coverage?.[period];
  // An older server response does not prove that a zero was reported.
  const hasReport = Boolean(coverage && coverage.reportedDays > 0);
  return {
    stale,
    hasReport,
    incomplete: !coverage || coverage.reportedDays < coverage.expectedDays,
    automatic: Boolean(status?.lastReceivedAt),
  };
}

export function validateAdsReport(value: unknown): void {
  if (!value || typeof value !== "object") throw new Error("Invalid report.");
  const report = value as Record<string, unknown>;
  if (report.schemaVersion !== 1 || report.accountId !== "5755985719" ||
      report.campaignId !== "24302500298" || report.currency !== "EUR") {
    throw new Error("Unexpected Google Ads account, campaign or currency.");
  }
  if (typeof report.timeZone !== "string" || report.timeZone.length > 80) {
    throw new Error("Invalid report timezone.");
  }
  const until = String(report.reportDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) ||
      new Date(until + "T00:00:00Z").toISOString().slice(0, 10) !== until) {
    throw new Error("Invalid report date.");
  }
  const snapshot = Date.parse(String(report.snapshotAt || ""));
  if (!Number.isFinite(snapshot)) throw new Error("Invalid report timestamp.");
  const campaign = report.campaign as Record<string, unknown> | undefined;
  if (!campaign || typeof campaign.name !== "string" || !campaign.name.trim() ||
      campaign.name.length > 300 || !["ENABLED", "PAUSED", "REMOVED"].includes(String(campaign.status)) ||
      typeof campaign.budgetAmount !== "number" || !Number.isFinite(campaign.budgetAmount) ||
      campaign.budgetAmount < 0 || campaign.budgetAmount > 1e9) {
    throw new Error("Invalid campaign metadata.");
  }
  if (!Array.isArray(report.daily) || report.daily.length !== 30) {
    throw new Error("A complete 30-day report is required.");
  }
  const earliest = new Date(until + "T00:00:00Z");
  earliest.setUTCDate(earliest.getUTCDate() - 29);
  const start = earliest.toISOString().slice(0, 10);
  const dates = new Set<string>();
  for (const raw of report.daily) {
    if (!raw || typeof raw !== "object") throw new Error("Invalid daily metrics.");
    const day = raw as Record<string, unknown>;
    const date = String(day.reportDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < start || date > until ||
        new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date || dates.has(date)) {
      throw new Error("Missing, duplicated or out-of-range report date.");
    }
    dates.add(date);
    for (const key of ["impressions", "clicks", "cost", "conversions", "conversionValue"]) {
      const metric = day[key];
      if (typeof metric !== "number" || !Number.isFinite(metric) || metric < 0 || metric > 1e12 ||
          (["impressions", "clicks"].includes(key) && !Number.isSafeInteger(metric))) {
        throw new Error("Invalid daily metrics.");
      }
    }
  }
}
