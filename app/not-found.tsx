import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
      <div className="glass flex w-full max-w-xl flex-col gap-5 rounded-2xl p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-gray-500">404</p>
        <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">Media entry not found</h1>
        <p className="text-sm leading-relaxed text-gray-400">
          The title you requested could not be resolved. Go back to the library and search by title or numeric identifier.
        </p>
        <Link
          href="/"
          className="mx-auto inline-flex rounded-lg bg-netflix-red px-5 py-3 text-sm font-bold uppercase tracking-wider text-white transition-transform active:scale-95"
        >
          Return to library
        </Link>
      </div>
    </main>
  );
}
