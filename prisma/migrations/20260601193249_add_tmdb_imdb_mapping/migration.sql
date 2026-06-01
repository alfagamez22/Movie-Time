-- CreateTable
CREATE TABLE "TmdbImdbMapping" (
    "id" TEXT NOT NULL,
    "tmdbId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "imdbId" TEXT NOT NULL,

    CONSTRAINT "TmdbImdbMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TmdbImdbMapping_imdbId_idx" ON "TmdbImdbMapping"("imdbId");

-- CreateIndex
CREATE INDEX "TmdbImdbMapping_tmdbId_idx" ON "TmdbImdbMapping"("tmdbId");

-- CreateIndex
CREATE UNIQUE INDEX "TmdbImdbMapping_tmdbId_type_key" ON "TmdbImdbMapping"("tmdbId", "type");

-- RenameIndex
ALTER INDEX "WatchProgress_userId_mediaId_mediaProvider_mediaType_season_" RENAME TO "WatchProgress_userId_mediaId_mediaProvider_mediaType_season_key";
