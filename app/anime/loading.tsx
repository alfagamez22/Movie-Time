export default function AnimeLoading() {
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      {/* Skeleton header */}
      <header className="fixed inset-x-0 top-0 z-50 bg-[#050505]/95 shadow-lg backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-6 md:px-12 md:py-0">
          <div className="flex items-center justify-between gap-3 md:h-16">
            <div className="h-9 w-24 animate-pulse rounded-md bg-white/10 sm:h-12 sm:w-36 md:h-14 md:w-44" />
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 animate-pulse rounded-full bg-white/10" />
              <div className="h-8 w-8 animate-pulse rounded-full bg-white/10" />
            </div>
          </div>
        </div>
      </header>

      {/* Skeleton hero banner */}
      <div className="relative h-[55vw] max-h-[680px] min-h-[300px] w-full overflow-hidden bg-zinc-900">
        <div className="absolute inset-0 animate-pulse bg-white/[0.04]" />
        <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10 md:p-14">
          <div className="max-w-xl space-y-4">
            <div className="h-10 w-2/3 animate-pulse rounded-lg bg-white/10" />
            <div className="space-y-2">
              <div className="h-3.5 w-full animate-pulse rounded bg-white/8" />
              <div className="h-3.5 w-5/6 animate-pulse rounded bg-white/8" />
              <div className="h-3.5 w-3/4 animate-pulse rounded bg-white/8" />
            </div>
            <div className="flex gap-3 pt-2">
              <div className="h-11 w-32 animate-pulse rounded-full bg-white/15" />
              <div className="h-11 w-28 animate-pulse rounded-full bg-white/10" />
            </div>
          </div>
        </div>
      </div>

      {/* Skeleton browse rows */}
      <div className="space-y-10 py-8">
        {Array.from({ length: 4 }, (_, rowIndex) => (
          <div key={rowIndex} className="space-y-4 px-3 sm:px-6 md:px-12">
            {/* Row title */}
            <div className="h-5 w-48 animate-pulse rounded bg-white/10" />
            {/* Row cards */}
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 7 }, (_, cardIndex) => (
                <div
                  key={cardIndex}
                  className="aspect-[2/3] w-[calc((100%-6*0.75rem)/7)] shrink-0 animate-pulse rounded-lg bg-white/[0.06]"
                  style={{ animationDelay: `${(rowIndex * 7 + cardIndex) * 40}ms` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
