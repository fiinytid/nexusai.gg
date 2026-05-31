import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher(['/', '/login(.*)']);

export default clerkMiddleware((auth, request) => {
  const { userId } = auth();

  if (!userId && !isPublicRoute(request)) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.[^?]*$).*)',
    '/(api|trpc)(.*)',
  ],
};