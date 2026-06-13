import { vi } from "vitest";
import type { TypedSupabaseClient } from "../supabaseClient";

export interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
}

// A chainable stand-in for the Supabase query builder: every method call
// (`.select()`, `.eq()`, `.order()`, ...) records its arguments and returns
// the same proxy, and `await`-ing the proxy resolves to `result` -- mirrors
// how `@supabase/postgrest-js` builders are themselves thenable.
export function chainable<T>(result: QueryResult<T>): Record<string, ReturnType<typeof vi.fn>> {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};

  const proxy = new Proxy(calls, {
    get(target, prop) {
      if (prop === "then") {
        return (onfulfilled: (value: QueryResult<T>) => unknown) => Promise.resolve(result).then(onfulfilled);
      }
      const key = String(prop);
      if (!(key in target)) {
        target[key] = vi.fn(() => proxy);
      }
      return target[key];
    },
  });

  return proxy as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

// A minimal mock Supabase client: `.from(table)` and `.rpc(fn)` both return
// the same chainable builder, which resolves to `result`.
export function mockSupabaseClient<T>(result: QueryResult<T>): {
  client: TypedSupabaseClient;
  builder: Record<string, ReturnType<typeof vi.fn>>;
} {
  const builder = chainable(result);
  const client = {
    from: vi.fn(() => builder),
    rpc: vi.fn(() => builder),
  } as unknown as TypedSupabaseClient;

  return { client, builder };
}

// For repository methods that issue multiple sequential `.from()`/`.rpc()`
// calls (e.g. a lookup query followed by a write): each call consumes the
// next queued result and gets its own chainable builder, so assertions can
// target each call independently via `builders[0]`, `builders[1]`, ...
export function queuedSupabaseClient(results: QueryResult<unknown>[]): {
  client: TypedSupabaseClient;
  builders: Record<string, ReturnType<typeof vi.fn>>[];
} {
  const queue = [...results];
  const builders: Record<string, ReturnType<typeof vi.fn>>[] = [];

  const next = (): Record<string, ReturnType<typeof vi.fn>> => {
    const result = queue.shift();
    if (!result) {
      throw new Error("queuedSupabaseClient: no more queued results");
    }
    const builder = chainable(result);
    builders.push(builder);
    return builder;
  };

  const client = {
    from: vi.fn(() => next()),
    rpc: vi.fn(() => next()),
  } as unknown as TypedSupabaseClient;

  return { client, builders };
}
