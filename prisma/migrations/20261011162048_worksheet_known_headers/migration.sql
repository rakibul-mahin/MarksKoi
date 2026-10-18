-- AlterTable
ALTER TABLE "sheet_worksheets" ADD COLUMN     "known_headers" TEXT[] DEFAULT ARRAY[]::TEXT[];
