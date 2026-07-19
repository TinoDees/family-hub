import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not add logic between client creation and getUser() — token refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/" ||
    path === "/manifest.webmanifest" || // browsers fetch these without cookies —
    path === "/sw.js" ||                // blocking them breaks PWA install + push
    path.startsWith("/api/") || // API routes guard themselves (push secret, cron secret, session checks)
    path === "/tour" ||        // public quick-tour page (rewrites to /tour.html)
    path === "/tour.html" ||
    path === "/login" ||
    path === "/signup" ||
    path === "/pricing" ||
    path.startsWith("/auth") ||
    path.startsWith("/invite") ||
    path.startsWith("/trip-invite");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    const next = url.pathname + url.search;
    url.pathname = "/login";
    url.search = next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
