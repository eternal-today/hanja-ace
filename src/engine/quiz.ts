/**
 * 출제기 — 수학 에이스의 "유형별 생성기" 구조를 본뜸.
 *  planRound : 이번 판에 어떤 글자를 낼지 고름 (새 글자 + 복습 차례 + 채우기)
 *  makeQuestion : 글자 하나를 문제 하나로 만듦 (유형별)
 * 정답 판정은 전부 데이터로 함 (AI가 끼지 않음).
 */
import { Card, Config, Option, QType, Question, RoundKind, Word } from '../types';
import { GROUP_BY_ID, HANJA, WORDS, WORDS_BY_CHAR, charsOfStage, hunEum } from '../data';
import { LOOKALIKE } from '../data/lookalike';
import { ORDER_CHARS, ordinal } from '../data/strokeChars';
import { dayIndex } from './srs';

export const ri = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = ri(0, i);[a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const pickOne = <T,>(arr: T[]) => arr[ri(0, arr.length - 1)];

/** 문제에 나오는 글자 범위 = 부모가 고른 묶음의 글자 (묶음 순서대로) */
export function poolChars(config: Config): string[] {
  return config.groupIds.map(id => GROUP_BY_ID[id]).filter(Boolean)
    .sort((a, b) => orderOf(a.id) - orderOf(b.id)).flatMap(g => g.chars);
}
const GROUP_ORDER = Object.keys(GROUP_BY_ID);
const orderOf = (id: string) => GROUP_ORDER.indexOf(id);

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** 낱말 문제에 쓸 수 있는 낱말: 들어간 글자가 전부 "범위 안이거나 이미 만난 글자"인 것 */
export function wordsFor(c: string, allowed: Set<string>): Word[] {
  return (WORDS_BY_CHAR[c] || []).filter(w => Array.from(w.w).every(ch => allowed.has(ch)));
}

export interface RoundPlan { targets: string[]; newChars: string[]; dueCount: number }

/** 홈 화면 안내용: 지금 복습 차례인 글자 수와 아직 못 만난 글자 수 */
export function poolStatus(config: Config, cards: Record<string, Card>) {
  const pool = poolChars(config);
  const today = dayIndex();
  return {
    total: pool.length,
    due: pool.filter(c => cards[c] && cards[c].due <= today).length,
    unseen: pool.filter(c => !cards[c]).length,
  };
}

export function planRound(config: Config, cards: Record<string, Card>, kind: RoundKind): RoundPlan {
  const today = dayIndex();

  // 실력 확인: 8급 가운데 아직 못 만난 글자를 한 번씩
  if (kind === 'check') {
    const unseen = shuffle(charsOfStage('8급').filter(c => !cards[c]));
    return { targets: unseen, newChars: [], dueCount: 0 };
  }

  let pool = poolChars(config);
  // 낱말에는 이미 만난 글자와 이번 판에 새로 나올 글자만 들어가게 함
  const upcoming = pool.filter(c => !cards[c]).slice(0, config.newPerRound);
  const allowed = new Set([...Object.keys(cards), ...upcoming]);
  if (kind === 'word') pool = pool.filter(c => wordsFor(c, allowed).length > 0);
  if (kind === 'order') pool = pool.filter(c => canOrder(c, config));
  if (!pool.length) return { targets: [], newChars: [], dueCount: 0 };

  const seen = pool.filter(c => cards[c]);
  const unseen = pool.filter(c => !cards[c]);
  const due = shuffle(seen.filter(c => cards[c].due <= today))
    .sort((a, b) => cards[a].box - cards[b].box || cards[b].wrong - cards[a].wrong);

  // 새 글자: 묶음 순서대로. 한 판에서 두 번씩 만나게 함 (처음에 한 번, 뒤에서 한 번 더)
  // 낼 수 있는 글자가 적으면 판도 짧게 함: 한 판에서 같은 글자는 두 번까지만.
  // (글자 서너 개만 되풀이해 풀어 별을 모으는 일을 막음)
  const usable = seen.length + Math.min(unseen.length, config.newPerRound);
  if (!usable) return { targets: [], newChars: [], dueCount: 0 };
  const count = Math.min(config.count, usable * 2);
  const nNew = Math.min(unseen.length, config.newPerRound, Math.ceil(count / 2));
  const newChars = unseen.slice(0, nNew);
  const targets: string[] = [...newChars];
  if (targets.length + newChars.length <= count) targets.push(...newChars);

  for (const c of due) { if (targets.length >= count) break; targets.push(c); }
  // 복습 차례가 아닌 글자로 채움 (자주 틀린 글자부터)
  const rest = shuffle(seen.filter(c => cards[c].due > today)).sort((a, b) => cards[b].wrong - cards[a].wrong);
  for (const c of rest) { if (targets.length >= count) break; targets.push(c); }
  // 그래도 모자라면 같은 글자를 한 번씩 더 (글자마다 두 번까지)
  const again = shuffle([...new Set(targets)].filter(c => targets.filter(x => x === c).length < 2));
  for (const c of again) { if (targets.length >= count) break; targets.push(c); }

  // 섞되, 새 글자의 첫 등장은 앞쪽에 두고 같은 글자가 붙어 나오지 않게 함
  const head = shuffle(newChars);
  const tailSrc = [...targets];
  for (const c of head) tailSrc.splice(tailSrc.indexOf(c), 1);
  const ordered = [...head, ...shuffle(tailSrc)];
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i] !== ordered[i - 1]) continue;
    const j = ordered.findIndex((c, k) => k > i && c !== ordered[i] && ordered[k - 1] !== ordered[i] && (k + 1 >= ordered.length || ordered[k + 1] !== ordered[i]));
    if (j > 0) [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }
  return { targets: ordered, newChars, dueCount: due.length };
}

