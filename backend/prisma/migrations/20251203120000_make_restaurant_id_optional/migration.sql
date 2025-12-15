-- Make restaurantId optional in InviteLink
-- First, we need to drop the foreign key constraint
-- Then alter the column to allow NULL
-- Then recreate the foreign key constraint (which SQLite doesn't fully support, so we skip it)

-- Step 1: Create a new table with the optional restaurantId
CREATE TABLE "InviteLink_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "restaurantId" TEXT,
    "positionId" TEXT,
    "departmentId" TEXT,
    "createdById" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InviteLink_token_key" UNIQUE ("token"),
    CONSTRAINT "InviteLink_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InviteLink_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InviteLink_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InviteLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 2: Copy data from old table to new table
INSERT INTO "InviteLink_new" SELECT * FROM "InviteLink";

-- Step 3: Drop old table
DROP TABLE "InviteLink";

-- Step 4: Rename new table to old name
ALTER TABLE "InviteLink_new" RENAME TO "InviteLink";

-- Step 5: Recreate indexes
CREATE INDEX "InviteLink_token_idx" ON "InviteLink"("token");
CREATE INDEX "InviteLink_restaurantId_idx" ON "InviteLink"("restaurantId");
CREATE INDEX "InviteLink_createdById_idx" ON "InviteLink"("createdById");
CREATE INDEX "InviteLink_isActive_idx" ON "InviteLink"("isActive");

