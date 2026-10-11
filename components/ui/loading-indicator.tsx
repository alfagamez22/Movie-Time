import Image from 'next/image';

export function LoadingIndicator({ label = 'Loading', brand = false }: { label?: string; brand?: boolean }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-5 py-6 text-center">
      {brand ? (
        <div className="relative h-24 w-64 overflow-hidden sm:h-28 sm:w-80">
          <Image src="/icons/papiflixbanner.png" alt="PapiFlix" fill priority sizes="(max-width: 640px) 256px, 320px" className="scale-[1.7] object-cover object-[47%_center] mix-blend-screen" />
        </div>
      ) : null}
      <span aria-hidden="true" className="h-10 w-10 rounded-full border-[3px] border-white/10 border-t-netflix-red motion-safe:animate-spin" />
      <span className="text-sm text-zinc-400">{label}…</span>
    </div>
  );
}
export function LoadingScreen({ label = 'Getting things ready' }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[200] flex min-h-dvh items-center justify-center bg-[#050505] px-6" data-loading-screen>
      <LoadingIndicator brand label={label} />
    </div>
  );
}
