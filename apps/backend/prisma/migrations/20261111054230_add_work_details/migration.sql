-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "customerPhone" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "details" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "expectedCompletion" TIMESTAMP(3),
ADD COLUMN     "workTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
