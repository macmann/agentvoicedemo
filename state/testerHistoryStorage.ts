import { TesterTurnRecord } from "@/types/tester";

export const TESTER_HISTORY_STORAGE_KEY = "agentvoicedemo:tester-turn-history";
const MAX_STORED_TURNS = 250;

export function loadStoredTurns(): TesterTurnRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TESTER_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is TesterTurnRecord => Boolean(item?.id && item?.createdAt));
  } catch {
    return [];
  }
}

export function saveStoredTurns(turns: TesterTurnRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TESTER_HISTORY_STORAGE_KEY, JSON.stringify(turns.slice(-MAX_STORED_TURNS)));
}

export function clearStoredTurns() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TESTER_HISTORY_STORAGE_KEY);
}

