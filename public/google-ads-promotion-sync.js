/**
 * Watermelon Experiences -> Google Ads promotion sync
 *
 * Paste this script once in Google Ads > Tools > Bulk actions > Scripts,
 * authorize it, and schedule it hourly.
 *
 * It reads website-only promotions from Watermelon and mirrors them as
 * Promotion assets on the Watermelon Performance Max campaign.
 *
 * It DOES NOT change Viator prices or listings.
 */

const WATERMELON_PROMOTION_FEED =
  "https://www.watermelonexperiences.pt/api/google-ads-promotions";
const WATERMELON_CAMPAIGN_ID = "281499272571268";
const WATERMELON_ASSET_PREFIX = "WM_SITE_PROMO_";

function main() {
  const response = UrlFetchApp.fetch(WATERMELON_PROMOTION_FEED, {
    muteHttpExceptions: true,
    followRedirects: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(
      "Watermelon promotion feed returned HTTP " + response.getResponseCode()
    );
  }

  const payload = JSON.parse(response.getContentText());
  const promotions = Array.isArray(payload.promotions) ? payload.promotions : [];
  const campaignId = String(payload.campaignId || WATERMELON_CAMPAIGN_ID).replace(
    /\D/g,
    ""
  );

  if (!campaignId) {
    throw new Error("No Google Ads campaign ID is configured.");
  }

  const campaignRowIterator = AdsApp.search(
    "SELECT campaign.id, campaign.resource_name, campaign.name, campaign.status " +
      "FROM campaign " +
      "WHERE campaign.id = " +
      campaignId +
      " AND campaign.status != 'REMOVED'"
  );

  if (!campaignRowIterator.hasNext()) {
    throw new Error(
      "Watermelon Google Ads campaign " +
        campaignId +
        " was not found in this Google Ads account."
    );
  }

  const campaignRow = campaignRowIterator.next();
  const campaignResourceName = campaignRow.campaign.resourceName;
  const customerId = AdsApp.currentAccount().getCustomerId().replace(/-/g, "");

  const current = [];
  const existingRows = AdsApp.search(
    "SELECT campaign_asset.resource_name, campaign_asset.asset, " +
      "campaign_asset.status, asset.name " +
      "FROM campaign_asset " +
      "WHERE campaign.id = " +
      campaignId +
      " AND campaign_asset.field_type = 'PROMOTION' " +
      "AND campaign_asset.status != 'REMOVED' " +
      "AND asset.name LIKE '" +
      WATERMELON_ASSET_PREFIX +
      "%'"
  );

  while (existingRows.hasNext()) {
    const row = existingRows.next();
    current.push({
      resourceName: row.campaignAsset.resourceName,
      assetName: row.asset.name || "",
    });
  }

  const desiredNames = promotions
    .map(function (promotion) {
      return String(promotion.assetName || "");
    })
    .filter(Boolean)
    .sort();

  const currentNames = current
    .map(function (item) {
      return item.assetName;
    })
    .filter(Boolean)
    .sort();

  if (JSON.stringify(desiredNames) === JSON.stringify(currentNames)) {
    Logger.log(
      "Watermelon promotions are already synchronized. " +
        desiredNames.length +
        " active asset(s)."
    );
    return;
  }

  const operations = [];

  current.forEach(function (item) {
    operations.push({
      campaignAssetOperation: {
        remove: item.resourceName,
      },
    });
  });

  let tempId = -1;

  promotions.forEach(function (promotion) {
    const assetName = String(promotion.assetName || "");
    const target = String(promotion.target || "Watermelon tours").slice(0, 20);
    const percentOff = Math.max(
      1,
      Math.min(99, Number(promotion.percentOff) || 0)
    );

    if (!assetName || !percentOff) return;

    const assetResourceName =
      "customers/" + customerId + "/assets/" + String(tempId--);

    const promotionAsset = {
      promotionTarget: target,
      percentOff: Math.round(percentOff * 10000),
      languageCode: "en",
      termsAndConditionsText:
        String(promotion.terms || "").slice(0, 250) ||
        "Direct bookings on watermelonexperiences.pt only.",
    };

    if (promotion.startsOn) {
      promotionAsset.startDate = promotion.startsOn;
      promotionAsset.redemptionStartDate = promotion.startsOn;
    }

    if (promotion.endsOn) {
      promotionAsset.endDate = promotion.endsOn;
      promotionAsset.redemptionEndDate = promotion.endsOn;
    }

    operations.push({
      assetOperation: {
        create: {
          resourceName: assetResourceName,
          name: assetName,
          finalUrls: [
            String(promotion.finalUrl || "https://www.watermelonexperiences.pt/"),
          ],
          promotionAsset: promotionAsset,
        },
      },
    });

    operations.push({
      campaignAssetOperation: {
        create: {
          campaign: campaignResourceName,
          asset: assetResourceName,
          fieldType: "PROMOTION",
          status: "ENABLED",
        },
      },
    });
  });

  if (!operations.length) {
    Logger.log("No Watermelon promotion changes to apply.");
    return;
  }

  const results = AdsApp.mutateAll(operations, {
    partialFailure: false,
  });

  results.forEach(function (result, index) {
    if (!result.isSuccessful()) {
      throw new Error(
        "Google Ads promotion sync failed at operation " +
          index +
          ": " +
          result.getErrorMessages().join("; ")
      );
    }
  });

  Logger.log(
    "Watermelon Google Ads promotions synchronized: " +
      promotions.length +
      " active promotion asset(s)."
  );
}
