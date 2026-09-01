import { type NextRequest } from "next/server";
import { updateSession } from "@/shared/infrastructure/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// api/ is excluded -- API routes (currently just the Telegram webhook)
// authenticate themselves (TELEGRAM_CALLBACK_SECRET) and must never be
// redirected to /login, which would 30x an external caller like Telegram
// instead of returning it a real response.
//
// manifest.webmanifest is excluded for the same class of reason: the browser
// fetches it to decide whether the app is installable, and it is the one
// metadata route the extension-based exclusions below do not already cover
// (the icons are .svg/.png and fall through). Left in, a signed-out fetch
// 307s to /login and the install prompt silently never appears.
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
