import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // Melewati internal Next.js dan semua file statis (seperti gambar, css, dll)
    '/((?!_next|[^?]*\\.[^?]*$).*)',
    // Selalu jalankan middleware untuk rute API dan TRPC
    '/(api|trpc)(.*)',
  ],
};