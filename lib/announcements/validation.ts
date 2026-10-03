export interface AnnouncementInput {
  title: string;
  description: string;
  state: 'draft' | 'published';
  publishAt: string;
  expiresAt: string;
  bannerData?: string | null;
}
export interface PublicAnnouncement {
  id: string;
  title: string;
  description: string;
  publishAt: string;
  expiresAt: string;
  hasBanner: boolean;
}
export function announcementStatus(post: { state: string; publishAt: string; expiresAt: string }, now = Date.now()) {
  if (post.state !== 'published') return 'Draft';
  if (Date.parse(post.expiresAt) <= now) return 'Expired';
  if (Date.parse(post.publishAt) > now) return 'Scheduled';
  return 'Live';
}
export function validateAnnouncement(value: unknown, now = Date.now()): AnnouncementInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid announcement.');
  const input = value as Record<string, unknown>;
  if (typeof input.title !== 'string' || typeof input.description !== 'string') throw new Error('Title and description are required.');
  const title = input.title.normalize('NFKC').replace(/[\p{Cf}\p{Cc}]/gu, ' ').replace(/\s+/gu, ' ').trim();
  const description = input.description.normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[^\S\n]+/gu, ' ').replace(/[\p{Cf}]/gu, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!/[\p{L}\p{N}]/u.test(title)) throw new Error('A title is required.');
  if (title.length > 150 || input.title.length > 150) throw new Error('Title must be 150 characters or fewer.');
  if (!description) throw new Error('Announcement content is required.');
  if (description.length > 3000 || input.description.length > 3000) throw new Error('Content must be 3,000 characters or fewer.');
  if (input.state !== 'draft' && input.state !== 'published') throw new Error('Invalid publication state.');
  const parseDate = (value: unknown, fallback: number) => {
    if (value === '' || value == null) return fallback;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Use a valid publication and expiry date.');
    return Date.parse(value);
  };
  const start = parseDate(input.publishAt, now);
  const end = parseDate(input.expiresAt, NaN);
  if (input.state === 'published' && !Number.isFinite(end)) throw new Error('An expiry date is required before publishing.');
  if (Number.isFinite(end) && (end <= start || (input.state === 'published' && end <= now))) throw new Error('Expiry must be later than publication and in the future.');
  const banner = input.bannerData;
  if (banner !== undefined && banner !== null && (typeof banner !== 'string' || banner.length > 2800000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(banner))) throw new Error('Choose a JPEG, PNG or WebP banner smaller than 2 MB.');
  return { title, description, state: input.state, publishAt: input.state === 'draft' && !input.publishAt ? '' : new Date(start).toISOString(), expiresAt: Number.isFinite(end) ? new Date(end).toISOString() : '', ...(banner !== undefined ? { bannerData: banner as string | null } : {}) };
}
export function toManilaInput(iso: string) {
  if (!iso) return '';
  return new Date(Date.parse(iso) + 8 * 3600000).toISOString().slice(0, 16);
}
export function fromManilaInput(local: string) {
  return local ? new Date(`${local}:00+08:00`).toISOString() : '';
}
