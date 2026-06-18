"use client";

import { useState, useTransition } from "react";
import {
  createStatusAction,
  deleteStatusAction,
  updateStatusAction,
} from "@/features/jobs/actions";
import type { JobStatus } from "@/features/jobs/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StatusConfigSectionProps {
  initialStatuses: JobStatus[];
}

interface EditState {
  label: string;
  color: string;
}

export function StatusConfigSection({ initialStatuses }: StatusConfigSectionProps) {
  const [statuses, setStatuses] = useState<JobStatus[]>(initialStatuses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ label: "", color: "" });
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#6b7280");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit(status: JobStatus) {
    setEditingId(status.id);
    setEditState({ label: status.label, color: status.color });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditState({ label: "", color: "" });
    setError(null);
  }

  function handleSaveEdit(status: JobStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateStatusAction(status.id, {
        label: editState.label,
        color: editState.color,
      });
      if (result.ok) {
        setStatuses((prev) =>
          prev.map((s) => (s.id === status.id ? result.data : s)),
        );
        setEditingId(null);
      } else {
        setError(result.error);
      }
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteStatusAction(id);
      if (result.ok) {
        setStatuses((prev) => prev.filter((s) => s.id !== id));
        if (editingId === id) setEditingId(null);
      } else {
        setError(result.error);
      }
    });
  }

  function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createStatusAction({ label: newLabel, color: newColor });
      if (result.ok) {
        setStatuses((prev) => [...prev, result.data]);
        setNewLabel("");
        setNewColor("#6b7280");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {statuses.map((status) => (
        <div key={status.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
          {editingId === status.id ? (
            <>
              <input
                type="color"
                value={editState.color}
                onChange={(e) => setEditState((prev) => ({ ...prev, color: e.target.value }))}
                className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                aria-label="Status color"
              />
              <Input
                value={editState.label}
                onChange={(e) => setEditState((prev) => ({ ...prev, label: e.target.value }))}
                className="h-8 flex-1"
                aria-label="Status label"
              />
              <Button
                size="sm"
                onClick={() => handleSaveEdit(status)}
                disabled={isPending}
              >
                {isPending ? "Saving..." : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelEdit}
                disabled={isPending}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <div
                className="h-5 w-5 shrink-0 rounded-sm border border-border"
                style={{ backgroundColor: status.color }}
                aria-label={`Color swatch for ${status.label}`}
              />
              <span className="flex-1 text-sm">{status.label}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => startEdit(status)}
                disabled={isPending}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(status.id)}
                disabled={isPending}
                className="text-destructive hover:text-destructive"
              >
                Delete
              </Button>
            </>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <form onSubmit={handleAdd} className="flex items-end gap-3 pt-2">
        <div className="space-y-1">
          <Label htmlFor="new-status-color">Color</Label>
          <input
            id="new-status-color"
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent p-0.5"
            aria-label="New status color"
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor="new-status-label">Label</Label>
          <Input
            id="new-status-label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Phone Screen"
            required
          />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding..." : "Add status"}
        </Button>
      </form>
    </div>
  );
}
