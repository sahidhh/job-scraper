"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { updateResumeSkillsAction } from "@/features/resume/actions";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface SkillsEditorProps {
  resumeId: string;
  skills: string[];
}

export function SkillsEditor({ resumeId, skills }: SkillsEditorProps) {
  const [items, setItems] = useState(skills);
  const [newSkill, setNewSkill] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(next: string[]) {
    setError(null);
    startTransition(async () => {
      const result = await updateResumeSkillsAction(resumeId, next);
      if (result.ok) {
        setItems(result.data.skills);
      } else {
        setError(result.error);
      }
    });
  }

  function handleAdd() {
    const trimmed = newSkill.trim();
    setNewSkill("");
    setAdding(false);
    if (trimmed.length === 0) return;
    if (items.some((item) => item.toLowerCase() === trimmed.toLowerCase())) return;
    save([...items, trimmed]);
  }

  function handleRemove(skill: string) {
    save(items.filter((item) => item !== skill));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">No skills extracted yet.</p>}
        {items.map((skill) => (
          <Badge key={skill} variant="secondary" className="gap-1">
            {skill}
            <button
              type="button"
              onClick={() => handleRemove(skill)}
              disabled={isPending}
              aria-label={`Remove ${skill}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {/* Trailing dashed chip, matching the Roles screen's "+ Add role"
            affordance (design handoff) -- the add control sits in the chip row
            rather than as a separate input beneath it. */}
        {adding ? (
          <Input
            autoFocus
            value={newSkill}
            disabled={isPending}
            placeholder="Skill name"
            className="h-7 w-40 text-xs"
            onChange={(event) => setNewSkill(event.target.value)}
            onBlur={handleAdd}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAdd();
              }
              if (event.key === "Escape") {
                setNewSkill("");
                setAdding(false);
              }
            }}
          />
        ) : (
          <Badge asChild variant="outline" className="border-dashed text-muted-foreground">
            <button type="button" disabled={isPending} onClick={() => setAdding(true)}>
              <Plus className="size-3" />
              Add skill
            </button>
          </Badge>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
