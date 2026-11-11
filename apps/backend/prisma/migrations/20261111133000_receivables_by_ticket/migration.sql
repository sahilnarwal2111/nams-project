-- Receivables move from client records to tickets: each Task carries the
-- amount to charge, and payments are recorded against the task.
--
-- The client-wise records and the payments recorded against them were sample
-- data and are removed here, as the owner decided on 2026-11-11. A payment
-- cannot be carried over, because a client record was not linked to any task.
DELETE FROM "Payment";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_clientId_fkey";

-- DropIndex
DROP INDEX "Payment_clientId_idx";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "clientId",
ADD COLUMN     "taskId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "fee" INTEGER,
ADD COLUMN     "lastReminder" TIMESTAMP(3);

-- DropTable
DROP TABLE "Client";

-- CreateIndex
CREATE INDEX "Payment_taskId_idx" ON "Payment"("taskId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
