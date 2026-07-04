import { type NextRequest } from "next/server";
import { updateSession } from "@/shared/infrastructure/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// api/ is excluded -- API routes (currently just the Telegram webhook)
// authenticate themselves (TELEGRAM_CALLBACK_SECRET) and must never be
// redirected to /login, which would 30x an external caller like Telegram
// instead of returning it a real response.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
