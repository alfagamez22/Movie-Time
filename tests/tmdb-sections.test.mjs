import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, '..', 'lib/tmdb/client.ts'), 'utf8');

const CATEGORY_VALUES = new Set(['trending', 'discover', 'regional', 'genre', 'rating', 'mature']);
const TIER_VALUES = new Set(['default', 'mature']);

const expectedMatureIds = new Set(['vivamax-movies']);
const expectedDefaultIds = new Set([
  'trending',
  'movies',
  'tv-shows',
  'filipino-movies',
  'r18-movies',
  'adult-r18-movies',
  'japanese-movies',
  'popular-movies',
  'top-rated-series',
  'top-rated-movies',
  'popular-tv',
  'now-playing',
  'on-the-air',
  'action-movies',
  'scifi-movies',
  'horror-movies',
  'comedy-movies',
  'crime-movies',
  'korean-tv',
  'anime',
  'spanish-movies',
]);

function extractSectionEntries() {
  // Naive parser: pulls object literals from TMDB_BROWSE_SECTIONS that look like `{ id: '...', ... }`.
  const arrayMatch = source.match(/TMDB_BROWSE_SECTIONS:\s*TmdbBrowseSectionDefinition\[\]\s*=\s*\[([\s\S]*?)\n\];/);
  assert.ok(arrayMatch, 'TMDB_BROWSE_SECTIONS block should be present');
  const body = arrayMatch[1];
  const entries = [];
  const entryRegex = /\{\s*([\s\S]*?)\n\s*\}/g;
  let match;
  while ((match = entryRegex.exec(body)) !== null) {
    const block = match[1];
    const idMatch = block.match(/id:\s*'([^']+)'/);
    if (!idMatch) continue;
    const categoryMatch = block.match(/category:\s*'([^']+)'/);
    const tierMatch = block.match(/tier:\s*'([^']+)'/);
    entries.push({
      category: categoryMatch ? categoryMatch[1] : null,
      id: idMatch[1],
      tier: tierMatch ? tierMatch[1] : null,
    });
  }
  return entries;
}

const sections = extractSectionEntries();

test('every TMDB section has a known category', () => {
  for (const section of sections) {
    assert.ok(
      section.category !== null,
      `section ${section.id} should declare a category`,
    );
    assert.ok(
      CATEGORY_VALUES.has(section.category),
      `section ${section.id} has unknown category ${section.category}`,
    );
  }
});

test('Vivamax sections are tagged with tier "mature"', () => {
  for (const section of sections) {
    if (!expectedMatureIds.has(section.id)) continue;
    assert.equal(
      section.tier,
      'mature',
      `section ${section.id} should have tier 'mature'`,
    );
  }
});

test('default and R18 sections do not carry a mature tier', () => {
  for (const section of sections) {
    if (!expectedDefaultIds.has(section.id)) continue;
    assert.notEqual(
      section.tier,
      'mature',
      `section ${section.id} should not be marked mature`,
    );
  }
});

test('R18 sections stay in the rating category', () => {
  for (const id of ['r18-movies', 'adult-r18-movies']) {
    const section = sections.find((entry) => entry.id === id);
    assert.ok(section, `section ${id} should be present`);
    assert.equal(section.category, 'rating', `section ${id} should remain visible under ratings`);
  }
});

test('tier values are valid when present', () => {
  for (const section of sections) {
    if (section.tier === null) continue;
    assert.ok(
      TIER_VALUES.has(section.tier),
      `section ${section.id} has invalid tier ${section.tier}`,
    );
  }
});

test('all expected section ids are present', () => {
  const found = new Set(sections.map((section) => section.id));
  for (const id of expectedMatureIds) {
    assert.ok(found.has(id), `expected Vivamax-locked section ${id} to be present`);
  }
  for (const id of expectedDefaultIds) {
    assert.ok(found.has(id), `expected default section ${id} to be present`);
  }
});
