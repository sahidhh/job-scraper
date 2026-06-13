"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { updateResumeSkillsAction } from "@/features/resume/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SkillsEditorProps {
  resumeId: string;
  skills: string[];
}

export function SkillsEditor({ resumeId, skills }: SkillsEditorProps) {
  const [items, setItems] = useState(skills);
  const [newSkill, setNewSkill] = useState("");
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
    if (trimmed.length === 0) return;
    setNewSkill("");
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
      </div>
      <div className="flex gap-2">
        <Input
          value={newSkill}
          onChange={(event) => setNewSkill(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add a skill"
          disabled={isPending}
        />
        <Button type="button" onClick={handleAdd} disabled={isPending || newSkill.trim().length === 0}>
          Add
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
