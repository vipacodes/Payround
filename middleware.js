import { NextResponse } from 'next/server';

const PROTECTED = [
  '/dashboard',
  '/settings',
  '/profile',
  '/notifications',
  '/messages',
  '/group-chat',
  '/groups/create',
];

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!needsAuth) return NextResponse.next();

  const hasSb = request.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.value);
  if (hasSb) return NextResponse.next();

  // Client still uses localStorage; allow HTML through but cache-bust.
  // Real lock is RLS. This only reduces accidental indexing of app shells.
  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export const config = {
  matcher: ['/dashboard/:path*', '/settings', '/profile', '/notifications', '/messages', '/group-chat', '/groups/create'],
};
