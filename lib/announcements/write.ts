import { NextResponse } from 'next/server';
import { validateAnnouncement, type AnnouncementInput, type PublicationContext } from './validation';

export async function announcementWrite(request: Request, save: (input: AnnouncementInput) => Promise<string>, context: PublicationContext = {}) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  let input;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Announcement is required.');
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2900000) { await reader.cancel(); return NextResponse.json({ error: 'Announcement upload is too large.' }, { status: 413 }); }
      chunks.push(value);
    }
    input = validateAnnouncement(JSON.parse(Buffer.concat(chunks).toString('utf8')), Date.now(), context);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid announcement.' }, { status: 400 }); }
  try { return NextResponse.json({ id: await save(input) }, { status: 200 }); }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('Could not process banner') || message.startsWith('Banner must')) return NextResponse.json({ error: message }, { status: 400 });
    if (message === 'Announcement not found.') return NextResponse.json({ error: message }, { status: 404 });
    console.error('Announcement save failed', { error: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'Could not save announcement. Please try again.' }, { status: 503 });
  }
}
