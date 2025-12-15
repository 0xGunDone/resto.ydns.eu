-- CreateTable
CREATE TABLE "ShiftSwapHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "shiftDate" DATETIME NOT NULL,
    "shiftStartTime" DATETIME NOT NULL,
    "shiftEndTime" DATETIME NOT NULL,
    "shiftType" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "approvedById" TEXT,
    "notes" TEXT,
    CONSTRAINT "ShiftSwapHistory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftSwapHistory_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftSwapHistory_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftSwapHistory_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ShiftSwapHistory_restaurantId_idx" ON "ShiftSwapHistory"("restaurantId");

-- CreateIndex
CREATE INDEX "ShiftSwapHistory_fromUserId_idx" ON "ShiftSwapHistory"("fromUserId");

-- CreateIndex
CREATE INDEX "ShiftSwapHistory_toUserId_idx" ON "ShiftSwapHistory"("toUserId");

-- CreateIndex
CREATE INDEX "ShiftSwapHistory_status_idx" ON "ShiftSwapHistory"("status");

-- CreateIndex
CREATE INDEX "ShiftSwapHistory_shiftDate_idx" ON "ShiftSwapHistory"("shiftDate");

-- CreateIndex
CREATE INDEX "ShiftSwapHistory_requestedAt_idx" ON "ShiftSwapHistory"("requestedAt");

