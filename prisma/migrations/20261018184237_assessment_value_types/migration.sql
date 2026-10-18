-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ValueType" ADD VALUE 'BOOLEAN';
ALTER TYPE "ValueType" ADD VALUE 'COUNT';
ALTER TYPE "ValueType" ADD VALUE 'PERCENT';
ALTER TYPE "ValueType" ADD VALUE 'ATTENDANCE';
ALTER TYPE "ValueType" ADD VALUE 'STATUS';

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "threshold" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "published_assessments" ADD COLUMN     "threshold" DECIMAL(5,2);
