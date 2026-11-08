-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "privateOwnerId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "privateOwnerId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "privateOwnerId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canOwnPrivateClients" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Client_privateOwnerId_idx" ON "Client"("privateOwnerId");

-- CreateIndex
CREATE INDEX "Project_privateOwnerId_idx" ON "Project"("privateOwnerId");

-- CreateIndex
CREATE INDEX "Task_privateOwnerId_idx" ON "Task"("privateOwnerId");

-- Personal clients are for the founder only (requested by the owner). Only an active administrator account qualifies.
UPDATE "User" SET "canOwnPrivateClients" = true WHERE "email" = 'm.makady@lotsofgrowthgroup.com' AND "role" = 'ADMIN';
