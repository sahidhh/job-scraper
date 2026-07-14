import type { ApplicationRepository } from "@/features/applications/domain/ApplicationRepository";
import type { Application } from "@/features/applications/domain/types";

export interface MarkApplicationSentDeps {
  repository: ApplicationRepository;
}

// Records that the user opened the mailto: link and sent the message
// themselves (application/buildMailtoLink.ts) -- this app never sends email
// on its own behalf. Only a 'draft' can transition to 'sent'; 'sent' is
// terminal (draftApplication.ts refuses to redraft over it).
export async function markApplicationSent(id: string, deps: MarkApplicationSentDeps): Promise<Application> {
  const application = await deps.repository.getById(id);
  if (!application) {
    throw new Error("Application not found.");
  }
  if (application.status !== "draft") {
    throw new Error("Only draft applications can be marked sent.");
  }

  return deps.repository.markSent(id);
}
