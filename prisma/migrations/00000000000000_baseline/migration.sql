-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'SENT', 'WON', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PartnerKind" AS ENUM ('CEE', 'LOCAL_BUSINESS', 'ARTISAN');

-- CreateEnum
CREATE TYPE "SupplierCode" AS ENUM ('midocean', 'makito');

-- CreateEnum
CREATE TYPE "PriceTierSource" AS ENUM ('MIDOCEAN_PRICELIST', 'MAKITO_PRICELIST', 'DEFAULT_ESTIMATE', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "PricingType" AS ENUM ('NumberOfPositions', 'AreaRange', 'Area', 'NumberOfColours', 'ColourAreaRange');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('CEO', 'COMERCIAL', 'FACTURACION', 'OPERACIONES');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('LEAD', 'EARNED', 'PAID_OUT', 'REFUSED');

-- CreateEnum
CREATE TYPE "CouponKind" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "CartQuoteStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'SENT', 'CONFIRMED', 'ORDERED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProofStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVISION', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('DEPOSIT', 'FULL', 'BALANCE');

-- CreateEnum
CREATE TYPE "BlogIntent" AS ENUM ('INFORMATIONAL', 'TRANSACTIONAL', 'NAVIGATIONAL', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "BlogPostStatus" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('METRICOOL', 'META_ADS', 'GOOGLE_ADS', 'LINKEDIN_ADS', 'RESEND', 'STRIPE');

-- CreateEnum
CREATE TYPE "CampaignObjective" AS ENUM ('LEADS', 'CONVERSIONS', 'TRAFFIC', 'AWARENESS', 'RETENTION');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('PLANNED', 'ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('POST', 'STORY', 'REEL', 'CARRUSEL', 'EMAIL', 'AD', 'BLOG', 'LANDING');

-- CreateEnum
CREATE TYPE "ContentChannel" AS ENUM ('IG', 'FB', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'EMAIL', 'WEB', 'GOOGLE_ADS', 'META_ADS', 'LINKEDIN_ADS');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CustomerSegment" AS ENUM ('ENTERPRISE', 'MIDMARKET', 'STARTUP', 'ONE_OFF', 'PARTNER', 'CHURNED');

-- CreateEnum
CREATE TYPE "BroadcastAudience" AS ENUM ('NEWSLETTER_ALL', 'NEWSLETTER_NEW', 'CUSTOMERS_ALL', 'CART_QUOTES_RECENT');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "DeliveryAttempt" AS ENUM ('SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "BannerSlot" AS ENUM ('HOME_TOP', 'HOME_MID', 'CATALOGO_TOP', 'FICHA_PRODUCTO', 'FOOTER');

-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "productHint" TEXT,
    "productRef" TEXT,
    "quantity" INTEGER,
    "deadline" TEXT,
    "budget" TEXT,
    "message" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT,
    "utm" JSONB,

    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteNote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "body" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "QuoteNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PartnerKind" NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "description" TEXT NOT NULL,
    "services" TEXT[],
    "logoUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "supplier" "SupplierCode" NOT NULL,
    "supplierRef" TEXT NOT NULL,
    "internalRef" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "shortDescription" TEXT,
    "longDescription" TEXT,
    "enhancedShortDescription" TEXT,
    "enhancedAt" TIMESTAMP(3),
    "material" TEXT,
    "categoryId" TEXT,
    "supplierCategoryCode" TEXT,
    "weightG" INTEGER,
    "lengthMm" INTEGER,
    "widthMm" INTEGER,
    "heightMm" INTEGER,
    "primaryImageUrl" TEXT,
    "countryOfOrigin" TEXT,
    "ecoLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fromPriceCents" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOverride" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customName" TEXT,
    "customDescription" TEXT,
    "customFromPriceCents" INTEGER,
    "marginPct" INTEGER,
    "extraImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "marketingTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "internalNotes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ProductOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "variantId" TEXT,
    "colorName" TEXT,
    "colorGroup" TEXT,
    "colorHex" TEXT,
    "gtin" TEXT,
    "size" TEXT,
    "stockQty" INTEGER NOT NULL DEFAULT 0,
    "stockUpdatedAt" TIMESTAMP(3),
    "imageUrl" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceTier" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "minQty" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "source" "PriceTierSource" NOT NULL DEFAULT 'DEFAULT_ESTIMATE',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkingPosition" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "maxWidthMm" DOUBLE PRECISION,
    "maxHeightMm" DOUBLE PRECISION,
    "imageUrl" TEXT,

    CONSTRAINT "MarkingPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkingTechnique" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pricingType" "PricingType",
    "setupCents" INTEGER,
    "setupRepeatCents" INTEGER,
    "hasNextColour" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MarkingTechnique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkingPriceScale" (
    "id" TEXT NOT NULL,
    "techniqueCode" TEXT NOT NULL,
    "rangeId" TEXT,
    "areaFromCm2" DOUBLE PRECISION,
    "areaToCm2" DOUBLE PRECISION,
    "minQty" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "nextColourCostCents" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarkingPriceScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintManipulation" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintManipulation_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'COMERCIAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "passwordHash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    "magicLinkToken" TEXT,
    "magicLinkExpiresAt" TIMESTAMP(3),

    CONSTRAINT "CustomerUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "keyPrefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rateLimit" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDeliveredAt" TIMESTAMP(3),
    "lastFailedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastResponseStatus" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "source" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "optedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),
    "unsubscribeToken" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3),
    "totalSent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDripSent" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDripSent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePartner" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "commissionPct" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "totalEarnedCents" INTEGER NOT NULL DEFAULT 0,
    "totalPaidOutCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliatePartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'LEAD',
    "baseAmountCents" INTEGER NOT NULL DEFAULT 0,
    "commissionCents" INTEGER NOT NULL DEFAULT 0,
    "paidOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductEmbedding" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "vector" DOUBLE PRECISION[],
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "CouponKind" NOT NULL,
    "percentValue" INTEGER,
    "fixedCents" INTEGER,
    "minTotalCents" INTEGER,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "npsScore" INTEGER,
    "comment" TEXT,
    "authorName" TEXT,
    "authorCompany" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "path" TEXT,
    "productSlug" TEXT,
    "payload" JSONB,
    "sessionId" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartQuote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "shippingAddress" TEXT,
    "shippingPostalCode" TEXT,
    "shippingCity" TEXT,
    "shippingCountry" TEXT DEFAULT 'ES',
    "vatNumber" TEXT,
    "message" TEXT,
    "deadline" TEXT,
    "source" TEXT,
    "utm" JSONB,
    "status" "CartQuoteStatus" NOT NULL DEFAULT 'NEW',
    "internalNotes" TEXT,
    "estimatedTotalCents" INTEGER,
    "midoceanOrderId" TEXT,
    "midoceanCustomerOrderRef" TEXT,
    "midoceanOrderStatus" TEXT,
    "midoceanOrderPayload" JSONB,
    "midoceanOrderResponse" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "orderedAt" TIMESTAMP(3),
    "acceptedTotalCents" INTEGER,
    "depositPercent" INTEGER,
    "paymentLinkToken" TEXT,
    "paymentLinkSentAt" TIMESTAMP(3),
    "customerToken" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "recoveredAt" TIMESTAMP(3),

    CONSTRAINT "CartQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartQuoteItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "productRef" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "primaryImageUrl" TEXT,
    "quantity" INTEGER NOT NULL,
    "variantSku" TEXT,
    "colorName" TEXT,
    "markingTechniqueCode" TEXT,
    "markingTechniqueName" TEXT,
    "markingPositionId" TEXT,
    "markingColours" INTEGER,
    "markingComplexity" TEXT,
    "unitPriceClientCents" INTEGER,
    "totalClientCents" INTEGER,
    "customerLogoUrl" TEXT,
    "customerLogoFilename" TEXT,
    "customerLogoSize" INTEGER,
    "notes" TEXT,

    CONSTRAINT "CartQuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderProof" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "ProofStatus" NOT NULL DEFAULT 'PENDING',
    "midoceanProofId" TEXT,
    "productSlug" TEXT,
    "artworkUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "OrderProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "kind" "PaymentKind" NOT NULL DEFAULT 'DEPOSIT',
    "stripeMode" TEXT,
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeReceiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "invoiceNumber" TEXT,
    "invoiceIssuedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderTracking" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT,
    "trackingCode" TEXT,
    "carrier" TEXT,
    "carrierUrl" TEXT,
    "rawJson" JSONB,

    CONSTRAINT "OrderTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkingPricelistSync" (
    "id" TEXT NOT NULL,
    "supplier" "SupplierCode" NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "techniquesCount" INTEGER NOT NULL DEFAULT 0,
    "scalesCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MarkingPricelistSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkingTechniqueOnPosition" (
    "positionId" TEXT NOT NULL,
    "techniqueId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "maxColors" INTEGER,

    CONSTRAINT "MarkingTechniqueOnPosition_pkey" PRIMARY KEY ("positionId","techniqueId")
);

-- CreateTable
CREATE TABLE "RecommenderQuery" (
    "id" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "budget" INTEGER,
    "quantity" INTEGER,
    "ecoOnly" BOOLEAN NOT NULL DEFAULT false,
    "needsClarification" BOOLEAN,
    "fallback" BOOLEAN NOT NULL DEFAULT false,
    "recommendedSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "modelUsed" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "ip" TEXT,
    "ua" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommenderQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "hash" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "kind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "PageSeo" (
    "path" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "ogImage" TEXT,
    "robots" TEXT,
    "schemaJson" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "PageSeo_pkey" PRIMARY KEY ("path")
);

-- CreateTable
CREATE TABLE "QuoteSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "heroTitle" TEXT NOT NULL DEFAULT 'Cuéntanos qué necesitas.',
    "heroSubtitle" TEXT NOT NULL DEFAULT 'Te respondemos en 24h.',
    "heroBullets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "responseHours" INTEGER NOT NULL DEFAULT 24,
    "requireCompany" BOOLEAN NOT NULL DEFAULT false,
    "requirePhone" BOOLEAN NOT NULL DEFAULT false,
    "requireDeadline" BOOLEAN NOT NULL DEFAULT false,
    "showBudgetField" BOOLEAN NOT NULL DEFAULT true,
    "deadlineOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "paymentMethods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "successTitle" TEXT NOT NULL DEFAULT 'Recibido. Ya estamos en ello.',
    "successMessage" TEXT NOT NULL DEFAULT 'Te respondemos por email en menos de {hours} horas laborables con cotización cerrada.',
    "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoReplySubject" TEXT NOT NULL DEFAULT 'Recibimos tu solicitud · TodoMerchandising',
    "autoReplyHtml" TEXT NOT NULL DEFAULT '',
    "internalNotifyEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "showOnHome" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "QuoteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadMagnet" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT NOT NULL,
    "heroUrl" TEXT,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "LeadMagnet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadDownload" (
    "id" TEXT NOT NULL,
    "magnetId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "referer" TEXT,
    "ipHash" TEXT,
    "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadDownload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSpend" (
    "id" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "medium" TEXT NOT NULL,
    "campaign" TEXT,
    "spendCents" INTEGER NOT NULL,
    "impressions" INTEGER,
    "clicks" INTEGER,
    "conversions" INTEGER,
    "notes" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "MarketingSpend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "bodyMd" TEXT NOT NULL,
    "heroUrl" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "keywordTarget" TEXT,
    "intent" "BlogIntent" NOT NULL DEFAULT 'INFORMATIONAL',
    "schemaJson" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "metrics" JSONB,
    "author" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "provider" "IntegrationProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" "CampaignObjective" NOT NULL DEFAULT 'LEADS',
    "channels" TEXT[],
    "budgetCents" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "CampaignStatus" NOT NULL DEFAULT 'PLANNED',
    "utmCampaign" TEXT NOT NULL,
    "adAccountIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPiece" (
    "id" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "channel" "ContentChannel" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "copy" TEXT NOT NULL,
    "copyVariations" JSONB,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "creativeUrl" TEXT,
    "creativeBrief" TEXT,
    "productSlug" TEXT,
    "campaignId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "channelResponse" JSONB,
    "utmContent" TEXT,
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentMetric" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "engagements" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "spendCents" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "raw" JSONB,

    CONSTRAINT "ContentMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "clientName" TEXT,
    "productSlug" TEXT,
    "sector" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "email" TEXT NOT NULL,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "segment" "CustomerSegment",
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "EmailBroadcast" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "html" TEXT NOT NULL,
    "text" TEXT,
    "audience" "BroadcastAudience" NOT NULL DEFAULT 'NEWSLETTER_ALL',
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "EmailBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastDelivery" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "DeliveryAttempt" NOT NULL DEFAULT 'SENT',
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingBanner" (
    "id" TEXT NOT NULL,
    "slot" "BannerSlot" NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "imageUrl" TEXT,
    "bgColor" TEXT,
    "textColor" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "MarketingBanner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SupplierSync" (
    "id" TEXT NOT NULL,
    "supplier" "SupplierCode" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "productsFetched" INTEGER NOT NULL DEFAULT 0,
    "productsUpserted" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" JSONB,
    "notes" TEXT,

    CONSTRAINT "SupplierSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteRequest_status_idx" ON "QuoteRequest"("status");

-- CreateIndex
CREATE INDEX "QuoteRequest_email_idx" ON "QuoteRequest"("email");

-- CreateIndex
CREATE INDEX "QuoteRequest_createdAt_idx" ON "QuoteRequest"("createdAt");

-- CreateIndex
CREATE INDEX "QuoteNote_requestId_idx" ON "QuoteNote"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_slug_key" ON "Partner"("slug");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "Category_slug_idx" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_parentId_slug_key" ON "Category"("parentId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_internalRef_key" ON "Product"("internalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_active_idx" ON "Product"("active");

-- CreateIndex
CREATE INDEX "Product_syncedAt_idx" ON "Product"("syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_supplier_supplierRef_key" ON "Product"("supplier", "supplierRef");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOverride_productId_key" ON "ProductOverride"("productId");

-- CreateIndex
CREATE INDEX "ProductOverride_featured_idx" ON "ProductOverride"("featured");

-- CreateIndex
CREATE INDEX "ProductOverride_hidden_idx" ON "ProductOverride"("hidden");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_sku_idx" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "PriceTier_variantId_idx" ON "PriceTier"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceTier_variantId_minQty_key" ON "PriceTier"("variantId", "minQty");

-- CreateIndex
CREATE INDEX "MarkingPosition_productId_idx" ON "MarkingPosition"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "MarkingTechnique_code_key" ON "MarkingTechnique"("code");

-- CreateIndex
CREATE INDEX "MarkingPriceScale_techniqueCode_idx" ON "MarkingPriceScale"("techniqueCode");

-- CreateIndex
CREATE UNIQUE INDEX "MarkingPriceScale_techniqueCode_rangeId_minQty_key" ON "MarkingPriceScale"("techniqueCode", "rangeId", "minQty");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_active_idx" ON "AdminUser"("active");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerUser_email_key" ON "CustomerUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerUser_magicLinkToken_key" ON "CustomerUser"("magicLinkToken");

-- CreateIndex
CREATE INDEX "CustomerUser_active_idx" ON "CustomerUser"("active");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyPrefix_key" ON "ApiKey"("keyPrefix");

-- CreateIndex
CREATE INDEX "ApiKey_active_idx" ON "ApiKey"("active");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_apiKeyId_idx" ON "WebhookEndpoint"("apiKeyId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_active_idx" ON "WebhookEndpoint"("active");

-- CreateIndex
CREATE INDEX "WebhookDelivery_endpointId_idx" ON "WebhookDelivery"("endpointId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextRetryAt_idx" ON "WebhookDelivery"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_unsubscribeToken_key" ON "NewsletterSubscriber"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_unsubscribedAt_idx" ON "NewsletterSubscriber"("unsubscribedAt");

-- CreateIndex
CREATE INDEX "EmailDripSent_cartId_idx" ON "EmailDripSent"("cartId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDripSent_cartId_step_key" ON "EmailDripSent"("cartId", "step");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliatePartner_slug_key" ON "AffiliatePartner"("slug");

-- CreateIndex
CREATE INDEX "AffiliatePartner_active_idx" ON "AffiliatePartner"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_cartId_key" ON "Referral"("cartId");

-- CreateIndex
CREATE INDEX "Referral_partnerId_idx" ON "Referral"("partnerId");

-- CreateIndex
CREATE INDEX "Referral_status_idx" ON "Referral"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductEmbedding_productId_key" ON "ProductEmbedding"("productId");

-- CreateIndex
CREATE INDEX "ProductEmbedding_productId_idx" ON "ProductEmbedding"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_active_idx" ON "Coupon"("active");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_cartId_key" ON "CouponRedemption"("cartId");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_idx" ON "CouponRedemption"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_token_key" ON "Review"("token");

-- CreateIndex
CREATE INDEX "Review_cartId_idx" ON "Review"("cartId");

-- CreateIndex
CREATE INDEX "Review_approved_submittedAt_idx" ON "Review"("approved", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_type_createdAt_idx" ON "AnalyticsEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_productSlug_idx" ON "AnalyticsEvent"("productSlug");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_sessionId_idx" ON "AnalyticsEvent"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CartQuote_midoceanOrderId_key" ON "CartQuote"("midoceanOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "CartQuote_paymentLinkToken_key" ON "CartQuote"("paymentLinkToken");

-- CreateIndex
CREATE UNIQUE INDEX "CartQuote_customerToken_key" ON "CartQuote"("customerToken");

-- CreateIndex
CREATE INDEX "CartQuote_status_idx" ON "CartQuote"("status");

-- CreateIndex
CREATE INDEX "CartQuote_email_idx" ON "CartQuote"("email");

-- CreateIndex
CREATE INDEX "CartQuote_createdAt_idx" ON "CartQuote"("createdAt");

-- CreateIndex
CREATE INDEX "CartQuote_reminderSentAt_idx" ON "CartQuote"("reminderSentAt");

-- CreateIndex
CREATE INDEX "CartQuoteItem_cartId_idx" ON "CartQuoteItem"("cartId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderProof_token_key" ON "OrderProof"("token");

-- CreateIndex
CREATE INDEX "OrderProof_cartId_idx" ON "OrderProof"("cartId");

-- CreateIndex
CREATE INDEX "OrderProof_token_idx" ON "OrderProof"("token");

-- CreateIndex
CREATE INDEX "OrderProof_status_idx" ON "OrderProof"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeSessionId_key" ON "Payment"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_invoiceNumber_key" ON "Payment"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Payment_cartId_idx" ON "Payment"("cartId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "OrderTracking_cartId_idx" ON "OrderTracking"("cartId");

-- CreateIndex
CREATE UNIQUE INDEX "MarkingPricelistSync_supplier_key" ON "MarkingPricelistSync"("supplier");

-- CreateIndex
CREATE INDEX "RecommenderQuery_createdAt_idx" ON "RecommenderQuery"("createdAt");

-- CreateIndex
CREATE INDEX "RecommenderQuery_fallback_idx" ON "RecommenderQuery"("fallback");

-- CreateIndex
CREATE INDEX "RecommenderQuery_needsClarification_idx" ON "RecommenderQuery"("needsClarification");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_originalUrl_key" ON "MediaAsset"("originalUrl");

-- CreateIndex
CREATE INDEX "MediaAsset_originalUrl_idx" ON "MediaAsset"("originalUrl");

-- CreateIndex
CREATE UNIQUE INDEX "LeadMagnet_slug_key" ON "LeadMagnet"("slug");

-- CreateIndex
CREATE INDEX "LeadMagnet_active_featured_idx" ON "LeadMagnet"("active", "featured");

-- CreateIndex
CREATE INDEX "LeadDownload_magnetId_idx" ON "LeadDownload"("magnetId");

-- CreateIndex
CREATE INDEX "LeadDownload_email_idx" ON "LeadDownload"("email");

-- CreateIndex
CREATE INDEX "LeadDownload_downloadedAt_idx" ON "LeadDownload"("downloadedAt");

-- CreateIndex
CREATE INDEX "MarketingSpend_month_idx" ON "MarketingSpend"("month");

-- CreateIndex
CREATE INDEX "MarketingSpend_source_idx" ON "MarketingSpend"("source");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingSpend_month_source_medium_campaign_key" ON "MarketingSpend"("month", "source", "medium", "campaign");

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");

-- CreateIndex
CREATE INDEX "BlogPost_status_publishedAt_idx" ON "BlogPost"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "BlogPost_slug_idx" ON "BlogPost"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_utmCampaign_key" ON "Campaign"("utmCampaign");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_startsAt_idx" ON "Campaign"("startsAt");

-- CreateIndex
CREATE INDEX "ContentPiece_status_idx" ON "ContentPiece"("status");

-- CreateIndex
CREATE INDEX "ContentPiece_channel_idx" ON "ContentPiece"("channel");

-- CreateIndex
CREATE INDEX "ContentPiece_scheduledAt_idx" ON "ContentPiece"("scheduledAt");

-- CreateIndex
CREATE INDEX "ContentPiece_campaignId_idx" ON "ContentPiece"("campaignId");

-- CreateIndex
CREATE INDEX "ContentMetric_day_idx" ON "ContentMetric"("day");

-- CreateIndex
CREATE UNIQUE INDEX "ContentMetric_pieceId_day_source_key" ON "ContentMetric"("pieceId", "day", "source");

-- CreateIndex
CREATE INDEX "PortfolioItem_active_featured_idx" ON "PortfolioItem"("active", "featured");

-- CreateIndex
CREATE INDEX "PortfolioItem_order_idx" ON "PortfolioItem"("order");

-- CreateIndex
CREATE INDEX "CustomerProfile_segment_idx" ON "CustomerProfile"("segment");

-- CreateIndex
CREATE INDEX "EmailBroadcast_status_idx" ON "EmailBroadcast"("status");

-- CreateIndex
CREATE INDEX "EmailBroadcast_scheduledAt_idx" ON "EmailBroadcast"("scheduledAt");

-- CreateIndex
CREATE INDEX "BroadcastDelivery_broadcastId_idx" ON "BroadcastDelivery"("broadcastId");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastDelivery_broadcastId_email_key" ON "BroadcastDelivery"("broadcastId", "email");

-- CreateIndex
CREATE INDEX "MarketingBanner_slot_active_idx" ON "MarketingBanner"("slot", "active");

-- CreateIndex
CREATE INDEX "MarketingBanner_startsAt_idx" ON "MarketingBanner"("startsAt");

-- CreateIndex
CREATE INDEX "MarketingBanner_endsAt_idx" ON "MarketingBanner"("endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierSync_supplier_key" ON "SupplierSync"("supplier");

-- AddForeignKey
ALTER TABLE "QuoteNote" ADD CONSTRAINT "QuoteNote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOverride" ADD CONSTRAINT "ProductOverride_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkingPosition" ADD CONSTRAINT "MarkingPosition_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkingPriceScale" ADD CONSTRAINT "MarkingPriceScale_techniqueCode_fkey" FOREIGN KEY ("techniqueCode") REFERENCES "MarkingTechnique"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductEmbedding" ADD CONSTRAINT "ProductEmbedding_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "CartQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "CartQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartQuoteItem" ADD CONSTRAINT "CartQuoteItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "CartQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProof" ADD CONSTRAINT "OrderProof_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "CartQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "CartQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTracking" ADD CONSTRAINT "OrderTracking_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "CartQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkingTechniqueOnPosition" ADD CONSTRAINT "MarkingTechniqueOnPosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "MarkingPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkingTechniqueOnPosition" ADD CONSTRAINT "MarkingTechniqueOnPosition_techniqueId_fkey" FOREIGN KEY ("techniqueId") REFERENCES "MarkingTechnique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDownload" ADD CONSTRAINT "LeadDownload_magnetId_fkey" FOREIGN KEY ("magnetId") REFERENCES "LeadMagnet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentMetric" ADD CONSTRAINT "ContentMetric_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastDelivery" ADD CONSTRAINT "BroadcastDelivery_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "EmailBroadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
