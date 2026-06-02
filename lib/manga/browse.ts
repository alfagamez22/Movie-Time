import 'server-only';

import type { LibraryMediaEntry, LibrarySection } from '@/lib/media/types';
import { getMangaDexByTag, getMangaDexLatest, getMangaDexPopular, getMangaDexRecentlyAdded } from './client';
import { mangaDexToLibraryEntry } from './mapping';

const GENRE_TAGS: Record<string, string> = {
  action: '391b0423-d847-4f6f-8a14-714175e3bbcb',
  adventure: '87cc87cd-a395-47af-b27a-93258283e2d2',
  comedy: '4d32cc48-9f00-4cca-9b5a-a839f0764984',
  drama: 'b9af3a63-f058-46de-a9a0-e0c13906197a',
  fantasy: 'cdc58593-87dd-415e-bbc0-2ec27a3442b1',
  romance: '423e2eae-7ee8-4ead-964f-6406eab38e5b',
  horror: '0a39b5a1-b235-4886-a747-1d05d216532d',
  sciFi: '256c8bd0-7b8f-43c3-9b0a-0e407b20df0a',
  sliceOfLife: 'e5301a23-ebd9-49dd-a8cb-5f0f1ec1c0ee',
  thriller: 'b3970e17-3d36-4b11-a604-571a2e1aed36',
};

export interface MangaBrowseResult {
  error: string | null;
  sections: LibrarySection[];
}

export async function browseManga(): Promise<MangaBrowseResult> {
  try {
    const [popular, latest, recent] = await Promise.all([
      getMangaDexPopular(24),
      getMangaDexLatest(24),
      getMangaDexRecentlyAdded(18),
    ]);

    const sections: LibrarySection[] = [];

    if (popular.data.length) {
      sections.push({
        description: 'Top-rated manga on MangaDex right now.',
        entries: popular.data.map(mangaDexToLibraryEntry),
        id: 'popular',
        title: 'Popular',
      });
    }

    if (latest.data.length) {
      sections.push({
        description: 'Recently updated manga on MangaDex.',
        entries: latest.data.map(mangaDexToLibraryEntry),
        id: 'latest',
        title: 'Latest Updates',
      });
    }

    if (recent.data.length) {
      sections.push({
        description: 'Manga newly added to MangaDex.',
        entries: recent.data.map(mangaDexToLibraryEntry),
        id: 'recently-added',
        title: 'Recently Added',
      });
    }

    const genreResults = await Promise.all(
      Object.entries(GENRE_TAGS).map(async ([key, tagId]) => {
        try {
          const result = await getMangaDexByTag(tagId, 18);
          return { key, entries: result.data.map(mangaDexToLibraryEntry) };
        } catch {
          return { key, entries: [] as LibraryMediaEntry[] };
        }
      }),
    );

    for (const { key, entries } of genreResults) {
      if (entries.length) {
        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
        sections.push({
          description: `Popular ${label.toLowerCase()} manga.`,
          entries,
          id: `genre-${key}`,
          title: label,
        });
      }
    }

    return { error: null, sections };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to browse manga.',
      sections: [],
    };
  }
}
