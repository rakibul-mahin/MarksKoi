-- DropIndex
DROP INDEX "accounts_profile_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "accounts_profile_id_provider_key" ON "accounts"("profile_id", "provider");

