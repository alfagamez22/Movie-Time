import { NextResponse } from 'next/server';

import { registerCredentialsUser } from '@/lib/auth/registration';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
    name?: string;
  } | null;

  const result = await registerCredentialsUser(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ success: true }, { status: 201 });
}
