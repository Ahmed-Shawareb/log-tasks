-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "stage" INTEGER;

-- AlterTable
ALTER TABLE "TaskType" ADD COLUMN     "stages" TEXT[] DEFAULT ARRAY[]::TEXT[];
