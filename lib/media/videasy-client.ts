import CryptoJS from 'crypto-js';
import Hashids from 'hashids';

import type { MediaEntry, MediaType } from './types';

declare global {
  interface Window {
    hash?: string;
  }
}

const PUBLIC_DB_BASE_URL = 'https://db.videasy.net/3';
const SOURCE_API_BASE_URL = 'https://api.videasy.net';
const WASM_MODULE_PATH = '/vendor/videasy/module1.wasm';
const HASH_XOR_MASK = '8c465aa8af6cbfd4c1f91bf0c8d678ba';
const HASH_KEY_SUFFIX = 'd486ae1ce6fdbe63b60bd1704541fcf0';
const HLS_CONTENT_TYPE = 'application/vnd.apple.mpegurl';

export type VideoServerName = 'Oxygen' | 'Hydrogen' | 'Lithium' | 'Helium';

export interface VideoServerDefinition {
  endpoint: string;
  name: VideoServerName;
}

export interface SourceOption {
  height: number;
  isHls: boolean;
  mimeType?: string;
  quality: string;
  url: string;
}

export interface SubtitleOption {
  id: string;
  isHearingImpaired: boolean;
  label: string;
  language: string;
  url: string;
}

export interface ServerSourceBundle {
  qualities: SourceOption[];
  serverName: VideoServerName;
  subtitles: SubtitleOption[];
}

interface RemoteMetadataResponse {
  external_ids?: {
    imdb_id?: string;
  };
  first_air_date?: string;
  name?: string;
  release_date?: string;
  title?: string;
}

interface VideoSourcePayload {
  file?: string;
  mimeType?: string;
  quality?: string;
  url?: string;
}

interface SubtitlePayload {
  code?: string;
  display?: string;
  file?: string;
  isHearingImpaired?: boolean;
  label?: string;
  lang?: string;
  language?: string;
  name?: string;
  srclang?: string;
  url?: string;
}

interface DecryptedSourcePayload {
  mediaType?: MediaType;
  sources?: VideoSourcePayload[];
  subtitles?: SubtitlePayload[];
  tmdbId?: number | string;
}

interface WasmExports {
  __new(length: number, typeId: number): number;
  decrypt(pointer: number, tmdbId: number): number;
  memory?: WebAssembly.Memory;
  serve(): number;
  verify(pointer: number): number;
}

interface WasmBridge {
  decrypt(value: string, tmdbId: number): string;
  serve(): string | null;
  verify(value: string): boolean;
}

export const VIDEO_SERVERS: readonly VideoServerDefinition[] = [
  {
    endpoint: 'mb-flix/sources-with-title',
    name: 'Oxygen',
  },
  {
    endpoint: 'cdn/sources-with-title',
    name: 'Hydrogen',
  },
  {
    endpoint: 'downloader2/sources-with-title',
    name: 'Lithium',
  },
  {
    endpoint: '1movies/sources-with-title',
    name: 'Helium',
  },
] as const;

let wasmBridgePromise: Promise<WasmBridge> | null = null;

function buildPlaybackProxyUrl(url: string): string {
  return `/api/playback/proxy?url=${encodeURIComponent(url)}`;
}

function stripNullTerminator(value: string): string {
  const nullIndex = value.indexOf('\0');
  return nullIndex === -1 ? value : value.slice(0, nullIndex);
}

function readWasmString(memory: WebAssembly.Memory, pointer: number): string | null {
  if (!pointer) {
    return null;
  }

  const lengthPointer = (pointer - 4) >>> 2;
  const charLength = (pointer + new Uint32Array(memory.buffer)[lengthPointer]) >>> 1;
  const characters = new Uint16Array(memory.buffer);

  let cursor = pointer >>> 1;
  let value = '';

  while (charLength - cursor > 1024) {
    value += String.fromCharCode(...characters.subarray(cursor, (cursor += 1024)));
  }

  return value + String.fromCharCode(...characters.subarray(cursor, charLength));
}

