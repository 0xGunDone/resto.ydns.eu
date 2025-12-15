-- DropIndex
DROP INDEX "ShiftTemplate_restaurantId_name_key";

-- CreateIndex
CREATE INDEX "ShiftTemplate_name_idx" ON "ShiftTemplate"("name");
