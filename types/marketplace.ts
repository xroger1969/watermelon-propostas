export type MarketplaceProvider = "watermelon" | "viator" | "getyourguide";

export type MarketplaceCatalogProduct = {
  provider: MarketplaceProvider;
  externalId: string;
  title: string;
  description: string;
  image: string;
  url: string;
  duration: string;
  category: string;
  location: string;
  price: number | null;
  currency: string;
  rating?: number;
  reviews?: number;
};

export type MarketplaceIntegrationStatus = {
  provider: MarketplaceProvider;
  configured: boolean;
  enabled: boolean;
  mode: string;
  productCount?: number;
};

export type GetYourGuideAccountStatus = {
  supplierAccount: {
    configured: boolean;
    id: string | null;
    name: string;
    profileUrl: string | null;
    portalUrl: string;
  };
  catalogApiConfigured: boolean;
  catalogEnabled: boolean;
  productCount: number;
  bookingSyncEnabled: false;
  externalConnectionValidated: false;
};
