'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

import type { MediaExperienceConfig } from '@/lib/media/experience';
import { consumePlaybackReturn } from '@/lib/media/playback-return';
import type { LibraryMediaEntry } from '@/lib/media/types';
import type { PersonProfile } from '@/lib/people/types';

import { BrowseRow } from './browse-row';
import { MediaDetailsModal } from './media-details-modal';

function formatBirthday(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 86_400_000));
  const label = date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC', year: 'numeric' });
  return age > 0 && age < 120 ? `Born ${label} (age ${age})` : `Born ${label}`;
}

export function PersonPage({ experience, person }: { experience: MediaExperienceConfig; person: PersonProfile }) {
  const router = useRouter();
  const [selectedEntry, setSelectedEntry] = useState<LibraryMediaEntry | null>(null);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [birthdayLabel, setBirthdayLabel] = useState<string | null>(null);
  const backdrop = person.rows[0]?.entries.find((entry) => entry.backdropUrl)?.backdropUrl;

  useEffect(() => {
    const returnEntry = consumePlaybackReturn(experience.id);
    const id = setTimeout(() => {
      if (returnEntry) setSelectedEntry(returnEntry);
      setBirthdayLabel(formatBirthday(person.birthday));
    }, 0);
    return () => clearTimeout(id);
  }, [experience.id, person.birthday]);

  const goBack = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push(experience.homeHref);
  }, [experience.homeHref, router]);

  const meta = [
    person.department,
    birthdayLabel,
    person.placeOfBirth,
    person.totalCredits > 0 ? `${person.totalCredits} titles` : null,
  ].filter(Boolean);

  return (
    <main className="min-h-dvh bg-[#050505] pb-20 text-white" data-browse-theme="cinema">
      <header className="fixed inset-x-0 top-0 z-50 bg-gradient-to-b from-black/90 to-transparent">
        <div className="mx-auto flex max-w-[1800px] items-center gap-3 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-12">
          <button
            type="button"
            onClick={goBack}
            aria-label="Go back"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Link
            href={experience.homeHref}
            aria-label={`${experience.brandName} home`}
            className="h-9 w-24 shrink-0 select-none bg-no-repeat sm:h-12 sm:w-36 md:h-14 md:w-44"
            style={{
              backgroundImage: `url('${experience.brandBannerSrc}')`,
              backgroundPosition: experience.brandBackgroundPosition,
              backgroundSize: experience.brandBackgroundSize,
            }}
          >
            <span className="sr-only">{experience.brandName}</span>
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden">
        {backdrop ? (
          <div aria-hidden="true" className="absolute inset-0 scale-110 bg-cover bg-center opacity-40 blur-sm" style={{ backgroundImage: `url("${backdrop}")` }} />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/80 to-[#050505]/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-black/40" />

        <div className="relative mx-auto flex max-w-[1800px] flex-col items-center gap-6 px-4 pb-10 pt-[calc(env(safe-area-inset-top)+5.5rem)] text-center sm:flex-row sm:items-end sm:text-left md:gap-10 md:px-12 md:pb-14 md:pt-36">
          <div className="relative aspect-[2/3] w-36 shrink-0 overflow-hidden rounded-xl bg-zinc-900 shadow-2xl ring-1 ring-white/15 sm:w-44 md:w-56">
            {person.profileUrl ? (
              <Image src={person.profileUrl} alt={person.name} fill priority sizes="224px" className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center text-sm font-semibold text-zinc-500">{person.name}</div>
            )}
          </div>

          <div className="min-w-0 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
              {person.source === 'anilist' ? 'Voice Actor' : person.department === 'Acting' ? 'Cast' : 'Creator'}
            </p>
            <h1 className="mt-2 text-4xl font-black leading-none tracking-tight [text-wrap:balance] sm:text-5xl md:text-6xl">{person.name}</h1>
            {person.source === 'anilist' && person.knownFor ? <p className="mt-2 text-lg text-zinc-400">{person.knownFor}</p> : null}
            {meta.length > 0 ? (
              <p className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm text-zinc-300 sm:justify-start">
                {meta.map((item, index) => (
                  <span key={String(item)} className="flex items-center gap-3">
                    {index > 0 ? <span className="h-1 w-1 rounded-full bg-zinc-500" aria-hidden="true" /> : null}
                    {item}
                  </span>
                ))}
              </p>
            ) : null}
            {person.biography ? (
              <div className="mt-4">
                <p className={`whitespace-pre-line text-sm leading-relaxed text-zinc-300 md:text-base ${bioExpanded ? '' : 'line-clamp-3'}`}>
                  {person.biography}
                </p>
                {person.biography.length > 260 ? (
                  <button type="button" onClick={() => setBioExpanded((value) => !value)} className="mt-1 text-sm font-semibold text-white hover:underline">
                    {bioExpanded ? 'Show less' : 'Read more'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="browse-shelves space-y-10">
        {person.rows.length === 0 ? (
          <p className="mx-auto max-w-7xl px-6 text-zinc-500 md:px-12">No titles found for {person.name} yet.</p>
        ) : (
          person.rows.map((row, index) => (
            <BrowseRow
              key={row.id}
              anchorId={row.id}
              cinematic
              entries={row.entries}
              loop={false}
              onEntrySelect={setSelectedEntry}
              prioritizeLeadPoster={index === 0}
              title={row.title}
            />
          ))
        )}
      </div>

      <MediaDetailsModal
        entry={selectedEntry}
        experience={experience}
        onClose={() => setSelectedEntry(null)}
        onSelectEntry={setSelectedEntry}
        preferredAnimeLanguage="sub"
        recentlyWatched={[]}
      />
    </main>
  );
}
