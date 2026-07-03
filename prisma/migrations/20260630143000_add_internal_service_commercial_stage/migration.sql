ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'internal_service_commercial';

ALTER TYPE "AssetLifecycleState" ADD VALUE IF NOT EXISTS 'awaiting_commercial_review';

ALTER TYPE "InternalServiceStatus" ADD VALUE IF NOT EXISTS 'awaiting_commercial_review';
