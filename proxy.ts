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

// Only the admin area needs a session check here; running auth on every image and search request added latency.
export const config = {
  matcher: ['/dashboard', '/dashboard/:path*', '/api/admin/:path*'],
};
