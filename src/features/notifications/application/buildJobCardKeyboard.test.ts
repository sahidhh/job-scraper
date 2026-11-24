import { describe, expect, it } from "vitest";
import { buildJobCardKeyboard } from "./buildJobCardKeyboard";

describe("buildJobCardKeyboard", () => {
  it("builds Apply URL row and Applied/Skip/Closed callback row", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    const keyboard = buildJobCardKeyboard({ jobId: uuid, url: "https://example.com/job" });

    expect(keyboard).toEqual([
      [{ text: "🔗 Apply", url: "https://example.com/job" }],
      [
        { text: "✅ Applied", callback_data: `st:applied:${uuid}` },
        { text: "⏭️ Skip", callback_data: `st:skipped:${uuid}` },
        { text: "🚫 Closed", callback_data: `st:closed:${uuid}` },
      ],
    ]);
  });

  it("throws if callback_data exceeds 64 bytes", () => {
    const longId = "a".repeat(60);
    expect(() => buildJobCardKeyboard({ jobId: longId, url: "https://example.com/job" })).toThrow(/64 bytes/);
  });
});