function writeWasmString(exports: WasmExports, memory: WebAssembly.Memory, value: string | null): number {
  if (value === null) {
    return 0;
  }

  const pointer = exports.__new(value.length << 1, 2) >>> 0;
  const characters = new Uint16Array(memory.buffer);

  for (let index = 0; index < value.length; index += 1) {
    characters[(pointer >>> 1) + index] = value.charCodeAt(index);
  }

  return pointer;
}

async function instantiateWasmBridge(module: WebAssembly.Module): Promise<WasmBridge> {
  let memory: WebAssembly.Memory | undefined;
  const readAbortString = (pointer: number) => (memory ? readWasmString(memory, pointer >>> 0) : null);
  const imports = {
    env: Object.assign(Object.create(globalThis), {
      abort(messagePointer: number, filePointer: number, line: number, column: number) {
        throw new Error(
          `${readAbortString(messagePointer)} in ${readAbortString(filePointer)}:${line}:${column}`,
        );
      },
      seed() {
        return Date.now() * Math.random();
      },
    }),
  };

  const { exports } = await WebAssembly.instantiate(module, imports);
  const wasmExports = exports as unknown as WasmExports;
  memory = wasmExports.memory ?? (imports.env.memory as WebAssembly.Memory | undefined);

  if (!memory) {
    throw new Error('Playback module did not expose a usable memory buffer.');
  }

  return {
    decrypt(value: string, tmdbId: number) {
      const pointer = writeWasmString(wasmExports, memory, value);
      if (!pointer) {
        throw new TypeError('Encrypted playback payload must not be empty.');
      }

      return readWasmString(memory, wasmExports.decrypt(pointer, tmdbId) >>> 0) ?? '';
    },
    serve() {
      return readWasmString(memory, wasmExports.serve() >>> 0);
    },
    verify(value: string) {
      const pointer = writeWasmString(wasmExports, memory, value);
      if (!pointer) {
        throw new TypeError('Playback hash must not be empty.');
      }

      return wasmExports.verify(pointer) !== 0;
    },
  };
}

async function getWasmBridge(): Promise<WasmBridge> {
  if (!wasmBridgePromise) {
    wasmBridgePromise = (async () => {
      const response = await fetch(WASM_MODULE_PATH, {
        cache: 'force-cache',
      });

      if (!response.ok) {
        throw new Error(`Unable to load playback module (${response.status}).`);
      }

      const wasmModule = await WebAssembly.compile(await response.arrayBuffer());
      return instantiateWasmBridge(wasmModule);
    })();
  }

  return wasmBridgePromise;
}

async function waitForBootstrapHash(timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const poll = () => {
      if (window.hash) {
        resolve(window.hash);
        return;
      }

      if (Date.now() >= deadline) {
        reject(new Error('Playback bootstrap timed out while preparing the decryption key.'));
        return;
      }

      window.setTimeout(poll, 10);
    };

    poll();
  });
}

function buildHexDigest(value: string): string {
  const maskCodePoints = HASH_XOR_MASK.split('').map((character) => character.charCodeAt(0));

  return value
    .split('')
    .map((character) => character.charCodeAt(0))
    .map((codePoint, index) => codePoint ^ maskCodePoints[index % maskCodePoints.length])
    .map((codePoint) => codePoint.toString(16).padStart(2, '0'))
    .join('');
}

async function buildAesKeyCandidates(value: string): Promise<string[]> {
  const hashids = new Hashids();
  const hexDigest = buildHexDigest(String(value));
  return Array.from(
    new Set([
      hashids.encode(hexDigest),
      hashids.encodeHex(hexDigest),
      hexDigest,
      String(value),
      '',
    ]),
  );
}

