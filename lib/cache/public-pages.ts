/** Only anonymous browse pages are safe to reopen from a shared device cache. */
export function isPublicBrowsePath(pathname: string): boolean {
  return ['/', '/anime', '/manga', '/categories'].includes(pathname) ||
    /^\/categories\/(?:trending|discover|regional|genre|rating)$/.test(pathname) ||
    /^\/categories\/genres\/[a-z0-9-]+$/.test(pathname);
}
