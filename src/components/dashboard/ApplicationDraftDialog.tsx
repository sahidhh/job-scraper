"use client";

import { Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  draftApplicationAction,
  getApplicationForJobAction,
  markApplicationDismissedAction,
  markApplicationSentAction,
  updateApplicationContentAction,
} from "@/features/applications/actions";
import { buildMailtoLink } from "@/features/applications/application/buildMailtoLink";
import type { Application, ApplicationKind } from "@/features/applications/domain/types";

const KIND_LABELS: Record<ApplicationKind, string> = { email: "Email", coverletter: "Cover letter" };

// Draft -> review -> send flow (mailto only for now, Phase 4). This app
// never sends email on its own behalf: "Open in Mail Client" hands off to
// the user's own mail client via a mailto: link, and marks the application
// sent only once they've done so (scope.md's "Auto-apply / auto-send"
// exclusion).
export function ApplicationDraftDialog({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<ApplicationKind>("email");
  const [application, setApplication] = useState<Application | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function syncFields(app: Application | null) {
    setApplication(app);
    setSubject(app?.subject ?? "");
    setBody(app?.body ?? "");
  }

  function loadApplication(nextKind: ApplicationKind) {
    setError(null);
    setLoading(true);
    startTransition(async () => {
      const result = await getApplicationForJobAction(jobId, nextKind);
      if (result.ok) {
        syncFields(result.data);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    setError(null);
    if (!next) return;
    loadApplication(kind);
  }

  function selectKind(nextKind: ApplicationKind) {
    if (nextKind === kind) return;
    setKind(nextKind);
    loadApplication(nextKind);
  }

  function generateDraft() {
    setError(null);
    startTransition(async () => {
      const result = await draftApplicationAction(jobId, kind);
      if (result.ok) {
        syncFields(result.data);
      } else {
        setError(result.error);
      }
    });
  }

  function saveChanges() {
    if (!application) return;
    setError(null);
    startTransition(async () => {
      const result = await updateApplicationContentAction(application.id, subject, body);
      if (result.ok) {
        syncFields(result.data);
      } else {
        setError(result.error);
      }
    });
  }

  function markSent() {
    if (!application) return;
    startTransition(async () => {
      const result = await markApplicationSentAction(application.id);
      if (result.ok) {
        syncFields(result.data);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function dismiss() {
    if (!application) return;
    startTransition(async () => {
      const result = await markApplicationDismissedAction(application.id);
      if (result.ok) {
        syncFields(result.data);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const mailtoHref = application ? buildMailtoLink(application.recipientEmail, subject, body) : "";
  const isDraft = application?.status === "draft";
  const isSent = application?.status === "sent";
  const isDismissed = application?.status === "dismissed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-md text-primary transition-opacity hover:opacity-70"
          aria-label={`Draft application for ${jobTitle}`}
        >
          <Mail className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Application draft</DialogTitle>
          <DialogDescription className="truncate">{jobTitle}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          {(Object.keys(KIND_LABELS) as ApplicationKind[]).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={kind === option ? "default" : "outline"}
              disabled={isPending || loading}
              onClick={() => selectKind(option)}
            >
              {KIND_LABELS[option]}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : !application || isDismissed ? (
          <div className="space-y-3">
            {isDismissed && <Badge variant="outline">Dismissed</Badge>}
            <p className="text-sm text-muted-foreground">
              Generate a tailored {KIND_LABELS[kind].toLowerCase()} draft using your active resume. You always
              review it before anything is sent.
            </p>
            <Button onClick={generateDraft} disabled={isPending}>
              {isDismissed ? "Regenerate draft" : "Generate draft"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={isSent ? "success" : "outline"}>{application.status}</Badge>
              {application.recipientEmail && (
                <span className="truncate text-xs text-muted-foreground">To: {application.recipientEmail}</span>
              )}
            </div>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={!isDraft || isPending}
              placeholder="Subject"
              aria-label="Subject"
            />
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={!isDraft || isPending}
              rows={10}
              aria-label="Body"
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {application && isDraft && (
          <DialogFooter className="sm:justify-between">
            <div className="flex gap-2">
              <Button variant="ghost" onClick={dismiss} disabled={isPending}>
                Dismiss
              </Button>
              <Button variant="outline" onClick={generateDraft} disabled={isPending}>
                Regenerate
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={saveChanges} disabled={isPending}>
                Save changes
              </Button>
              <Button asChild disabled={isPending}>
                <a href={mailtoHref} onClick={markSent}>
                  Open in mail client
                </a>
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
