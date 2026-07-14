import { ResumeSuggestionsCard } from "@/components/resume/ResumeSuggestionsCard";
import { ResumeUploadCard } from "@/components/resume/ResumeUploadCard";
import { ResumeVersionHistory, type ResumeVersionSummary } from "@/components/resume/ResumeVersionHistory";
import { SkillsEditor } from "@/components/resume/SkillsEditor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

export default async function ResumePage() {
  const client = await createSupabaseServerClient();
  const resumeRepository = new SupabaseResumeRepository(client);
  const [resume, versions] = await Promise.all([resumeRepository.getActive(), resumeRepository.listVersions()]);

  const versionSummaries: ResumeVersionSummary[] = versions.map((version) => ({
    id: version.id,
    version: version.version,
    uploadedAt: version.uploadedAt,
    isActive: version.isActive,
    origin: version.contentHash ? "Uploaded" : "AI-applied",
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Resume</h1>
        <p className="text-sm text-muted-foreground">
          Upload your resume to extract skills used for job scoring.
        </p>
      </div>
      <ResumeUploadCard />
      {resume && (
        <Card>
          <CardHeader>
            <CardTitle>Skills</CardTitle>
            <CardDescription>
              Extracted from your resume. Add or remove skills to refine job scoring.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SkillsEditor resumeId={resume.id} skills={resume.skills} />
          </CardContent>
        </Card>
      )}
      {resume && (
        <Card>
          <CardHeader>
            <CardTitle>AI suggestions</CardTitle>
            <CardDescription>
              Get concrete, non-fabricated improvement suggestions for your active resume. Apply the ones you want
              as a new resume version -- your current version is never overwritten.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResumeSuggestionsCard />
          </CardContent>
        </Card>
      )}
      {versionSummaries.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Version history</CardTitle>
            <CardDescription>
              Restore an earlier version. Restoring creates a new active version -- it never overwrites history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResumeVersionHistory versions={versionSummaries} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
