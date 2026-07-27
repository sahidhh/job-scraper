"use client";

import { UploadCloud, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { uploadResumeAction } from "@/features/resume/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ACCEPT = "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];

// Drag-and-drop can hand us a file with an empty or wrong MIME type, so the
// extension is the check that actually holds. Server-side validation is
// unchanged and remains the real gate -- this is only to fail fast in the UI.
function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function ResumeUploadCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function selectFile(candidate: File | undefined) {
    if (!candidate) return;
    if (!isAcceptedFile(candidate)) {
      setError("Only PDF and DOCX resumes are supported.");
      return;
    }
    setError(null);
    setFile(candidate);
  }

  function clearFile() {
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a resume file first.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setError(null);
    startTransition(async () => {
      const result = await uploadResumeAction(formData);
      if (result.ok) {
        clearFile();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resume</CardTitle>
        <CardDescription>Upload a PDF or DOCX resume to extract skills for job scoring.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Dropzone. The file input stays in the DOM (visually hidden rather
              than removed) so keyboard and assistive-tech users get the real
              control; the drop target is a convenience layered on top. */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              selectFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors",
              isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/20",
            )}
          >
            <UploadCloud className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">Drag &amp; drop your resume here</p>
            <input
              ref={inputRef}
              id="file"
              name="file"
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => selectFile(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={isPending}
            >
              Browse files
            </Button>
            <p className="text-xs text-muted-foreground">PDF or DOCX</p>
          </div>

          {file && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <button
                type="button"
                onClick={clearFile}
                disabled={isPending}
                aria-label={`Remove ${file.name}`}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          <Button type="submit" disabled={isPending || !file}>
            {isPending ? "Uploading..." : "Upload"}
          </Button>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
