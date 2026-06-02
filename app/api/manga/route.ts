import { NextResponse } from 'next/server';

import { browseManga } from '@/lib/manga/browse';
import { searchManga } from '@/lib/manga/search';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() || '';

  if (query) {
    const result = await searchManga(query);
    const error = result.error ?? null;

    if (error && result.data.length === 0) {
      return NextResponse.json(
        {
          data: [],
          error,
          filters: { query, type: null },
          mode: 'search',
          total: 0,
          totalResults: 0,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      data: result.data,
      filters: { query, type: null },
      mode: 'search',
      total: result.data.length,
      totalResults: result.data.length,
    });
  }

  const library = await browseManga();
  if (library.error && library.sections.length === 0) {
    return NextResponse.json(
      {
        data: [],
        error: library.error,
        filters: { query: null, type: null },
        mode: 'browse',
        total: 0,
        totalResults: 0,
      },
      { status: 200 },
    );
  }

  const browseEntries = library.sections.flatMap((s) => s.entries).slice(0, 42);

  return NextResponse.json({
    data: browseEntries,
    filters: { query: null, type: null },
    mode: 'browse',
    sections: library.sections,
    total: browseEntries.length,
    totalResults: browseEntries.length,
  });
}
