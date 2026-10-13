export interface Hanja {
  c: string;        // 글자
  hun: string;      // 화면에 쓰는 훈 (쉬운 말이 있으면 쉬운 말)
  std: string;      // 어문회 표준 훈 (쉬운 말로 바꾼 글자만, 아니면 '')
  eum: string;      // 대표 음
  level: string;    // 어문회 급수 (8급, 7급Ⅱ, 7급 …)
  stage: string;    // 학습 단계 (7급Ⅱ·7급은 '7급' 한 단계로 묶음)
  radical: string;  // 부수
  strokes: number;  // 총획
  hunFull: string;  // 훈이 여럿일 때 전체 (없으면 '')
  alt: string;      // 다른 훈음 (없으면 '')
  groupId: string;  // 속한 묶음
}

export interface Word {
  w: string;      // 낱말 (한자)
  r: string;      // 독음
  gloss: string;  // 뜻풀이
  sent: string;   // 예문 (낱말이 한자로 들어 있음)
  level: string;  // 들어간 글자 중 가장 높은 급수
}

export interface Group {
  id: string;
  stage: string;
  name: string;
  chars: string[];
}

/** 복습 상자 속 글자 한 장 */
export interface Card {
  box: number;    // 1~5
  due: number;    // 다시 나올 날 (날짜 번호)
  seen: number;   // 푼 횟수
  wrong: number;  // 틀린 횟수
  last: number;   // 마지막으로 푼 시각(ms)
}

/**
 * hun 한자 → 훈음 고르기 / pick 훈만 보고 한자 고르기 / eum 한자 → 음만 고르기
 * write 훈음 조각 조립(시험의 훈음 쓰기) / order 진한 획이 몇 번째 획인지 / listen 듣고 한자 고르기 / word 낱말 읽기
 */
export type QType = 'hun' | 'pick' | 'eum' | 'write' | 'order' | 'listen' | 'word';
export type RoundKind = 'daily' | 'hun' | 'word' | 'listen' | 'write' | 'order' | 'check';

export interface Option { key: string; label: string; isHanja: boolean }

export interface Question {
  type: QType;
  c: string;              // 이 문제로 익히는 글자
  options: Option[];      // 보기 (조립형이면 빈 배열)
  answer: string;         // 정답 key
  word?: Word;            // 낱말 문제일 때
  assemble?: boolean;     // 음절 조립형
  tiles?: string[];       // 조립형 음절 조각
  split?: number;         // 훈음 조립: 앞에서 몇 칸이 훈인지 (그 뒤에 한 칸 띄움)
  accept?: string[];      // 정답으로 함께 인정하는 답 (다른 훈음)
  stroke?: number;        // 필순: 진하게 보여 줄 획 (0부터)
  isNew?: boolean;        // 이번 판에 처음 만나는 글자
}

export interface RoundItem {
  c: string; type: QType; q: string; ans: string; val: string; ok: boolean; hint: boolean;
}

export interface RoundRecord {
  ts: number;
  date: string;
  kind: RoundKind;
  correct: number;
  total: number;
  stars: number;        // 이 판에서 번 별
  lowAcc?: boolean;     // 정답이 40%보다 적어 별을 받지 못한 판
  hintsFree: number;
  hintsPaid: number;
  groupNames: string[];
  items: RoundItem[];
}

export interface Spend { ts: number; kind: 'hint' | 'chance'; amount: number; note: string }

export interface Chance {
  id: string; emoji: string; name: string; desc: string; price: number; on: boolean;
}

export interface Coupon {
  id: string; emoji: string; name: string; desc: string; price: number; boughtAt: number; usedAt?: number;
}

export interface Config {
  groupIds: string[];                 // 문제에 나오는 묶음
  modes: { hun: boolean; word: boolean; listen: boolean; write: boolean; order: boolean };
  orderOff: string[];                 // 필순 문제에서 뺀 글자 (부모가 교재와 비교해 고름)
  count: number;                      // 한 판의 문제 수
  difficulty: number;                 // 1 쉬움, 2 보통, 3 어려움
  newPerRound: number;                // 한 판에 새로 내놓는 글자 수
  hintCost: number;                   // 기본 힌트를 다 쓴 뒤 힌트 한 번에 드는 별
  childName: string;
  geminiKey: string;
  chances: Chance[];
}
