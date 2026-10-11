/**
 * 풀던 판 자동 저장 — 앱이 닫히거나 새로고침돼도 멈춘 문제부터 이어서 풀 수 있게 함.
 * 문제를 하나 풀 때마다 저장하고, 판이 끝나면 지움.
 */
import { Question, RoundItem, RoundKind } from '../types';
import { Tone } from './srs';

export interface SavedRound {
  ts: number;
  kind: RoundKind;
  questions: Question[];
  newChars: string[];
  dueCount: number;
  allowed: string[];
  tonesBefore: Record<string, Tone>;
  free: number;          // 이 판의 기본 힌트 수
  items: RoundItem[];    // 지금까지 푼 문제
  freeUsed: number;
  paidUsed: number;
  combo: number;
  maxCombo: number;
}

const KEY = 'hanja_resume';
const KEEP_MS = 48 * 60 * 60 * 1000;   // 이틀이 지난 판은 버림

export function saveRound(r: SavedRound) {
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* 저장 공간 부족 등은 무시 */ }
}
export function clearRound() {
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
}
export function loadRound(): SavedRound | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as SavedRound;
    const ok = r && Array.isArray(r.questions) && r.questions.length > 0 && Array.isArray(r.items)
      && r.items.length < r.questions.length && Date.now() - r.ts < KEEP_MS;
    if (!ok) { clearRound(); return null; }
    return r;
  } catch { clearRound(); return null; }
}
