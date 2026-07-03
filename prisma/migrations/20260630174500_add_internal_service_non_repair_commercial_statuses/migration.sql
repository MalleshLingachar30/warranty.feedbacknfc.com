ALTER TYPE "InternalServiceStatus" ADD VALUE IF NOT EXISTS 'oem_claim_in_progress';
ALTER TYPE "InternalServiceStatus" ADD VALUE IF NOT EXISTS 'oem_exchange_in_progress';
ALTER TYPE "InternalServiceStatus" ADD VALUE IF NOT EXISTS 'replacement_approved';
ALTER TYPE "InternalServiceStatus" ADD VALUE IF NOT EXISTS 'no_oem_support';

ALTER TYPE "AssetLifecycleState" ADD VALUE IF NOT EXISTS 'oem_claim_in_progress';
ALTER TYPE "AssetLifecycleState" ADD VALUE IF NOT EXISTS 'oem_exchange_in_progress';
ALTER TYPE "AssetLifecycleState" ADD VALUE IF NOT EXISTS 'replacement_approved';
ALTER TYPE "AssetLifecycleState" ADD VALUE IF NOT EXISTS 'no_oem_support';
