import { ResumeUploadCard } from "@/components/resume/ResumeUploadCard";
import { SkillsEditor } from "@/components/resume/SkillsEditor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

export default async function ResumePage() {
  const client = await createSupabaseServerClient();
  const resumeRepository = new SupabaseResumeRepository(client);
  const resume = await resumeRepository.getActive();

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
    </div>
  );
}
