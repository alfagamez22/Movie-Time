-- CreateTable
CREATE TABLE "MediaComment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "mediaProvider" TEXT NOT NULL,
    "experience" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaComment_mediaId_mediaProvider_mediaType_createdAt_idx" ON "MediaComment"("mediaId", "mediaProvider", "mediaType", "createdAt");

-- CreateIndex
CREATE INDEX "MediaComment_userId_createdAt_idx" ON "MediaComment"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "MediaComment" ADD CONSTRAINT "MediaComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
