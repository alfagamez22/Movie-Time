import { z } from 'zod';

const image = z.string().max(2000).refine((value) => {
  // TMDB entries use our same-origin optimized artwork, not an external HTTPS URL.
  if (/^\/api\/images\/tmdb\/(?:w92|w300|w780)\/[A-Za-z0-9/_-]+\.(?:avif|gif|jpe?g|png|webp)$/i.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}).optional();
export const titleIdentitySchema = z.object({ mediaId: z.string().trim().min(1).max(128),
  mediaProvider: z.enum(['tmdb', 'anilist', 'anikoto']), mediaType: z.enum(['movie', 'tv']) });
export const personalTitleSchema = titleIdentitySchema.extend({
  title: z.string().trim().min(1).max(300), synopsis: z.string().max(1000).optional(),
  posterUrl: image, backdropUrl: image, year: z.number().int().min(1800).max(2200).optional(),
  rating: z.number().finite().min(0).max(100).optional(), anilistId: z.string().max(128).optional(),
  malId: z.string().max(128).optional(), animeFormat: z.enum(['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC']).optional(),
});
export const trailerHistorySchema = personalTitleSchema.extend({ trailer: z.object({
  title: z.string().trim().min(1).max(300), youtubeId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/),
}) });
export function titleExperience(provider: string) { return provider === 'tmdb' ? 'papiflix' : 'papianime'; }
