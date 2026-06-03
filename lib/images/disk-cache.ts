import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type DiskCacheFormat = 'avif' | 'webp' | 'jpeg';

export interface DiskCacheConfig {
  cacheRoot: string;
  maxBytes: number;
}

export const DEFAULT_DISK_CACHE_CONFIG: DiskCacheConfig = {
  cacheRoot: resolve(process.cwd(), 'public', '.img-cache'),
  maxBytes: 500 * 1024 * 1024,
};

const FORMAT_TO_EXT: Record<DiskCacheFormat, string> = {
  avif: 'avif',
  jpeg: 'jpg',
  webp: 'webp',
};

export interface CacheKeyInput {
  format: DiskCacheFormat;
  imagePath: string;
  size: string;
}

function buildHash({ format, imagePath, size }: CacheKeyInput): string {
  return createHash('sha256').update(`${size}|${format}|${imagePath}`).digest('hex');
}

export function buildCacheKey(input: CacheKeyInput): string {
  return buildHash(input);
}

export function buildCachePath(config: DiskCacheConfig, input: CacheKeyInput): string {
  const hash = buildHash(input);
  return join(config.cacheRoot, input.size, `${hash}.${FORMAT_TO_EXT[input.format]}`);
}

async function ensureSizeDir(config: DiskCacheConfig, size: string): Promise<string> {
  const sizeDir = join(config.cacheRoot, size);
  await mkdir(sizeDir, { recursive: true });
  return sizeDir;
}

export interface CacheEntryStat {
  format: DiskCacheFormat;
  imagePath: string;
  mtimeMs: number;
  size: number;
}

export async function writeCacheEntry(
  config: DiskCacheConfig,
  input: CacheKeyInput,
  bytes: Buffer,
): Promise<string> {
  await ensureSizeDir(config, input.size);
  const target = buildCachePath(config, input);
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, bytes);
  const { rename } = await import('node:fs/promises');
  await rename(tmp, target);
  await maybeEvict(config);
  return target;
}

export function findCacheEntry(
  config: DiskCacheConfig,
  input: CacheKeyInput,
): string | null {
  const target = buildCachePath(config, input);
  return existsSync(target) ? target : null;
}

interface ScannedFile {
  mtimeMs: number;
  path: string;
  size: number;
}

async function listAllFiles(config: DiskCacheConfig): Promise<ScannedFile[]> {
  if (!existsSync(config.cacheRoot)) {
    return [];
  }

  const stack = [config.cacheRoot];
  const found: ScannedFile[] = [];

  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (entry.name.endsWith('.tmp')) {
        continue;
      }
      try {
        const s = await stat(full);
        found.push({ mtimeMs: s.mtimeMs, path: full, size: s.size });
      } catch {
        // Ignore files we cannot stat.
      }
    }
  }

  return found;
}

export async function totalCacheBytes(config: DiskCacheConfig): Promise<number> {
  const files = await listAllFiles(config);
  let total = 0;
  for (const file of files) {
    total += file.size;
  }
  return total;
}

export async function maybeEvict(config: DiskCacheConfig): Promise<void> {
  const files = await listAllFiles(config);
  let total = 0;
  for (const file of files) {
    total += file.size;
  }

  if (total <= config.maxBytes) {
    return;
  }

  files.sort((a, b) => a.mtimeMs - b.mtimeMs);

  for (const file of files) {
    if (total <= config.maxBytes) {
      break;
    }
    try {
      await rm(file.path, { force: true });
      total -= file.size;
    } catch {
      // Skip files we cannot remove.
    }
  }
}

export async function groomCache(config: DiskCacheConfig): Promise<void> {
  await maybeEvict(config);
}
