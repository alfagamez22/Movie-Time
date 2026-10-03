import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCouchbase } from '@/lib/db/couchbase';
import { validateFeedback } from '@/lib/feedback/validation';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'You must be signed in to provide feedback.' }, { status: 401 });
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  let input;
  try {
    const body = await request.text();
    if (body.length > 8192) return NextResponse.json({ error: 'Feedback is too large.' }, { status: 413 });
    input = validateFeedback(JSON.parse(body));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid feedback.' }, { status: 400 });
  }
  try {
    const { scope } = await getCouchbase();
    const collection = scope.collection('feedback');
    // Atomic counter with a 24-hour window starting at the first attempt, shared by all instances.
    const quota = await collection.binary().increment(`quota::${encodeURIComponent(session.user.id)}`, 1, { initial: 1, expiry: 86400 });
    if (quota.value > 5) return NextResponse.json({ error: 'You have reached the limit of 5 feedback submissions per 24 hours. Please try again later.' }, { status: 429, headers: { 'Retry-After': '86400' } });
    const id = randomUUID();
    await collection.insert(`feedback::${id}`, { ...input, id, type: 'feedback', userId: session.user.id, createdAt: new Date().toISOString() });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Feedback submission failed', { error: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'We could not save your feedback. Please try again later.' }, { status: 503 });
  }
}
