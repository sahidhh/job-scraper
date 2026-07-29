import { describe, expect, it } from "vitest";
import { JOB_HOTKEYS, resolveJobHotkey, type JobHotkeyEvent } from "./jobHotkeys";

function event(overrides: Partial<JobHotkeyEvent> = {}): JobHotkeyEvent {
  return {
    key: "r",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    fromTextEntry: false,
    ...overrides,
  };
}

describe("resolveJobHotkey", () => {
  it("maps r to reject", () => {
    expect(resolveJobHotkey(event({ key: "r" }))).toBe("reject");
  });

  it("maps a to archive", () => {
    expect(resolveJobHotkey(event({ key: "a" }))).toBe("archive");
  });

  it("maps d to details", () => {
    expect(resolveJobHotkey(event({ key: "d" }))).toBe("details");
  });

  it("returns null for an unbound key", () => {
    expect(resolveJobHotkey(event({ key: "z" }))).toBeNull();
    expect(resolveJobHotkey(event({ key: "Enter" }))).toBeNull();
    expect(resolveJobHotkey(event({ key: "ArrowDown" }))).toBeNull();
  });

  it("does not treat inherited Object keys as hotkeys", () => {
    expect(resolveJobHotkey(event({ key: "constructor" }))).toBeNull();
    expect(resolveJobHotkey(event({ key: "toString" }))).toBeNull();
  });

  it("ignores the shifted form of a hotkey", () => {
    expect(resolveJobHotkey(event({ key: "R" }))).toBeNull();
  });

  it.each(["metaKey", "ctrlKey", "altKey"] as const)("bails when %s is held", (modifier) => {
    expect(resolveJobHotkey(event({ key: "r", [modifier]: true }))).toBeNull();
    expect(resolveJobHotkey(event({ key: "a", [modifier]: true }))).toBeNull();
    expect(resolveJobHotkey(event({ key: "d", [modifier]: true }))).toBeNull();
  });

  it("bails when the keystroke came from a text-entry target", () => {
    expect(resolveJobHotkey(event({ key: "r", fromTextEntry: true }))).toBeNull();
    expect(resolveJobHotkey(event({ key: "a", fromTextEntry: true }))).toBeNull();
    expect(resolveJobHotkey(event({ key: "d", fromTextEntry: true }))).toBeNull();
  });

  it("resolves every key advertised in the legend", () => {
    for (const hotkey of JOB_HOTKEYS) {
      expect(resolveJobHotkey(event({ key: hotkey.key }))).toBe(hotkey.action);
    }
  });
});
