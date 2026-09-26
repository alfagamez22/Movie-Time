import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';

import { isAdminEmail } from './admin';

export async function getAdminSession() {
  const session = await auth();
  return isAdminEmail(session?.user?.email) ? session : null;
}

export function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