// ── 보기 만들기 ──
/**
 * 헷갈리기 쉬운 글자를 헷갈리는 순서대로:
 * 모양이 비슷한 글자 → 음이 같은 글자 → 같은 묶음(주제)의 글자 → 부수가 같은 글자
 */
function similarChars(c: string, from: string[]): string[] {
  const h = HANJA[c];
  const has = new Set(from);
  const look = (LOOKALIKE[c] || []).filter(x => has.has(x));
  const sameEum = from.filter(x => HANJA[x].eum === h.eum);
  const sameGroup = from.filter(x => HANJA[x].groupId === h.groupId);
  const sameRad = from.filter(x => HANJA[x].radical === h.radical);
  return [...new Set([...shuffle(look), ...shuffle(sameEum), ...shuffle(sameGroup), ...shuffle(sameRad)])].filter(x => x !== c);
}

/** 훈이 겹치는 글자인지 (마을 村·里, 날 日·生·出, 집 家·室, 말씀 語·話 …) */
const hunsOf = (c: string) => {
  const h = HANJA[c];
  return new Set([h.hun, h.std, ...h.hunFull.split('·')].filter(Boolean));
};
export function sameHun(a: string, b: string): boolean {
  const A = hunsOf(a);
  for (const x of hunsOf(b)) if (A.has(x)) return true;
  return false;
}
/** 대표 음과 다른 음 (金 금·김, 車 거·차) */
const eumsOf = (c: string) => {
  const h = HANJA[c];
  return h.alt ? [h.eum, h.alt.split(' ').pop()!] : [h.eum];
};

/** 보기의 모양: 훈음(hun) · 한자(pick, listen) · 음(eum) */
type OptKind = 'hun' | 'pick' | 'eum';

/**
 * 틀린 보기 글자 고르기.
 *  쉬움: 아무 글자 / 보통: 비슷한 글자 2개 + 아무 글자 / 어려움: 전부 비슷한 글자
 *  pick(훈만 보고 고르기): 훈이 같은 글자는 넣지 않음 — 넣으면 답이 둘이 됨
 *  eum(음만 고르기): 음이 같은 글자는 넣지 않음
 */
function distractorChars(c: string, ctx: MakeCtx, n: number, kind: OptKind = 'hun'): string[] {
  const diff = ctx.config.difficulty;
  const labelOf = (x: string) => (kind === 'eum' ? HANJA[x].eum : hunEum(x));
  const out: string[] = [];
  const labels = new Set<string>(kind === 'eum' ? eumsOf(c) : [labelOf(c)]);
  const ok = (x: string) => {
    if (x === c || out.includes(x) || labels.has(labelOf(x))) return false;
    if (kind === 'pick' && [c, ...out].some(y => sameHun(x, y))) return false;
    return true;
  };
  const take = (list: string[], limit = n) => {
    for (const x of list) {
      if (out.length >= limit) return;
      if (!ok(x)) continue;
      out.push(x); labels.add(labelOf(x));
    }
  };
  if (diff >= 2) {
    const want = diff === 3 ? n : Math.min(2, n);
    take(similarChars(c, ctx.candidates), want);   // 먼저 이미 만난 글자에서
    take(similarChars(c, ctx.wide), want);         // 모자라면 범위 안 글자까지
  }
  take(shuffle(ctx.candidates));
  // 범위가 아주 좁을 때는 같은 단계의 다른 글자에서 빌려 옴
  if (out.length < n) take(shuffle(charsOfStage(HANJA[c].stage)));
  return out;
}

