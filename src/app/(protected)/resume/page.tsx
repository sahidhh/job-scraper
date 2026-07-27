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
            <CardTitle>Extracted skills</CardTitle>
            <CardDescription>
              {describeSource(resume.filePath, resume.uploadedAt)} — add or remove skills to refine job
              scoring.
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

// "{filename} · parsed {n}h ago" caption on the extracted-skills card (design
// handoff). The stored path is content-hash-based (AD-30), so it carries no
// original filename -- the extension is the only honest thing to show, and
// claiming a filename we don't have would be worse than not showing one.
function describeSource(filePath: string, uploadedAt: string): string {
  const ext = filePath.split(".").pop()?.toUpperCase();
  const label = ext === "PDF" || ext === "DOCX" ? `${ext} resume` : "Resume";
  const diffH = Math.floor((Date.now() - new Date(uploadedAt).getTime()) / 3_600_000);
  const when = diffH < 1 ? "parsed < 1h ago" : diffH < 24 ? `parsed ${diffH}h ago` : `parsed ${Math.floor(diffH / 24)}d ago`;
  return `${label} · ${when}`;
}
