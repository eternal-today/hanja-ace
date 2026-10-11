import { Card } from '../types';

/** 상자 칸별로 다시 나오는 간격(일). 1번 칸은 매 판. */
export const INTERVALS = [0, 0, 1, 3, 7, 14];
export const MAX_BOX = 5;

/** 오늘의 날짜 번호 (기기 시간 기준, 자정에 바뀜) */
export function dayIndex(ts = Date.now()): number {
  const d = new Date(ts);
  return Math.floor((ts - d.getTimezoneOffset() * 60000) / 86400000);
}

export type Tone = 'none' | 'grey' | 'color' | 'gold';
/** 도감 카드 색: 아직 못 만남 → 없음, 1~2번 칸 → 회색, 3~4번 칸 → 색, 5번 칸 → 금테 */
export function toneOf(card?: Card): Tone {
  if (!card) return 'none';
  if (card.box >= MAX_BOX) return 'gold';
  if (card.box >= 3) return 'color';
  return 'grey';
}

export const isDue = (card: Card, today = dayIndex()) => card.due <= today;

/**
 * 답한 결과를 상자에 반영.
 *  - 틀림: 1번 칸으로
 *  - 힌트 없이 맞힘: 복습 차례였다면 한 칸 위로 (차례가 아니면 그대로)
 *  - 힌트 보고 맞힘: 칸은 그대로
 *  - 실력 확인(check)에서 맞힘: 이미 아는 글자로 보고 4번 칸에서 시작
 */
export function applyAnswer(card: Card | undefined, ok: boolean, hinted: boolean, isCheck = false): Card {
  const today = dayIndex();
  const now = Date.now();
  const base: Card = card ? { ...card } : { box: 1, due: today, seen: 0, wrong: 0, last: 0 };
  base.seen += 1;
  base.last = now;
  if (!ok) {
    base.box = 1; base.due = today; base.wrong += 1;
    return base;
  }
  if (isCheck) {
    if (!card || card.box < 4) { base.box = 4; base.due = today + INTERVALS[4]; }
    return base;
  }
  if (hinted) return base;
  if (!card) { base.box = 2; base.due = today + INTERVALS[2]; return base; }
  if (card.due <= today) {
    base.box = Math.min(MAX_BOX, card.box + 1);
    base.due = today + INTERVALS[base.box];
  }
  return base;
}
