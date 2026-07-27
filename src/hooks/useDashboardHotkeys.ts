"use client";

import { useEffect } from "react";

export function useDashboardHotkeys(jobId: string, actions: {
  onReject: () => void;
  onArchive: () => void;
  onDraft: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Basic shortcut implementation
      if (e.key === 'r') actions.onReject();
      if (e.key === 'a') actions.onArchive();
      if (e.key === 'd') actions.onDraft();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions]);
}
