import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module, createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as validation from '../lib/announcements/validation.ts';
import { announcementStatus, validateAnnouncement, fromManilaInput, toManilaInput } from '../lib/announcements/validation.ts';

const now = Date.parse('2026-10-04T00:00:00.000Z');
const input = { title: 'A new look', description: 'More to discover.\n\nTry the new search.', state: 'published', publishAt: '2026-10-04T00:00:00.000Z', expiresAt: '2026-10-05T00:00:00.000Z' };
test('publication is live at its start and stops exactly at expiry', () => {
  assert.equal(announcementStatus(input, now - 1), 'POSTdated');
  assert.equal(announcementStatus(input, now), 'Live');
  assert.equal(announcementStatus(input, Date.parse(input.expiresAt) - 1), 'Live');
  assert.equal(announcementStatus(input, Date.parse(input.expiresAt)), 'Expired');
  assert.equal(announcementStatus({ ...input, state: 'draft' }, now), 'Draft');
});
test('requires expiry when publishing and validates the publication window', () => {
  assert.throws(() => validateAnnouncement({ ...input, expiresAt: '' }, now), /expiry date/);
  assert.throws(() => validateAnnouncement({ ...input, expiresAt: input.publishAt }, now), /Expiry/);
  assert.throws(() => validateAnnouncement(input, Date.parse(input.expiresAt)), /backdated/);
  assert.throws(() => validateAnnouncement({ ...input, publishAt: 'invalid' }, now), /valid/);
  assert.equal(validateAnnouncement({ ...input, publishAt: '' }, now).publishAt, input.publishAt);
  assert.equal(validateAnnouncement({ ...input, state: 'draft', expiresAt: '' }, now).expiresAt, '');
});
test('rejects blank content, oversized fields and injected publication state', () => {
  for (const title of ['', '    ', '\u200b\t', '!!!']) assert.throws(() => validateAnnouncement({ ...input, title }, now), /title/);
  assert.throws(() => validateAnnouncement({ ...input, title: 'x'.repeat(151) }, now));
  assert.throws(() => validateAnnouncement({ ...input, title: 'ﬃ'.repeat(100) }, now));
  assert.throws(() => validateAnnouncement({ ...input, description: ' '.repeat(3001) }, now));
  assert.throws(() => validateAnnouncement({ ...input, description: '\u200b\n\t' }, now));
  assert.throws(() => validateAnnouncement({ ...input, state: 'live' }, now));
  assert.throws(() => validateAnnouncement(null, now));
  assert.equal(validateAnnouncement({ ...input, title: ' A     new look ' }, now).title, input.title);
  assert.equal(validateAnnouncement(input, now).description, input.description);
});
test('banner uploads are restricted to bounded raster image data; metadata cannot be overridden', () => {
  assert.throws(() => validateAnnouncement({ ...input, bannerData: 'data:image/svg+xml;base64,abcd' }, now));
  assert.throws(() => validateAnnouncement({ ...input, bannerData: 'https://example.com/banner.png' }, now));
  assert.throws(() => validateAnnouncement({ ...input, bannerData: 'data:image/png;base64,' + 'a'.repeat(2800000) }, now));
  assert.equal(validateAnnouncement({ ...input, bannerData: null }, now).bannerData, null);
  assert.equal(validateAnnouncement({ ...input, authorId: 'attacker', type: 'user' }, now).authorId, undefined);
});
test('Manila datetime controls convert to and from UTC without browser timezone dependence', () => {
  assert.equal(fromManilaInput('2026-10-04T08:00'), input.publishAt);
  assert.equal(toManilaInput(input.publishAt), '2026-10-04T08:00');
  assert.equal(fromManilaInput(''), '');
  assert.equal(toManilaInput(''), '');
});

test('server image processing rejects disguised SVG/corrupt uploads and bounds raster output', async () => {
  const sharp = (await import('sharp')).default;
  const { processAnnouncementBanner } = await import('../lib/announcements/banner.ts');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>');
  await assert.rejects(() => processAnnouncementBanner(`data:image/png;base64,${svg.toString('base64')}`), /Could not process/);
  await assert.rejects(() => processAnnouncementBanner('data:image/png;base64,bm90LWFuLWltYWdl'), /Could not process/);
  const disguisedTiff = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#111111' } }).tiff().toBuffer();
  await assert.rejects(() => processAnnouncementBanner(`data:image/png;base64,${disguisedTiff.toString('base64')}`), /Could not process/);
  const raster = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#111111' } }).png().toBuffer();
  const data = await processAnnouncementBanner(`data:image/png;base64,${raster.toString('base64')}`);
  assert.ok(data.startsWith('data:image/webp;base64,'));
  const output = Buffer.from(data.split(',')[1], 'base64');
  const meta = await sharp(output).metadata();
  assert.ok(meta.width <= 1600 && meta.height <= 900);
  assert.ok(output.length <= 1024 * 1024);
});

test('an unscheduled draft preserves an empty start so publish now uses publication time', () => {
  const draft = validateAnnouncement({ ...input, state: 'draft', publishAt: '', expiresAt: '' }, now);
  assert.equal(draft.publishAt, '');
  const later = now + 3600000;
  const published = validateAnnouncement({ ...draft, state: 'published', expiresAt: input.expiresAt }, later);
  assert.equal(published.publishAt, new Date(later).toISOString());
});

