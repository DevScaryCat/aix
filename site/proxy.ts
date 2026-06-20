// Next.js 16 renamed `middleware` → `proxy`. This runs before routes render and
// redirects locale-less paths (e.g. `/`, `/docs`) to a locale-prefixed path
// (`/en`, `/ko/docs`, ...) based on the visitor's Accept-Language.
import { NextResponse, type NextRequest } from "next/server";
import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";
import { locales, defaultLocale } from "@/lib/i18n";

function getLocale(request: NextRequest): string {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const languages = new Negotiator({ headers }).languages();
  try {
    return match(languages, locales as readonly string[] as string[], defaultLocale);
  } catch {
    return defaultLocale;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocale) return;

  const locale = getLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  // Run on everything except Next internals, API routes, and files with a dot
  // (favicon.ico, *.svg, etc.).
  matcher: ["/((?!_next|api|.*\\.).*)"],
};
