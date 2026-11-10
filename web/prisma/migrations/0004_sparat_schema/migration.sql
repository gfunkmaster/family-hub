-- CreateTable
CREATE TABLE "SavedSchedule" (
    "runId" TEXT NOT NULL,
    "days" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSchedule_pkey" PRIMARY KEY ("runId")
);

-- AddForeignKey
ALTER TABLE "SavedSchedule" ADD CONSTRAINT "SavedSchedule_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
