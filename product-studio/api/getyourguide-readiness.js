/**
 * Integration-readiness endpoint. Read-only and deliberately fail-closed.
 * Never returns credentials or claims an external connection was tested.
 */
function enabled(value) { return value === "true"; }
function configured(value) { return typeof value === "string" && value.trim().length > 0; }

export function getGetYourGuideReadiness(env = process.env) {
  const supplierApproved = enabled(env.GYG_SUPPLIER_APPROVED);
  const supplierCredentialsConfigured = configured(env.GYG_SUPPLIER_BASIC_USER) &&
    configured(env.GYG_SUPPLIER_BASIC_PASSWORD);
  const supplierCertified = enabled(env.GYG_SUPPLIER_CONNECTIVITY_CERTIFIED);
  const supplierRequested = enabled(env.GYG_SUPPLIER_ENABLED);
  const supplierConfigurationComplete = supplierApproved && supplierCertified && supplierCredentialsConfigured;
  const sandboxMode = env.GYG_SUPPLIER_MODE === "sandbox";
  const sandboxActive = env.VERCEL_ENV !== "production" && sandboxMode && supplierRequested && supplierCredentialsConfigured &&
    configured(env.SUPABASE_PRODUCT_STUDIO_URL) && configured(env.PRODUCT_STUDIO_INTERNAL_KEY);
  const partnerApproved = enabled(env.GYG_PARTNER_APPROVED);
  const partnerMode = ["affiliate","api"].includes(env.GYG_PARTNER_MODE) ? env.GYG_PARTNER_MODE : "none";
  const partnerCredentialsConfigured = partnerMode === "affiliate"
    ? configured(env.GYG_AFFILIATE_PARTNER_ID)
    : partnerMode === "api" ? configured(env.GYG_PARTNER_API_KEY) : false;
  const partnerRequested = enabled(env.GYG_PARTNER_ENABLED);
  const partnerConfigurationComplete = partnerApproved && partnerCredentialsConfigured;
  return {
    supplier: {
      supplierSandboxGatewayImplemented: true,
      sandboxEnabled: sandboxActive,
      sandboxConfigured: sandboxMode,
      approvalRecorded: supplierApproved,
      credentialsConfigured: supplierCredentialsConfigured,
      certificationRecorded: supplierCertified,
      activationRequested: supplierRequested,
      configurationComplete: supplierConfigurationComplete,
      externalConnectionValidated: false
    },
    partner: {
      approvalRecorded: partnerApproved,
      accessMode: partnerMode,
      credentialsConfigured: partnerCredentialsConfigured,
      activationRequested: partnerRequested,
      configurationComplete: partnerConfigurationComplete,
      externalConnectionValidated: false
    },
    safeguards: {
      supplierPortalSubmissionRequired: true,
      automaticPublishing: false,
      unauthorizedScraping: false,
      externalBookingsEnabled: false,
      sandboxTransactionLedgerInstalled: true,
      aiRecommendationsEnabled: false
    }
  };
}

export default function handler(req,res) {
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    return res.status(405).json({error:"Method not allowed"});
  }
  return res.status(200).json(getGetYourGuideReadiness());
}
