import type { ApplicationRepository } from "@/features/applications/domain/ApplicationRepository";
import type { Application } from "@/features/applications/domain/types";

export interface MarkApplicationDismissedDeps {
  repository: ApplicationRepository;
}

// User decided not to send this draft. Only a 'draft' can be dismissed; a
// dismissed application can later be redrafted (draftApplication.ts treats
// 'dismissed' the same as "no row yet"), but a 'sent' one is a permanent
// record and cannot be dismissed away.
export async function markApplicationDismissed(id: string, deps: MarkApplicationDismissedDeps): Promise<Application> {
  const application = await deps.repository.getById(id);
  if (!application) {
    throw new Error("Application not found.");
  }
  if (application.status !== "draft") {
    throw new Error("Only draft applications can be dismissed.");
  }

  return deps.repository.markDismissed(id);
}
