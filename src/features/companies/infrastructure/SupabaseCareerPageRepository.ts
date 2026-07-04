import type { CareerPageRepository } from "@/features/companies/domain/CareerPageRepository";
import type { CareerPage, CareerPageConfidence, CareerPageDiscoveryMethod, NewCareerPage } from "@/features/companies/domain/types";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";
import type { Database } from "../../../../supabase/database.types";

type CareerPageRow = Database["public"]["Tables"]["company_career_pages"]["Row"];

function toCareerPage(row: CareerPageRow): CareerPage {
  return {
    id: row.id,
    canonicalCompanyName: row.canonical_company_name,
    careerPageUrl: row.career_page_url,
    websiteUrl: row.website_url,
    discoveryMethod: row.discovery_method as CareerPageDiscoveryMethod,
    confidence: row.confidence as CareerPageConfidence,
    discoveredAt: row.discovered_at,
  };
}

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

  async list(): Promise<CareerPage[]> {
    const { data, error } = await this.client.from("company_career_pages").select("*");
    if (error) throw toAppError(error);
    return (data ?? []).map(toCareerPage);
  }
}
