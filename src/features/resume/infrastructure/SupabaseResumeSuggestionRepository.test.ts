import { describe, expect, it } from "vitest";
import type { ResumeSuggestionItem } from "@/features/resume/domain/types";
import { mockSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import type { Database } from "../../../../supabase/database.types";
import { SupabaseResumeSuggestionRepository } from "./SupabaseResumeSuggestionRepository";

type ResumeSuggestionRow = Database["public"]["Tables"]["resume_suggestions"]["Row"];

const suggestions: ResumeSuggestionItem[] = [
  { id: "s1", category: "Impact", title: "Add metrics", detail: "Quantify bullets" },
];

const row: ResumeSuggestionRow = {
  id: "set-1",
  resume_id: "resume-1",
  target_role: "Software Engineer",
  suggestions: suggestions as unknown as ResumeSuggestionRow["suggestions"],
  model: "gemini-2.5-flash",
  created_at: "2026-01-01T00:00:00Z",
  applied_as_resume_id: null,
};

describe("SupabaseResumeSuggestionRepository", () => {
  it("create inserts and returns the mapped set", async () => {
    const { client, builder } = mockSupabaseClient({ data: row, error: null });
    const repo = new SupabaseResumeSuggestionRepository(client);

    const result = await repo.create({
      resumeId: "resume-1",
      targetRole: "Software Engineer",
      suggestions,
      model: "gemini-2.5-flash",
    });

    expect(result).toEqual({
      id: "set-1",
      resumeId: "resume-1",
      targetRole: "Software Engineer",
      suggestions,
      model: "gemini-2.5-flash",
      createdAt: "2026-01-01T00:00:00Z",
      appliedAsResumeId: null,
    });
    expect(builder.insert).toHaveBeenCalledWith({
      resume_id: "resume-1",
      target_role: "Software Engineer",
      suggestions,
      model: "gemini-2.5-flash",
    });
  });

  it("getById returns the mapped set", async () => {
    const { client, builder } = mockSupabaseClient({ data: row, error: null });
    const repo = new SupabaseResumeSuggestionRepository(client);

    const result = await repo.getById("set-1");

    expect(result?.id).toBe("set-1");
    expect(builder.eq).toHaveBeenCalledWith("id", "set-1");
    expect(builder.maybeSingle).toHaveBeenCalled();
  });

  it("getById returns null when no row matches", async () => {
    const { client } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseResumeSuggestionRepository(client);

    expect(await repo.getById("missing")).toBeNull();
  });

  it("markApplied updates applied_as_resume_id", async () => {
    const { client, builder } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseResumeSuggestionRepository(client);

    await repo.markApplied("set-1", "resume-2");

    expect(builder.update).toHaveBeenCalledWith({ applied_as_resume_id: "resume-2" });
    expect(builder.eq).toHaveBeenCalledWith("id", "set-1");
  });

  it("create throws on a Supabase error", async () => {
    const { client } = mockSupabaseClient({ data: null, error: { message: "insert failed" } });
    const repo = new SupabaseResumeSuggestionRepository(client);

    await expect(
      repo.create({ resumeId: "resume-1", targetRole: "", suggestions: [], model: "m" }),
    ).rejects.toThrow();
  });
});
