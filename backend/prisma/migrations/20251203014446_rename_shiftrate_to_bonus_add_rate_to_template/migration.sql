-- Переименование shiftRate в bonusPerShift для Position (SQLite требует пересоздание таблицы)
CREATE TABLE "Position_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "bonusPerShift" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "Position_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Копируем данные, преобразуя shiftRate в bonusPerShift
INSERT INTO "Position_new" ("id", "restaurantId", "name", "isActive", "createdAt", "updatedAt", "bonusPerShift")
SELECT 
    "id",
    "restaurantId",
    "name",
    "isActive",
    "createdAt",
    "updatedAt",
    COALESCE("shiftRate", 0) as "bonusPerShift"
FROM "Position";

-- Удаляем старую таблицу
DROP TABLE "Position";

-- Переименовываем новую таблицу
ALTER TABLE "Position_new" RENAME TO "Position";

-- Восстанавливаем индексы
CREATE INDEX "Position_restaurantId_idx" ON "Position"("restaurantId");

-- Добавляем rate в ShiftTemplate
ALTER TABLE "ShiftTemplate" ADD COLUMN "rate" REAL NOT NULL DEFAULT 0;

