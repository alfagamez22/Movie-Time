-- Run once in Capella Query Workbench after reviewing/approving these index writes.
CREATE INDEX `idx_papiflix_user_email`
ON `papiflix`.`_default`.`_default`(`type`, `email`);

CREATE INDEX `idx_papiflix_account_provider`
ON `papiflix`.`_default`.`_default`(`type`, `provider`, `providerAccountId`);

CREATE INDEX `idx_papiflix_user_updated`
ON `papiflix`.`_default`.`_default`(`type`, `userId`, `updatedAt`);

CREATE INDEX `idx_papiflix_user_watched`
ON `papiflix`.`_default`.`_default`(`type`, `userId`, `watchedAt`);

CREATE INDEX `idx_papiflix_record_user_media`
ON `papiflix`.`_default`.`_default`(`type`, `userId`, `mediaId`, `mediaProvider`, `mediaType`);

CREATE INDEX `idx_papiflix_progress_episode`
ON `papiflix`.`_default`.`_default`(`type`, `userId`, `mediaId`, `mediaProvider`, `mediaType`, `season`, `episode`);

CREATE INDEX `idx_papiflix_anime_list`
ON `papiflix`.`_default`.`_default`(`type`, `userId`, `anilistId`, `updatedAt`);

CREATE INDEX `idx_papiflix_comment_media`
ON `papiflix`.`_default`.`_default`(`type`, `mediaId`, `mediaType`, `mediaProvider`, `createdAt`);
