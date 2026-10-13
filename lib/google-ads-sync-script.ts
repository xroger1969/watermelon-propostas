// Delivered with the limited report token only after CRM administrator authentication.
export function buildGoogleAdsSyncScript(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Report receiver is not configured.");
  return GOOGLE_ADS_REPORT_SCRIPT.replace("__WATERMELON_REPORT_TOKEN__", token);
}

export const GOOGLE_ADS_REPORT_SCRIPT = String.raw`/**
 * Watermelon Google Ads -> CRM reports. Schedule hourly in Google Ads Scripts.
 * Reads statistics only. Keep this script private: its token can import reports.
 */
var WATERMELON_REPORT_URL = "https://www.watermelonexperiences.pt/api/google-ads-sync";
var WATERMELON_REPORT_TOKEN = "__WATERMELON_REPORT_TOKEN__";
var WATERMELON_ACCOUNT_ID = "5755985719";
var WATERMELON_CAMPAIGN_ID = "24302500298";

function main() {
  var account = AdsApp.currentAccount();
  var accountId = account.getCustomerId().replace(/-/g, "");
  if (accountId !== WATERMELON_ACCOUNT_ID) throw new Error("Use the Watermelon Google Ads account 575-598-5719.");
  var zone = account.getTimeZone();
  var today = Utilities.formatDate(new Date(), zone, "yyyy-MM-dd");
  var fromDate = new Date(today + "T12:00:00Z");
  fromDate.setUTCDate(fromDate.getUTCDate() - 29);
  var from = fromDate.toISOString().slice(0, 10);
  var metadata = AdsApp.search(
    "SELECT campaign.id, campaign.name, campaign.status, " +
    "campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.primary_status, " +
    "campaign.primary_status_reasons, campaign.final_url_suffix, campaign_budget.amount_micros " +
    "FROM campaign WHERE campaign.id = " + WATERMELON_CAMPAIGN_ID
  );
  if (!metadata.hasNext()) throw new Error("Watermelon campaign was not found. No report was uploaded.");
  var row = metadata.next();
  var campaign = row.campaign;
  // In Google Ads Scripts, fetch PMax dates via the campaign object.
  // Selecting campaign.start_date/end_date through this account's GAQL endpoint fails.
  var pmaxRows = AdsApp.performanceMaxCampaigns().withIds([WATERMELON_CAMPAIGN_ID]).get();
  if (!pmaxRows.hasNext()) throw new Error("Watermelon PMax campaign was not found. No report was uploaded.");
  var pmax = pmaxRows.next();
  function dateString(value) {
    if (!value) return null;
    return String(value.year) + "-" + String(value.month).padStart(2, "0") + "-" + String(value.day).padStart(2, "0");
  }
  var campaignStartDate = dateString(pmax.getStartDate());
  var campaignEndDate = dateString(pmax.getEndDate());
  var days = {};
  // Segmented reports can omit zero-activity dates. The successful complete query
  // below makes these explicit zeros, including today, instead of missing data.
  for (var offset = 0; offset < 30; offset++) {
    var date = new Date(from + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + offset);
    var key = date.toISOString().slice(0, 10);
    days[key] = { reportDate: key, impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 };
  }
  var rows = AdsApp.search(
    "SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, " +
    "metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.id = " +
    WATERMELON_CAMPAIGN_ID + " AND segments.date BETWEEN '" + from + "' AND '" + today + "'"
  );
  while (rows.hasNext()) {
    var item = rows.next();
    var day = item.segments.date;
    if (!days[day]) throw new Error("Google returned a date outside the requested report.");
    days[day] = {
      reportDate: day, impressions: Number(item.metrics.impressions), clicks: Number(item.metrics.clicks),
      cost: Number(item.metrics.costMicros) / 1000000, conversions: Number(item.metrics.conversions),
      conversionValue: Number(item.metrics.conversionsValue)
    };
  }
  var payload = {
    schemaVersion: 1, accountId: accountId, campaignId: WATERMELON_CAMPAIGN_ID,
    currency: account.getCurrencyCode(), timeZone: zone, reportDate: today, snapshotAt: new Date().toISOString(),
    campaign: {
      name: campaign.name, status: campaign.status, budgetAmount: Number(row.campaignBudget.amountMicros) / 1000000,
      startDate: campaignStartDate, endDate: campaignEndDate,
      campaignType: campaign.advertisingChannelType || null, biddingStrategy: campaign.biddingStrategyType || null,
      primaryStatus: campaign.primaryStatus || null, primaryStatusReasons: campaign.primaryStatusReasons || [],
      urlTags: campaign.finalUrlSuffix || null
    },
    daily: Object.keys(days).sort().map(function (key) { return days[key]; })
  };
  if (AdsApp.getExecutionInfo().isPreview()) {
    Logger.log("Preview: read " + payload.daily.length + " report days through " + today + ". Run the script to import them.");
    return;
  }
  var response = UrlFetchApp.fetch(WATERMELON_REPORT_URL, {
    method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + WATERMELON_REPORT_TOKEN },
    payload: JSON.stringify(payload), muteHttpExceptions: true, followRedirects: false
  });
  var result = JSON.parse(response.getContentText());
  if (response.getResponseCode() !== 200 || !result.ok) {
    throw new Error("CRM report upload failed (HTTP " + response.getResponseCode() + "). Check the receiver and run again.");
  }
  Logger.log("Watermelon CRM updated: " + payload.daily.length + " days through " + today + ".");
}
`;