async function fetchRemoteMetadata(entry: MediaEntry): Promise<{ imdbId: string; title: string; year: number | string }> {
  const response = await fetch(
    `${PUBLIC_DB_BASE_URL}/${entry.type}/${encodeURIComponent(entry.tmdbId)}?append_to_response=external_ids`,
    {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to load title metadata (${response.status}).`);
  }

  const payload = (await response.json()) as RemoteMetadataResponse;
  const title = entry.type === 'movie' ? payload.title : payload.name;
  const dateValue = entry.type === 'movie' ? payload.release_date : payload.first_air_date;
  const year =
    typeof dateValue === 'string' && dateValue.length >= 4
      ? Number.parseInt(dateValue.slice(0, 4), 10) || ''
      : entry.year ?? '';

  return {
    imdbId: payload.external_ids?.imdb_id ?? '',
    title: title?.trim() || entry.title,
    year,
  };
}

async function fetchEncryptedSources(
  serverName: VideoServerName,
  payload: {
    episodeId?: string;
    imdbId: string;
    mediaType: MediaType;
    seasonId?: string;
    title: string;
    tmdbId: string;
    year: number | string;
  },
): Promise<string> {
  const server = VIDEO_SERVERS.find((candidate) => candidate.name === serverName);
  if (!server) {
    throw new Error(`Unknown playback source "${serverName}".`);
  }

  const requestUrl = new URL(`${SOURCE_API_BASE_URL}/${server.endpoint}`);
  requestUrl.searchParams.set('title', payload.title);
  requestUrl.searchParams.set('mediaType', payload.mediaType);
  requestUrl.searchParams.set('year', String(payload.year));
  requestUrl.searchParams.set('episodeId', payload.episodeId ?? '1');
  requestUrl.searchParams.set('seasonId', payload.seasonId ?? '1');
  requestUrl.searchParams.set('tmdbId', payload.tmdbId);
  requestUrl.searchParams.set('imdbId', payload.imdbId);
  requestUrl.searchParams.set('_t', String(Date.now()));

  const response = await fetch(buildPlaybackProxyUrl(requestUrl.toString()), {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`${serverName} is unavailable right now (${response.status}).`);
  }

  return response.text();
}

function parseSourceHeight(quality: string | undefined): number {
  if (!quality) {
    return 0;
  }

  if (/4k/i.test(quality)) {
    return 2160;
  }

  const match = quality.match(/(\d{3,4})/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function isHlsSource(url: string, mimeType?: string): boolean {
  return url.toLowerCase().includes('.m3u8') || mimeType?.toLowerCase().includes('mpegurl') === true;
}

function normalizeSourceOptions(rawSources: VideoSourcePayload[] | undefined): SourceOption[] {
  const uniqueSources = new Map<string, SourceOption>();

  for (const source of rawSources ?? []) {
    const url = source.url ?? source.file;
    if (!url) {
      continue;
    }

    const height = parseSourceHeight(source.quality);
    const normalizedQuality =
      source.quality?.replace(/\[hdr\]/gi, '').trim() ||
      (height > 0 ? `${height}p` : 'Auto');
    const option: SourceOption = {
      height,
      isHls: isHlsSource(url, source.mimeType),
      mimeType: source.mimeType,
      quality: normalizedQuality,
      url: buildPlaybackProxyUrl(url),
    };

    uniqueSources.set(`${normalizedQuality}:${url}`, option);
  }

  return Array.from(uniqueSources.values()).sort((left, right) => {
    if (left.isHls !== right.isHls) {
      return left.isHls ? 1 : -1;
    }

    if (left.height === right.height) {
      return left.quality.localeCompare(right.quality);
    }

    return right.height - left.height;
  });
}

function normalizeSubtitleOptions(rawSubtitles: SubtitlePayload[] | undefined): SubtitleOption[] {
  const uniqueSubtitles = new Map<string, SubtitleOption>();

  for (const [index, subtitle] of (rawSubtitles ?? []).entries()) {
    const url = subtitle.url ?? subtitle.file;
    if (!url) {
      continue;
    }

    const language = subtitle.language ?? subtitle.lang ?? subtitle.code ?? subtitle.srclang ?? 'Unknown';
    const baseLabel = subtitle.display ?? subtitle.label ?? subtitle.name ?? language;
    const isHearingImpaired =
      subtitle.isHearingImpaired === true || /cc|sdh|hearing/i.test(baseLabel);
    const label = isHearingImpaired && !/cc|sdh|hearing/i.test(baseLabel) ? `${baseLabel} CC` : baseLabel;
    const option: SubtitleOption = {
      id: `${language.toLowerCase()}-${index}`,
      isHearingImpaired,
      label,
      language,
      url: buildPlaybackProxyUrl(url),
    };

    uniqueSubtitles.set(url, option);
  }

  return Array.from(uniqueSubtitles.values());
}

async function decryptSourcePayload(encryptedPayload: string, tmdbId: string): Promise<DecryptedSourcePayload> {
  const wasmBridge = await getWasmBridge();
  const bootstrapScript = stripNullTerminator(wasmBridge.serve() ?? '');

  if (!bootstrapScript) {
    throw new Error('Playback bootstrap returned an empty script.');
  }

  delete window.hash;
  new Function(bootstrapScript)();

  const hash = await waitForBootstrapHash();
  if (!wasmBridge.verify(hash)) {
    throw new Error('Playback bootstrap verification failed.');
  }

  const decryptedPayload = wasmBridge.decrypt(encryptedPayload, Number.parseInt(tmdbId, 10));
  const aesKeyCandidates = await buildAesKeyCandidates(`${tmdbId}${HASH_KEY_SUFFIX}`);

  for (const aesKey of aesKeyCandidates) {
    try {
      const plaintext = CryptoJS.AES.decrypt(decryptedPayload, aesKey).toString(CryptoJS.enc.Utf8);
      if (!plaintext) {
        continue;
      }

      return JSON.parse(plaintext) as DecryptedSourcePayload;
    } catch {
      // Try the next candidate key.
    }
  }

  throw new Error('Playback source decryption returned an empty response.');
}

export async function fetchServerSourceBundle(
  entry: MediaEntry,
  serverName: VideoServerName,
  season?: string,
  episode?: string,
): Promise<ServerSourceBundle> {
  const metadata = await fetchRemoteMetadata(entry);
  const encryptedPayload = await fetchEncryptedSources(serverName, {
    episodeId: episode,
    imdbId: metadata.imdbId,
    mediaType: entry.type,
    seasonId: season,
    title: metadata.title,
    tmdbId: entry.tmdbId,
    year: metadata.year,
  });

  const decryptedPayload = await decryptSourcePayload(encryptedPayload, entry.tmdbId);
  const qualities = normalizeSourceOptions(decryptedPayload.sources);

  if (qualities.length === 0) {
    throw new Error(`${serverName} did not return any playable files for this title.`);
  }

  return {
    qualities,
    serverName,
    subtitles: normalizeSubtitleOptions(decryptedPayload.subtitles),
  };
}

function convertSrtToVtt(source: string): string {
  return `WEBVTT\n\n${source
    .replace(/\r+/g, '')
    .replace(/^(\d+)\n/gm, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`;
}

function ensureVtt(source: string, sourceUrl: string): string {
  const trimmedSource = source.trim();

  if (trimmedSource.startsWith('WEBVTT')) {
    return trimmedSource;
  }

  if (/\.srt($|\?)/i.test(sourceUrl) || trimmedSource.includes('-->')) {
    return convertSrtToVtt(trimmedSource);
  }

  return `WEBVTT\n\n${trimmedSource}`;
}

export async function loadSubtitleTrackUrl(subtitle: SubtitleOption): Promise<string> {
  const response = await fetch(subtitle.url, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Unable to load subtitle track (${response.status}).`);
  }

  const subtitleText = await response.text();
  const blob = new Blob([ensureVtt(subtitleText, subtitle.url)], {
    type: 'text/vtt',
  });

  return URL.createObjectURL(blob);
}

export function canPlayHlsNatively(videoElement: HTMLVideoElement): boolean {
  return Boolean(videoElement.canPlayType(HLS_CONTENT_TYPE));
}
