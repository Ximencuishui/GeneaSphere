-- CreateEnum
CREATE TYPE "SmsCodePurpose" AS ENUM ('REGISTER', 'LOGIN', 'RESET_PASSWORD', 'BIND_PHONE');

-- CreateTable
CREATE TABLE "sms_verify_codes" (
    "id" BIGSERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "purpose" "SmsCodePurpose" NOT NULL,
    "ip_address" TEXT,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "sms_verify_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sms_verify_codes_phone_purpose_is_used_idx" ON "sms_verify_codes"("phone", "purpose", "is_used");

-- CreateIndex
CREATE INDEX "sms_verify_codes_expires_at_idx" ON "sms_verify_codes"("expires_at");

-- CreateIndex
CREATE INDEX "sms_verify_codes_ip_address_created_at_idx" ON "sms_verify_codes"("ip_address", "created_at");
