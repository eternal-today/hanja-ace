import { RAW_HANJA, RAW_GROUPS } from './hanjaData';
import { RAW_WORDS } from './wordData';
import { Group, Hanja, Word } from '../types';

/** 학습 단계. 7급Ⅱ와 7급의 새 글자 100자는 교재처럼 '7급' 한 단계로 묶음 */
export const STAGES = ['8급', '7급', '6급Ⅱ', '6급', '5급Ⅱ', '5급', '4급Ⅱ', '4급'];
export const LEVEL_ORDER = ['8급', '7급Ⅱ', '7급', '6급Ⅱ', '6급', '5급Ⅱ', '5급', '4급Ⅱ', '4급'];
export const stageOfLevel = (level: string) => (level === '7급Ⅱ' ? '7급' : level);

export const GROUPS: Group[] = RAW_GROUPS.map(g => ({ id: g.id, stage: g.stage, name: g.name, chars: Array.from(g.chars) }));
export const GROUP_BY_ID: Record<string, Group> = Object.fromEntries(GROUPS.map(g => [g.id, g]));

const groupOfChar: Record<string, string> = {};
for (const g of GROUPS) for (const c of g.chars) groupOfChar[c] = g.id;

/**
 * 쉬운 훈 — 어문회 표준 훈이 옛말이라 아이에게 어려운 글자는 쉬운 말로 보여 줌.
 * 표준 훈은 새 글자 카드, 정답 확인, 도감에서 함께 보여 줌 (시험 답안은 표준 훈이 기준).
 * 고치려면 이 표만 바꾸면 됨. 지우면 표준 훈으로 돌아감.
 */
export const EASY_HUN: Record<string, string> = {
  '女': '여자', '山': '산', '父': '아버지', '母': '어머니', '祖': '할아버지',
  '夫': '남편', '市': '시장', '世': '세상', '文': '글', '同': '같을',
};

export const HANJA: Record<string, Hanja> = {};
for (const [c, hun, eum, level, radical, strokes, hunFull, alt] of RAW_HANJA) {
  const easy = EASY_HUN[c];
  HANJA[c] = { c, hun: easy || hun, std: easy ? hun : '', eum, level, stage: stageOfLevel(level), radical, strokes, hunFull, alt, groupId: groupOfChar[c] };
}

/** 묶음 순서대로 늘어놓은 전체 글자 */
export const ALL_CHARS: string[] = GROUPS.flatMap(g => g.chars);
export const charsOfStage = (stage: string) => GROUPS.filter(g => g.stage === stage).flatMap(g => g.chars);

export const WORDS: Word[] = RAW_WORDS.map(([w, r, gloss, sent, level]) => ({ w, r, gloss, sent, level }));
export const WORDS_BY_CHAR: Record<string, Word[]> = {};
for (const wd of WORDS) {
  for (const c of new Set(Array.from(wd.w))) (WORDS_BY_CHAR[c] ||= []).push(wd);
}

/** 낱말 데이터가 준비된 단계 (낱말 읽기 문제를 낼 수 있는 단계) */
export const STAGES_WITH_WORDS = new Set(WORDS.map(w => stageOfLevel(w.level)));

/** "하늘 천" 형태의 훈음 */
/** 쉬운 말로 바꾼 글자의 표준 훈음 ("계집 녀"). 바꾸지 않은 글자는 '' */
export const stdHunEum = (c: string) => (HANJA[c]?.std ? `${HANJA[c].std} ${HANJA[c].eum}` : '');
export const hunEum = (c: string) => (HANJA[c] ? `${HANJA[c].hun} ${HANJA[c].eum}` : c);
