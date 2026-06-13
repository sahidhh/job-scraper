# Dependency Rules Audit

Scope: verifying `architecture.md` §5 dependency rules (Domain has zero deps; Application depends only on Domain; Infrastructure implements Domain interfaces and may depend on `shared/infrastructure`; Presentation is the composition root) across all features, via exhaustive `import` grep of `src/features/*/{domain,application,infrastructure}` and `src/app`, `src/components`.

---

## Findings

### 1. `ThresholdsCard.tsx` (presentation) imports directly from `shared/infrastructure`

- **Severity:** Low
- **File:** `src/components/settings/ThresholdsCard.tsx`
- **Location:** `import { optionalEnv } from "@/shared/infrastructure/env"` near top of file
- **Description:** This component reads `KEYWORD_THRESHOLD` / `NOTIFY_THRESHOLD` env values directly via `optionalEnv` to display current configuration on the Settings page. `optionalEnv` itself is a trivial, side-effect-free `process.env` accessor (not a Supabase/HTTP client), so this isn't a "real" infra dependency in the sense of leaking a DB connection into a component — but it is still a presentation component importing from `shared/infrastructure`, which architecture.md §5 reserves for the composition root / infrastructure layer.
- **Why it matters:** Low risk today because `optionalEnv` has no side effects and works fine in both server and client component contexts. But it sets a precedent — if a future contributor follows this example to import something heavier (e.g., a Supabase client factory) directly into a component, that would be a real layering violation. It also means this component can't be unit-tested without an env shim.
- **Recommended fix:** Have the parent server component (`src/app/(protected)/settings/page.tsx`) read `optionalEnv("KEYWORD_THRESHOLD", ...)` / `optionalEnv("NOTIFY_THRESHOLD", ...)` and pass the resolved values into `ThresholdsCard` as plain props. This keeps `shared/infrastructure` imports confined to server components/composition roots and makes `ThresholdsCard` a pure presentational component.

---

## Summary of Compliant Areas (no action needed)

Verified via exhaustive grep across all 8 features (`auth`, `companies`, `jobs`, `filtering`, `notifications`, `resume`, `roles`, `scoring`, `sources`):

- **Domain has zero outward dependencies.** No file under any `features/*/domain/` imports from `application/`, `infrastructure/`, `@/shared/infrastructure`, `@supabase/*`, or any other feature's `domain/`. Domain files only import from sibling `domain/` files, `@/shared/domain/enums`, and each other within the same feature's domain.
- **Application depends only on Domain (+ its own feature's other application files).** No file under `features/*/application/` imports from `infrastructure/` (own or cross-feature), `@supabase/*`, `next/*`, `react`, or any UI library. Provider/repository dependencies are injected via parameter interfaces (e.g., `scoreJob(job, resume, roleSelectionId, deps: ScoreJobDeps)`), satisfying the Dependency Inversion requirement.
- **Repository interfaces live in Domain, implementations in Infrastructure.** Every `*Repository` interface (`JobRepository`, `CompanyRepository`, `ResumeRepository`, `RoleSelectionRepository`/`RoleExpansionRepository`, `ScoreRepository`, `NotificationRepository`, `ScrapeRunRepository`) is declared in its feature's `domain/`, and the corresponding `SupabaseXRepository` in `infrastructure/` implements it (`implements XRepository`) and is the only place that constructs a Supabase client / runs `.from(...)` queries for that feature.
- **Infrastructure implements Domain interfaces correctly.** All `Supabase*Repository`, `OpenRouter*Provider`, `TelegramBotSender`, and scraper classes implement the corresponding domain interface (`AiScoreProvider`, `RoleExpansionProvider`, `NotificationSender`, `JobSourceScraper`) with matching method signatures.
- **Presentation is the composition root.** All `infrastructure` class instantiation (`new SupabaseXRepository(...)`, `new OpenRouterXProvider(...)`, `new TelegramBotSender(...)`) happens only in `src/app/**/page.tsx`, `src/features/*/actions.ts`, or test files — never inside `domain/` or `application/`.
- **No cross-feature domain imports.** Each feature's `domain/` only imports `@/shared/domain/enums` and its own files — e.g., `features/scoring/domain` does not import `features/jobs/domain` types directly; shared concepts (`JobWithScore`, `LocationTag`, `JobSource`, `RoleMapSource`) live in `@/shared/domain/enums` or `features/jobs/domain/types.ts` and are imported by name, which is explicitly allowed by repositories.md §8's "Cross-Feature Read Note."
- **`@/shared/infrastructure/supabaseClient.ts` (`createSupabaseServiceClient`) and `@/shared/infrastructure/supabase/server.ts` (`createSupabaseServerClient`) are correctly infrastructure-only** — both are imported exclusively from `infrastructure/` files and composition-root files, never from `domain/` or `application/`.