// ── 훈음 쓰기 조각 ──
const CHO_N = 19, JUNG_N = 21, JONG_N = 28;
const split3 = (ch: string) => {
  const k = ch.charCodeAt(0) - 0xac00;
  if (k < 0 || k > 11171) return null;
  return [Math.floor(k / (JUNG_N * JONG_N)), Math.floor((k % (JUNG_N * JONG_N)) / JONG_N), k % JONG_N];
};
const join3 = (a: number, b: number, c: number) => String.fromCharCode(0xac00 + (a * JUNG_N + b) * JONG_N + c);
/** 헷갈리기 쉬운 모음: ㅢ→ㅣ(흰/힌), ㅐ↔ㅔ, ㅒ↔ㅖ, ㅚ→ㅙ·ㅞ, ㅖ→ㅔ */
const JUNG_TRAP: Record<number, number[]> = { 19: [20], 1: [5], 5: [1], 3: [7], 7: [5, 3], 11: [10, 15], 10: [11], 15: [11] };
/** 드문 받침 → 흔한 받침 (녘/녁, 밖/박, 밭/밧, 앞/압, 꽃/꼿 …), 겹받침 → 홑받침 */
const JONG_TRAP: Record<number, number[]> = {
  24: [1], 2: [1], 25: [19], 23: [19], 22: [19], 27: [19], 20: [19], 26: [17],
  9: [8, 1], 10: [8, 16], 11: [8], 13: [8], 15: [8], 5: [4], 6: [4], 3: [1], 18: [17],
};
/** 두음: 본음이 ㄹ·ㄴ인 음 (륙→육, 녀→여, 리→이, 로→노) */
function dueumTrap(ch: string): string | null {
  const j = split3(ch);
  if (!j) return null;
  const [a, b, c] = j;
  const yi = [2, 3, 6, 7, 12, 17, 20].includes(b);   // ㅑㅒㅕㅖㅛㅠㅣ
  if (a === 5) return join3(yi ? 11 : 2, b, c);
  if (a === 2 && yi) return join3(11, b, c);
  return null;
}
function spellingTraps(syls: string[], eumAt: number): string[] {
  const out: string[] = [];
  syls.forEach((ch, i) => {
    const j = split3(ch);
    if (!j) return;
    const [a, b, c] = j;
    for (const v of JUNG_TRAP[b] || []) out.push(join3(a, v, c));
    for (const v of JONG_TRAP[c] || []) out.push(join3(a, b, v));
    if (i === eumAt) { const d = dueumTrap(ch); if (d) out.push(d); }
  });
  return out;
}

/**
 * 낱말 독음의 틀린 보기.
 *  보통 이상: 진짜 있는 낱말 가운데 한 음절이 겹치는 것(주소 ↔ 주민, 장소)을 먼저 씀.
 *            문장만 보고 "말이 되는 것"을 고르는 식으로는 맞히기 어렵게 함.
 */
function readingDistractors(word: Word, ctx: MakeCtx, n: number): string[] {
  const ans = word.r;
  const syl = Array.from(ans);
  const out: string[] = [];
  const add = (r: string) => { if (r !== ans && !out.includes(r) && out.length < n) out.push(r); };

  if (ctx.config.difficulty >= 2) {
    const wide = new Set(ctx.wide);
    const real = WORDS.filter(w => w.w !== word.w && w.r !== ans && Array.from(w.r).length === syl.length
      && Array.from(w.w).every(ch => wide.has(ch)));
    // 같은 자리에 같은 음절 → 다른 자리에 같은 음절 → 같은 한자가 들어간 낱말
    const samePos = real.filter(w => Array.from(w.r).some((x, i) => x === syl[i]));
    const anyPos = real.filter(w => Array.from(w.r).some(x => syl.includes(x)));
    const sameChar = real.filter(w => Array.from(w.w).some(ch => word.w.includes(ch)));
    for (const w of [...shuffle(samePos), ...shuffle(sameChar), ...shuffle(anyPos)]) add(w.r);
  }
  // 두 글자 낱말은 순서를 뒤집은 것
  if (syl.length === 2 && syl[0] !== syl[1] && out.length < n && Math.random() < 0.5) add(syl[1] + syl[0]);
  // 모자라면 한 음절을 다른 글자의 음으로 바꾼 것
  const eums = shuffle([...new Set(ctx.candidates.map(c => HANJA[c].eum))]);
  let guard = 0;
  while (out.length < n && guard++ < 80 && eums.length) {
    const pos = ri(0, syl.length - 1);
    const e = eums[guard % eums.length];
    if (e === syl[pos]) continue;
    const alt = [...syl]; alt[pos] = e;
    add(alt.join(''));
  }
  return out;
}

