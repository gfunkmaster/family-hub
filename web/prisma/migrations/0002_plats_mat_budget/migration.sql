-- DropForeignKey
ALTER TABLE "Request" DROP CONSTRAINT "Request_cityId_fkey";

-- DropForeignKey
ALTER TABLE "Run" DROP CONSTRAINT "Run_cityId_fkey";

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "error" TEXT,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'kö',
ADD COLUMN     "place" JSONB,
ADD COLUMN     "radiusKm" INTEGER,
ALTER COLUMN "cityId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "food" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "packed" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "place" JSONB,
ALTER COLUMN "cityId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AgentUsage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "webSearches" INTEGER NOT NULL DEFAULT 0,
    "webFetches" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentUsage_createdAt_idx" ON "AgentUsage"("createdAt");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
