import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';

import { isAdminEmail } from '@/lib/auth/admin';
import { authConfig } from '@/lib/auth/config';

const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isAdminArea = pathname === '/dashboard' || pathname.startsWith('/dashboard/') || pathname.startsWith('/api/admin/');
  if (isAdminArea && !isAdminEmail(request.auth?.user?.email)) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.rewrite(new URL('/__not-found', request.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest|api/auth|\\.well-known).*)'],
};
