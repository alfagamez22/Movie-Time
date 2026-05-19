const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const TRIM_DASHES = /^-+|-+$/g;

export function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(NON_ALPHANUMERIC, '-')
    .replace(TRIM_DASHES, '');
}

export function normalizeSlugList(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeSlug(value))
        .filter(Boolean),
    ),
  );
}