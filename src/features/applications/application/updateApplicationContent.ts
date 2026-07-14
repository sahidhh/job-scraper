import type { ApplicationRepository } from "@/features/applications/domain/ApplicationRepository";
import type { Application } from "@/features/applications/domain/types";
import { validateApplicationContent } from "@/features/applications/domain/validation";

export interface UpdateApplicationContentDeps {
  repository: ApplicationRepository;
}

// User edits during review, before sending. Only a 'draft' can be edited --
// a 'sent' application is a record of what was actually sent, and a
// 'dismissed' one should be redrafted (draftApplication.ts), not silently
// revived by editing its stale text.
export async function updateApplicationContent(
  id: string,
  subject: string,
  body: string,
  deps: UpdateApplicationContentDeps,
): Promise<Application> {
  validateApplicationContent(subject, body);

  const application = await deps.repository.getById(id);
  if (!application) {
    throw new Error("Application not found.");
  }
  if (application.status !== "draft") {
    throw new Error("Only draft applications can be edited.");
  }

  return deps.repository.updateContent(id, subject, body);
}