export interface MakeCtx {
  config: Config;
  candidates: string[];     // 보기로 쓸 수 있는 글자 (이미 만난 글자)
  wide: string[];           // 비슷한 보기를 찾을 때만 쓰는 넓은 범위 (만난 글자 + 고른 묶음)
  allowed: Set<string>;     // 낱말에 들어가도 되는 글자
  usedWords: Set<string>;   // 이번 판에 이미 낸 낱말
  used: Set<string>;        // 이번 판에 이미 낸 문제 (유형:글자)
}

const freshWords = (c: string, ctx: MakeCtx) => wordsFor(c, ctx.allowed).filter(w => !ctx.usedWords.has(w.w));

/** 필순 문제를 낼 수 있는 글자인지 (한국 필순과 같다고 본 글자 가운데 부모가 빼지 않은 것, 3획 이상) */
export function canOrder(c: string, config: Config): boolean {
  return ORDER_CHARS.has(c) && !(config.orderOff || []).includes(c) && HANJA[c].strokes >= 3;
}

/** 이 글자로 낼 문제 유형 고르기 */
export function chooseType(c: string, kind: RoundKind, ctx: MakeCtx, firstMeet: boolean): QType {
  const hasWord = freshWords(c, ctx).length > 0;
  const order = canOrder(c, ctx.config);
  if (kind === 'check') return 'hun';
  if (kind === 'hun') return pickOne<QType>(['hun', 'hun', 'pick', 'pick', 'eum']);
  if (kind === 'listen') return canSpeak() ? 'listen' : 'pick';
  if (kind === 'word') return hasWord ? 'word' : 'hun';
  if (kind === 'write') return 'write';   // 새 글자도 바로 조립 (카드를 막 보고 왔으므로)
  if (kind === 'order') return order ? 'order' : 'hun';
  if (firstMeet) return 'hun';
  const m = ctx.config.modes;
  const bag: QType[] = [];
  if (m.hun) bag.push('hun', 'hun', 'pick', 'pick', 'eum');
  if (m.word && hasWord) bag.push('word', 'word', 'word', 'word');
  if (m.listen && canSpeak()) bag.push('listen', 'listen');
  if (m.write) bag.push('write', 'write');
  if (m.order && order) bag.push('order');
  return bag.length ? pickOne(bag) : 'hun';
}

/**
 * 이 글자의 다음 문제. 한 판 안에서 같은 문제(같은 낱말, 같은 유형의 같은 글자)는 다시 내지 않음.
 * 낼 수 있는 새 문제가 없으면 null (그 자리는 건너뜀).
 */
export function nextQuestion(c: string, kind: RoundKind, ctx: MakeCtx, firstMeet: boolean): Question | null {
  const m = ctx.config.modes;
  const speak = canSpeak();
  const order = canOrder(c, ctx.config);
  const pool: QType[] = kind === 'check' ? ['hun']
    : kind === 'hun' ? ['hun', 'pick', 'eum']
      : kind === 'listen' ? (speak ? ['listen', 'pick', 'hun'] : ['pick', 'hun'])
        : kind === 'word' ? ['word', 'hun', 'pick']
          : kind === 'write' ? ['write']
            : kind === 'order' ? ['order']
              : [...(m.word ? ['word'] : []), ...(m.hun ? ['hun', 'pick', 'eum'] : []), ...(m.listen && speak ? ['listen'] : []),
                ...(m.write ? ['write'] : []), ...(m.order && order ? ['order'] : []), 'hun', 'pick'] as QType[];
  const first = chooseType(c, kind, ctx, firstMeet);
  const order0 = [first, ...shuffle([...new Set(pool)].filter(t => t !== first))];
  for (const t of order0) {
    if (t === 'word') {
      if (!freshWords(c, ctx).length) continue;
    } else if (t === 'order' && !order) continue;
    // 훈음 쓰기·필순 놀이에서는 같은 글자가 두 번 나오면 두 번 다 그 유형으로 (필순은 다른 획, 조각은 새로 섞음)
    const twice = (kind === 'write' && t === 'write') || (kind === 'order' && t === 'order');
    const key = `${t}:${c}`;
    if (t !== 'word' && ctx.used.has(key) && !(twice && !ctx.used.has(key + '#2'))) continue;
    const q = makeQuestion(c, t, ctx, firstMeet);
    ctx.used.add(ctx.used.has(key) ? key + '#2' : key);
    return q;
  }
  return null;
}

