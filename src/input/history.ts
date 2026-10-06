// Session input history (47-UI-SPEC "History (INP history)", 47-CONTEXT "Input history").
// Keeps the last 50 sent lines, newest first. The first Up saves the draft; Down past the newest
// restores it. Plain TypeScript, no Vue.

export const HISTORY_LIMIT = 50;

export interface InputHistory {
  /** Stores a sent line and resets the recall cursor. */
  record(text: string): void;
  /** Steps to an older line; null when there is nothing older. */
  up(draft: string): string | null;
  /** Steps to a newer line, then the saved draft; null when not recalling. */
  down(): string | null;
  resetCursor(): void;
  /** Stored lines, newest first. */
  entries(): readonly string[];
}

export function createInputHistory(limit: number = HISTORY_LIMIT): InputHistory {
  const lines: string[] = [];
  let cursor = -1;
  let savedDraft = '';

  return {
    record(text: string): void {
      cursor = -1;
      const trimmed = text.trim();
      if (trimmed === '') return;
      if (lines.length > 0 && lines[0].trim() === trimmed) return;
      lines.unshift(text);
      if (lines.length > limit) lines.length = limit;
    },
    up(draft: string): string | null {
      if (lines.length === 0) return null;
      if (cursor === -1) savedDraft = draft;
      if (cursor + 1 >= lines.length) return null;
      cursor += 1;
      return lines[cursor];
    },
    down(): string | null {
      if (cursor === -1) return null;
      if (cursor === 0) {
        cursor = -1;
        return savedDraft;
      }
      cursor -= 1;
      return lines[cursor];
    },
    resetCursor(): void {
      cursor = -1;
    },
    entries(): readonly string[] {
      return lines;
    },
  };
}
