// Server actions return typed result objects, never thrown exceptions,
// across the server/client boundary (frontend.md §3).
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
