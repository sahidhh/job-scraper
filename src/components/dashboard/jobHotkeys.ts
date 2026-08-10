// Keyboard shortcuts for the dashboard's job table.
//
// The decision "should this keystroke fire, and which action does it mean" is
// deliberately a pure function with no DOM types in its input, so it can be
// unit-tested in the plain node environment the rest of the suite runs in.
// `JobsTable` owns the single window listener and adapts the real
// KeyboardEvent into `JobHotkeyEvent` before asking.

export type JobHotkeyAction = "reject" | "archive" | "details";

export interface JobHotkeyEvent {
  /** `KeyboardEvent.key`, matched case-sensitively so Shift+R is not a hotkey. */
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  /** True when the keystroke came from a control that owns text input itself. */
  fromTextEntry: boolean;
}

/**
 * The shortcut table. It is the single source of truth for both
 * `resolveJobHotkey` and the legend rendered above the table, so the two can
 * never drift.
 */
export const JOB_HOTKEYS: readonly {
  readonly key: string;
  readonly action: JobHotkeyAction;
  readonly label: string;
}[] = [
  { key: "r", action: "reject", label: "not interested" },
  { key: "a", action: "archive", label: "archive" },
  { key: "d", action: "details", label: "details" },
];

const ACTION_BY_KEY: ReadonlyMap<string, JobHotkeyAction> = new Map(
  JOB_HOTKEYS.map((hotkey) => [hotkey.key, hotkey.action]),
);

/**
 * Decide which row action a keystroke means, or `null` for "leave this key
 * alone". Bails on any modifier combination (those belong to the browser and
 * the OS) and on keystrokes originating inside a control that consumes text.
 */
export function resolveJobHotkey(event: JobHotkeyEvent): JobHotkeyAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.fromTextEntry) return null;
  return ACTION_BY_KEY.get(event.key) ?? null;
}

// Text entry in the literal sense (input/textarea/select/contenteditable),
// plus the Radix widgets that run their own typeahead or trap the keyboard --
// an open status combobox or a draft dialog must keep every letter key it is
// given.
const TEXT_ENTRY_SELECTOR =
  'input, textarea, select, [contenteditable], [role="combobox"], [role="listbox"], [role="menu"], [role="dialog"]';

/** DOM adapter for `JobHotkeyEvent.fromTextEntry`. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof Element)) return false;
  return target.closest(TEXT_ENTRY_SELECTOR) !== null;
}
