export const COLLECTIONS = ['identity', 'papiflix', 'papianime', 'mangadex'];

export function collectionForRecord(type, document = {}) {
  if (['user', 'account', 'session', 'verificationToken'].includes(type)) return 'identity';
  if (type === 'papiAnimeProgress') return 'papianime';
  if (document.experience === 'papiflix' || document.experience === 'papianime') return document.experience;
  if (document.experience === 'papimanga' || document.experience === 'mangadex') return 'mangadex';
  if (document.mediaProvider === 'tmdb') return 'papiflix';
  if (document.mediaProvider === 'anilist') return 'papianime';
  if (document.mediaProvider === 'mangadex') return 'mangadex';
  throw new Error(`Cannot determine collection for ${type}`);
}

export const INDEXES = {
  identity: [
    ['idx_identity_user_email', ['type', 'email']],
    ['idx_identity_account_provider', ['type', 'provider', 'providerAccountId']],
  ],
  papiflix: [
    ['idx_papiflix_user_updated', ['type', 'userId', 'updatedAt']],
    ['idx_papiflix_user_watched', ['type', 'userId', 'watchedAt']],
    ['idx_papiflix_record_user_media', ['type', 'userId', 'mediaId', 'mediaProvider', 'mediaType']],
    ['idx_papiflix_progress_episode', ['type', 'userId', 'mediaId', 'mediaProvider', 'mediaType', 'season', 'episode']],
    ['idx_papiflix_comment_media', ['type', 'mediaId', 'mediaType', 'mediaProvider', 'createdAt']],
  ],
  papianime: [
    ['idx_papianime_user_updated', ['type', 'userId', 'updatedAt']],
    ['idx_papianime_user_watched', ['type', 'userId', 'watchedAt']],
    ['idx_papianime_record_user_media', ['type', 'userId', 'mediaId', 'mediaProvider', 'mediaType']],
    ['idx_papianime_progress_episode', ['type', 'userId', 'mediaId', 'mediaProvider', 'mediaType', 'season', 'episode']],
    ['idx_papianime_anime_list', ['type', 'userId', 'anilistId', 'updatedAt']],
    ['idx_papianime_comment_media', ['type', 'mediaId', 'mediaType', 'mediaProvider', 'createdAt']],
  ],
  mangadex: [
    ['idx_mangadex_user_updated', ['type', 'userId', 'updatedAt']],
    ['idx_mangadex_user_watched', ['type', 'userId', 'watchedAt']],
    ['idx_mangadex_record_user_media', ['type', 'userId', 'mediaId', 'mediaProvider', 'mediaType']],
    ['idx_mangadex_progress_episode', ['type', 'userId', 'mediaId', 'mediaProvider', 'mediaType', 'season', 'episode']],
    ['idx_mangadex_comment_media', ['type', 'mediaId', 'mediaType', 'mediaProvider', 'createdAt']],
  ],
  analytics: [
    ['idx_analytics_session_seen', ['type', 'lastSeenAt', 'isAdmin', 'country', 'experience']],
    ['idx_analytics_session_user', ['type', 'userId', 'lastSeenAt']],
  ],
};