export function makeQuestion(c: string, type: QType, ctx: MakeCtx, isNew = false): Question {
  const diff = ctx.config.difficulty;
  const nWrong = diff === 1 ? 2 : 3;
  const hard = diff === 3;

  if (type === 'word') {
    const fresh = freshWords(c, ctx);   // 이번 판에 아직 안 낸 낱말만
    const word = fresh.length ? pickOne(fresh) : undefined;
    if (word) {
      ctx.usedWords.add(word.w);
      if (hard) {
        // 어려움: 음절 조각을 조립해 답을 만듦. 틀린 조각도 비슷한 낱말에서 가져옴
        const need = Array.from(word.r);
        const fromWords = readingDistractors(word, ctx, 4).flatMap(r => Array.from(r)).filter(e => !need.includes(e));
        const extra = [...new Set(fromWords)].slice(0, 3);
        return { type, c, options: [], answer: word.r, word, assemble: true, tiles: shuffle([...need, ...extra]), isNew };
      }
      const wrong = readingDistractors(word, ctx, nWrong);
      const options: Option[] = shuffle([word.r, ...wrong]).map(r => ({ key: r, label: r, isHanja: false }));
      return { type, c, options, answer: word.r, word, isNew };
    }
    type = 'hun';
  }

  if (type === 'order') {
    // 진하게 칠할 획: 4획 이상이면 첫 획은 빼고 고름. 보기는 정답 둘레의 이어진 순서 3~4개
    const n = HANJA[c].strokes;
    const ans = ri(n >= 4 ? 1 : 0, n - 1);
    const k = Math.min(n, nWrong + 1);
    const start = Math.max(0, Math.min(n - k, ans - ri(0, k - 1)));
    const options: Option[] = Array.from({ length: k }, (_, i) => ({ key: String(start + i + 1), label: ordinal(start + i + 1), isHanja: false }));
    return { type, c, options, answer: String(ans + 1), stroke: ans, isNew };
  }

  if (type === 'write') {
    // 시험의 훈음 쓰기: 표준 훈 + 음을 조각으로 만듦. 틀린 조각은 철자 함정과 헷갈리는 글자의 훈음에서
    const h = HANJA[c];
    const hun = h.std || h.hun;
    const need = [...Array.from(hun), h.eum];
    const has = new Set(need);
    const extraN = Math.max(2, Math.min(diff + 1, 8 - need.length));
    const extra: string[] = [];
    const add = (x: string) => { if (x && !has.has(x) && !extra.includes(x) && extra.length < extraN) extra.push(x); };
    const traps = shuffle(spellingTraps(need, need.length - 1));
    const look = similarChars(c, ctx.wide).slice(0, 4).flatMap(x => [...Array.from(HANJA[x].std || HANJA[x].hun), HANJA[x].eum]);
    // 쉬움은 함정 1개, 보통·어려움은 함정을 먼저 채움
    traps.slice(0, diff === 1 ? 1 : extraN).forEach(add);
    shuffle(look).forEach(add);
    shuffle(ctx.candidates).flatMap(x => [HANJA[x].eum, ...Array.from(HANJA[x].hun)]).forEach(add);
    const accept = h.alt ? [h.alt.replace(' ', '')] : undefined;
    return { type, c, options: [], answer: hun + h.eum, assemble: true, tiles: shuffle([...need, ...extra]), split: Array.from(hun).length, accept, isNew };
  }

  if (type === 'eum') {
    const wrong = distractorChars(c, ctx, nWrong, 'eum');
    const options: Option[] = shuffle([c, ...wrong]).map(x => ({ key: HANJA[x].eum, label: HANJA[x].eum, isHanja: false }));
    return { type, c, options, answer: HANJA[c].eum, isNew };
  }

  const wrong = distractorChars(c, ctx, nWrong, type === 'hun' ? 'hun' : 'pick');
  if (type === 'hun') {
    const options: Option[] = shuffle([c, ...wrong]).map(x => ({ key: x, label: hunEum(x), isHanja: false }));
    return { type, c, options, answer: c, isNew };
  }
  // pick: 훈만 보고 / listen: 훈음을 듣고 한자를 고름
  const options: Option[] = shuffle([c, ...wrong]).map(x => ({ key: x, label: x, isHanja: true }));
  return { type, c, options, answer: c, isNew };
}

