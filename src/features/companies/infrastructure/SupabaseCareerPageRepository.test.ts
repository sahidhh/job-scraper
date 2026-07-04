import { describe, expect, it } from "vitest";
import { mockSupabaseClient, queuedSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import type { NewCareerPage } from "@/features/companies/domain/types";
import { SupabaseCareerPageRepository } from "./SupabaseCareerPageRepository";

describe("SupabaseCareerPageRepository", () => {
  describe("upsertMany", () => {
    it("upserts all pages on conflict of canonical_company_name", async () => {
      const { client, builder } = mockSupabaseClient({ data: null, error: null });
      const repo = new SupabaseCareerPageRepository(client);

      const pages: NewCareerPage[] = [
        { canonicalCompanyName: "Acme", careerPageUrl: "https://boards.greenhouse.io/acme", discoveryMethod: "ats_board", confidence: "high" },
      ];
      await repo.upsertMany(pages);

      expect(builder.upsert).toHaveBeenCalledWith(
        [
          {
            canonical_company_name: "Acme",
            career_page_url: "https://boards.greenhouse.io/acme",
            website_url: null,
            discovery_method: "ats_board",
            confidence: "high",
          },
        ],
        { onConflict: "canonical_company_name" },
      );
    });

    it("does not query for an empty array", async () => {
      const { client, builders } = queuedSupabaseClient([]);
      const repo = new SupabaseCareerPageRepository(client);

      await repo.upsertMany([]);

      expect(builders).toHaveLength(0);
    });
  });
});
