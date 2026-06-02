-- CreateTable
CREATE TABLE "PapiAnimeProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "anilistId" TEXT NOT NULL,
    "season" TEXT NOT NULL DEFAULT '1',
    "episode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "posterUrl" TEXT,
    "backdropUrl" TEXT,
    "startAt" INTEGER NOT NULL DEFAULT 0,
    "currentTime" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "lastEventType" TEXT,
    "lastWatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PapiAnimeProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PapiAnimeProgress_userId_anilistId_idx" ON "PapiAnimeProgress"("userId", "anilistId");

-- CreateIndex
CREATE INDEX "PapiAnimeProgress_userId_updatedAt_idx" ON "PapiAnimeProgress"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PapiAnimeProgress_userId_anilistId_season_episode_key" ON "PapiAnimeProgress"("userId", "anilistId", "season", "episode");

-- AddForeignKey
ALTER TABLE "PapiAnimeProgress" ADD CONSTRAINT "PapiAnimeProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
