import { describe, expect, it, vi } from "vitest";
import { mockSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import type { Database } from "../../../../supabase/database.types";
import { SupabaseResumeRepository } from "./SupabaseResumeRepository";

type ResumeRow = Database["public"]["Tables"]["resumes"]["Row"];

const row: ResumeRow = {
  id: "resume-1",
  file_path: "resumes/resume-1.pdf",
  parsed_text: "Experienced engineer",
  skills: ["React", "Node.js"],
  uploaded_at: "2026-01-01T00:00:00Z",
  is_active: true,
};

describe("SupabaseResumeRepository", () => {
  it("getActive returns the active resume, mapped", async () => {
    const { client, builder } = mockSupabaseClient({ data: row, error: null });
    const repo = new SupabaseResumeRepository(client);

    const result = await repo.getActive();

    expect(result).toEqual({
      id: "resume-1",
      filePath: "resumes/resume-1.pdf",
      parsedText: "Experienced engineer",
      skills: ["React", "Node.js"],
      uploadedAt: "2026-01-01T00:00:00Z",
      isActive: true,
    });
    expect(builder.eq).toHaveBeenCalledWith("is_active", true);
    expect(builder.maybeSingle).toHaveBeenCalled();
  });

  it("getActive returns null when no resume is active", async () => {
    const { client } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseResumeRepository(client);

    expect(await repo.getActive()).toBeNull();
  });

  it("create calls set_active_resume and maps the first returned row", async () => {
    const { client } = mockSupabaseClient({ data: [row], error: null });
    const repo = new SupabaseResumeRepository(client);

    const result = await repo.create({
      filePath: "resumes/resume-1.pdf",
      parsedText: "Experienced engineer",
      skills: ["React", "Node.js"],
    });

    expect(result.id).toBe("resume-1");
    expect(vi.mocked(client.rpc)).toHaveBeenCalledWith("set_active_resume", {
      p_file_path: "resumes/resume-1.pdf",
      p_parsed_text: "Experienced engineer",
      p_skills: ["React", "Node.js"],
    });
  });

  it("create throws if the RPC returns no rows", async () => {
    const { client } = mockSupabaseClient({ data: [], error: null });
    const repo = new SupabaseResumeRepository(client);

    await expect(
      repo.create({ filePath: "x", parsedText: "y", skills: [] }),
    ).rejects.toThrow("set_active_resume returned no row");
  });

  it("updateSkills updates and returns the resume", async () => {
    const { client, builder } = mockSupabaseClient({ data: { ...row, skills: ["Python"] }, error: null });
    const repo = new SupabaseResumeRepository(client);

    const result = await repo.updateSkills("resume-1", ["Python"]);

    expect(result.skills).toEqual(["Python"]);
    expect(builder.update).toHaveBeenCalledWith({ skills: ["Python"] });
    expect(builder.eq).toHaveBeenCalledWith("id", "resume-1");
  });
});
