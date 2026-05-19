import { HomePage } from '@/components/media/home-page';
import type { LibraryMediaEntry } from '@/lib/media/types';
import { getTmdbLibrarySections } from '@/lib/tmdb/client';

function dedupeEntries(entries: LibraryMediaEntry[]): LibraryMediaEntry[] {
  const uniqueEntries = new Map<string, LibraryMediaEntry>();

  entries.forEach((entry) => {
    uniqueEntries.set(`${entry.type}:${entry.tmdbId}`, entry);
  });

  return Array.from(uniqueEntries.values());
}

export default async function Page() {
  const liveLibrary = await getTmdbLibrarySections();
  const discoverEntries = liveLibrary.ok
    ? dedupeEntries(liveLibrary.sections.flatMap((section) => section.entries)).slice(0, 18)
    : [];

  return (
    <HomePage
      discoverEntries={discoverEntries}
      discoveryError={liveLibrary.ok ? null : liveLibrary.message}
      featured={liveLibrary.ok ? liveLibrary.featured : discoverEntries[0] ?? null}
    />
  );
}
