import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

// Supabase PKCE code-exchange callback (frontend.md §4.4) -- used for
// initial password setup / password-reset links for the one account.
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
