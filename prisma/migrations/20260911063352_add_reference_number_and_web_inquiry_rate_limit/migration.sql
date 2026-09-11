-- AlterTable
ALTER TABLE "project" ADD COLUMN "referenceNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "project_referenceNumber_key" ON "project"("referenceNumber");

-- CreateTable
CREATE TABLE "web_inquiry_attempt" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_inquiry_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "web_inquiry_attempt_ip_createdAt_idx" ON "web_inquiry_attempt"("ip", "createdAt");