// ── 힌트 ──
const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
export function chosung(s: string): string {
  return Array.from(s).map(ch => {
    const code = ch.charCodeAt(0) - 0xac00;
    return code >= 0 && code <= 11171 ? CHO[Math.floor(code / 588)] : ch;
  }).join('');
}

/** 판마다 주는 기본 힌트 수: 10문제 2개, 20문제 3개, 30문제 4개. 어려운 판은 1개 더 */
export function freeHints(count: number, hard: boolean): number {
  return 1 + Math.ceil(count / 10) + (hard ? 1 : 0);
}

/** 규칙으로 만드는 힌트 (즉시, 틀릴 일이 없음). 답은 아이 몫으로 남김 */
export function hintLines(q: Question, allowed: Set<string>): string[] {
  const h = HANJA[q.c];
  const group = GROUP_BY_ID[h.groupId];
  if (q.type === 'word' && q.word) {
    return [`첫소리는 「${chosung(q.word.r)}」야`, `뜻: ${q.word.gloss}`];
  }
  if (q.type === 'hun') {
    const w = wordsFor(q.c, allowed)[0];
    const themed = group && (group.stage === '8급' || group.stage === '7급');
    const lines = [themed ? `‘${group.name}’ 묶음에서 배운 글자야` : `${h.level} 글자야`];
    if (w) lines.push(`「${w.w}」에 들어가. 뜻은 ‘${w.gloss}’`);
    else lines.push(`소리는 「${chosung(h.eum)}」으로 시작해`);
    return lines;
  }
  const themed = group && (group.stage === '8급' || group.stage === '7급');
  const where = themed ? `‘${group.name}’ 묶음에서 배운 글자야` : `${h.level} 글자야`;
  if (q.type === 'eum') return [`뜻은 ‘${h.hun}’이야`, where];
  if (q.type === 'write') return [`첫소리는 「${chosung(h.std || h.hun)} ${chosung(h.eum)}」야`, where];
  if (q.type === 'order') return [`모두 ${h.strokes}획이야`, '위에서 아래로, 왼쪽에서 오른쪽으로 써 나가요'];
  return [`모두 ${h.strokes}획으로 쓰는 글자야`, themed ? `‘${group.name}’ 묶음에서 배운 글자야` : `${h.level} 글자야`];
}

/** 시험 답안 기준 훈음 ("계집 녀") */
export const examHunEum = (c: string) => `${HANJA[c].std || HANJA[c].hun} ${HANJA[c].eum}`;

/** 문제를 글로 적은 것 (기록용) */
export function questionText(q: Question): string {
  if (q.type === 'word' && q.word) return `${q.word.w} 읽기`;
  if (q.type === 'hun') return `${q.c} 훈음`;
  if (q.type === 'eum') return `${q.c} 음`;
  if (q.type === 'write') return `${q.c} 훈음 쓰기`;
  if (q.type === 'order') return `${q.c} 필순`;
  if (q.type === 'pick') return `${HANJA[q.c].hun} → 한자`;
  return `${hunEum(q.c)} → 한자`;
}
export function answerText(q: Question): string {
  if (q.type === 'word' && q.word) return q.word.r;
  if (q.type === 'hun') return hunEum(q.c);
  if (q.type === 'eum') return HANJA[q.c].eum;
  if (q.type === 'write') return examHunEum(q.c);
  if (q.type === 'order') return ordinal(Number(q.answer));
  return q.c;
}
/** 아이가 낸 답을 기록에 적을 모양으로 */
export function shownAnswer(q: Question, value: string): string {
  if (q.type === 'hun') return HANJA[value] ? hunEum(value) : value;
  if (q.type === 'order') return ordinal(Number(value));
  if (q.type === 'write' && q.split) { const a = Array.from(value); return `${a.slice(0, q.split).join('')} ${a.slice(q.split).join('')}`; }
  return value;
}
/** 정답인지 (다른 훈음도 인정) */
export const isRight = (q: Question, value: string) => value === q.answer || !!q.accept?.includes(value);