test('publication cannot be backdated and expiry cannot be today in Manila', () => {
  assert.throws(() => validateAnnouncement({ ...input, publishAt: new Date(now - 1).toISOString() }, now), /backdated/);
  assert.throws(() => validateAnnouncement({ ...input, state: 'draft', publishAt: new Date(now - 1).toISOString() }, now), /backdated/);
  assert.throws(() => validateAnnouncement({ ...input, expiresAt: '2026-10-04T15:59:59.999Z' }, now), /tomorrow/);
  assert.equal(validateAnnouncement({ ...input, expiresAt: '2026-10-04T16:00:00.000Z' }, now).expiresAt, '2026-10-04T16:00:00.000Z');
  assert.throws(() => validateAnnouncement({ ...input, publishAt: '2026-02-30T00:00:00.000Z' }, now), /valid/);
});
test('editing preserves the original posted date but cannot replace it with another past date', () => {
  const past = new Date(now - 3600000).toISOString();
  const context = { existingState: 'published', existingPublishAt: past, existingExpiresAt: input.expiresAt };
  assert.equal(validateAnnouncement({ ...input, publishAt: past }, now, context).publishAt, past);
  assert.throws(() => validateAnnouncement({ ...input, publishAt: new Date(now - 7200000).toISOString() }, now, context), /backdated/);
  assert.throws(() => validateAnnouncement({ ...input, publishAt: past }, now, { ...context, existingState: 'draft' }), /backdated/);
  const expired = { ...input, state: 'draft', publishAt: past, expiresAt: new Date(now - 1000).toISOString() };
  assert.equal(validateAnnouncement(expired, now, { ...context, existingExpiresAt: expired.expiresAt }).state, 'draft');
});

test('disabled posts keep their tag regardless of publication/expiry and can retain their historical window', () => {
  const post = { ...input, state: 'disabled', publishAt: new Date(now - 7200000).toISOString(), expiresAt: new Date(now - 1000).toISOString() };
  for (const time of [now - 86400000, now, now + 86400000]) assert.equal(announcementStatus(post, time), 'Disabled');
  const context = { existingState: 'published', existingPublishAt: post.publishAt, existingExpiresAt: post.expiresAt };
  assert.equal(validateAnnouncement(post, now, context).state, 'disabled');
  const disabledContext = { ...context, existingState: 'disabled' };
  assert.equal(validateAnnouncement(post, now, disabledContext).publishAt, post.publishAt);
  assert.throws(() => validateAnnouncement({ ...post, state: 'published' }, now, disabledContext), /tomorrow/);
  const enabled = validateAnnouncement({ ...post, state: 'published', expiresAt: input.expiresAt }, now, disabledContext);
  assert.equal(announcementStatus(enabled, now), 'Live');
  assert.throws(() => validateAnnouncement({ ...post, publishAt: new Date(now - 86400000).toISOString() }, now, disabledContext), /backdated/);
});

// Load the Next.js response helper as CommonJS without changing production module resolution.
function controlHandler() {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const filename = fileURLToPath(new URL('../lib/announcements/write.ts', import.meta.url));
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const compiledModule = new Module(filename);
  compiledModule.filename = filename;
  compiledModule.require = (name) => name === './validation' ? validation : require(name);
  compiledModule._compile(source, filename);
  return compiledModule.exports.announcementControl;
}
test('disable and delete reject cross-origin writes; disable bounds and validates its payload before any mutation', async () => {
  const control = controlHandler();
  const origin = 'https://papiflix.vercel.app'; const url = `${origin}/api/admin/announcements/test`;
  let mutations = 0; const perform = async () => { mutations++; return 'test'; };
  const request = (body, sender = origin, method = 'PATCH') => new Request(url, { method, headers: { Origin: sender }, ...(body === undefined ? {} : { body }) });
  assert.equal((await control(request('{"state":"disabled"}', 'https://other.example'), 'disable', perform)).status, 403);
  assert.equal((await control(request(undefined, 'https://other.example', 'DELETE'), 'delete', perform)).status, 403);
  for (const body of ['{"state":"published"}', 'null', '{bad json']) assert.equal((await control(request(body), 'disable', perform)).status, 400);
  assert.equal((await control(request(JSON.stringify({ state: 'disabled', padding: 'x'.repeat(2000) })), 'disable', perform)).status, 413);
  assert.equal(mutations, 0);
  assert.equal((await control(request('{"state":"disabled"}'), 'disable', perform)).status, 200);
  assert.equal((await control(request(undefined, origin, 'DELETE'), 'delete', perform)).status, 200);
  assert.equal(mutations, 2);
});
test('announcement controls report missing documents as 404 instead of exposing database errors', async () => {
  const control = controlHandler();
  const request = new Request('https://papiflix.vercel.app/api/admin/announcements/test', { method: 'DELETE', headers: { Origin: 'https://papiflix.vercel.app' } });
  const response = await control(request, 'delete', async () => { const error = new Error('Private database details'); error.name = 'DocumentNotFoundError'; throw error; });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Announcement not found.' });
});
