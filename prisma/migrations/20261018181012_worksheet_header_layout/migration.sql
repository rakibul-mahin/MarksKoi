-- AlterTable
ALTER TABLE "sheet_worksheets" ADD COLUMN     "data_start_row" INTEGER,
ADD COLUMN     "header_rows" INTEGER NOT NULL DEFAULT 1;
