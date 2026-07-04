import type { CareerPageRepository } from "@/features/companies/domain/CareerPageRepository";
import type { NewCareerPage } from "@/features/companies/domain/types";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";

// repositories.md §1b.
export class SupabaseCareerPageRepository implements CareerPageRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async upsertMany(pages: NewCareerPage[]): Promise<void> {
    if (pages.length === 0) return;

    const { error } = await this.client.from("company_career_pages").upsert(
      pages.map((page) => ({
        canonical_company_name: page.canonicalCompanyName,
        career_page_url: page.careerPageUrl,
        website_url: page.websiteUrl ?? null,
        discovery_method: page.discoveryMethod,
        confidence: page.confidence,
      })),
      { onConflict: "canonical_company_name" },
    );

    if (error) throw toAppError(error);
  }
}
