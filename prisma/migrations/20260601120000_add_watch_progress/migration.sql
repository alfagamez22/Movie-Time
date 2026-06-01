-- CreateTable
CREATE TABLE "WatchProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "mediaProvider" TEXT NOT NULL,
    "experience" TEXT NOT NULL,
    "season" TEXT NOT NULL DEFAULT '',
    "episode" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "posterUrl" TEXT,
    "backdropUrl" TEXT,
    "rating" DOUBLE PRECISION,
    "year" INTEGER,
    "progressSeconds" INTEGER NOT NULL DEFAULT 0,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "anilistId" TEXT,
    "malId" TEXT,
    "animeFormat" TEXT,
    "defaultLanguage" TEXT,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WatchProgress_userId_experience_idx" ON "WatchProgress"("userId", "experience");

-- CreateIndex
CREATE INDEX "WatchProgress_userId_mediaId_mediaProvider_mediaType_idx" ON "WatchProgress"("userId", "mediaId", "mediaProvider", "mediaType");

-- CreateIndex
CREATE UNIQUE INDEX "WatchProgress_userId_mediaId_mediaProvider_mediaType_season_" ON "WatchProgress"("userId", "mediaId", "mediaProvider", "mediaType", "season", "episode");

-- AddForeignKey
ALTER TABLE "WatchProgress" ADD CONSTRAINT "WatchProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
