import { describe, expect, it } from "vitest";
import { mockSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import { SupabaseSettingsRepository } from "./SupabaseSettingsRepository";

describe("SupabaseSettingsRepository", () => {
  describe("getDesiredExperienceYears", () => {
    it("returns the numeric value when set", async () => {
      const { client, builder } = mockSupabaseClient({ data: { value: 4 }, error: null });
      const repo = new SupabaseSettingsRepository(client);

      expect(await repo.getDesiredExperienceYears()).toBe(4);
      expect(builder.eq).toHaveBeenCalledWith("key", "desired_experience_years");
    });

    it("returns null when no row exists", async () => {
      const { client } = mockSupabaseClient({ data: null, error: null });
      const repo = new SupabaseSettingsRepository(client);

      expect(await repo.getDesiredExperienceYears()).toBeNull();
    });

    it("returns null when the stored value is not a number", async () => {
      const { client } = mockSupabaseClient({ data: { value: "oops" }, error: null });
      const repo = new SupabaseSettingsRepository(client);

      expect(await repo.getDesiredExperienceYears()).toBeNull();
    });
  });

  describe("setDesiredExperienceYears", () => {
    it("upserts the value on conflict of key", async () => {
      const { client, builder } = mockSupabaseClient({ data: null, error: null });
      const repo = new SupabaseSettingsRepository(client);

      await repo.setDesiredExperienceYears(5);

      const upsertCall = builder.upsert!.mock.calls[0] as unknown[];
      expect(upsertCall[0]).toMatchObject({ key: "desired_experience_years", value: 5 });
      expect(upsertCall[1]).toEqual({ onConflict: "key" });
    });

    it("deletes the row when cleared with null", async () => {
      const { client, builder } = mockSupabaseClient({ data: null, error: null });
      const repo = new SupabaseSettingsRepository(client);

      await repo.setDesiredExperienceYears(null);

      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith("key", "desired_experience_years");
    });
  });
});
