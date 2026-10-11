/**
 * 출제기 — 수학 에이스의 "유형별 생성기" 구조를 본뜸.
 *  planRound : 이번 판에 어떤 글자를 낼지 고름 (새 글자 + 복습 차례 + 채우기)
 *  makeQuestion : 글자 하나를 문제 하나로 만듦 (유형별)
 * 정답 판정은 전부 데이터로 함 (AI가 끼지 않음).
 */
import { Card, Config, Option, QType, Question, RoundKind, Word } from '../types';
import { GROUP_BY_ID, HANJA, WORDS, WORDS_BY_CHAR, charsOfStage, hunEum } from '../data';
import { LOOKALIKE } from '../data/lookalike';
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

/**
 * 틀린 보기 글자 고르기.
 *  쉬움: 아무 글자 / 보통: 비슷한 글자 2개 + 아무 글자 / 어려움: 전부 비슷한 글자
 */
function distractorChars(c: string, ctx: MakeCtx, n: number): string[] {
  const diff = ctx.config.difficulty;
  const label = hunEum(c);
  const out: string[] = [];
  const labels = new Set<string>([label]);
  const take = (list: string[], limit = n) => {
    for (const x of list) {
      if (out.length >= limit) return;
      if (x === c || out.includes(x) || labels.has(hunEum(x))) continue;
      out.push(x); labels.add(hunEum(x));
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

/** 이 글자로 낼 문제 유형 고르기 */
export function chooseType(c: string, kind: RoundKind, ctx: MakeCtx, firstMeet: boolean): QType {
  const hasWord = freshWords(c, ctx).length > 0;
  if (kind === 'check') return 'hun';
  if (kind === 'hun') return Math.random() < 0.5 ? 'hun' : 'pick';
  if (kind === 'listen') return canSpeak() ? 'listen' : 'pick';
  if (kind === 'word') return hasWord ? 'word' : 'hun';
  if (firstMeet) return 'hun';
  const m = ctx.config.modes;
  const bag: QType[] = [];
  if (m.hun) bag.push('hun', 'hun', 'pick', 'pick');
  if (m.word && hasWord) bag.push('word', 'word', 'word', 'word');
  if (m.listen && canSpeak()) bag.push('listen', 'listen');
  return bag.length ? pickOne(bag) : 'hun';
}

/**
 * 이 글자의 다음 문제. 한 판 안에서 같은 문제(같은 낱말, 같은 유형의 같은 글자)는 다시 내지 않음.
 * 낼 수 있는 새 문제가 없으면 null (그 자리는 건너뜀).
 */
export function nextQuestion(c: string, kind: RoundKind, ctx: MakeCtx, firstMeet: boolean): Question | null {
  const m = ctx.config.modes;
  const speak = canSpeak();
  const pool: QType[] = kind === 'check' ? ['hun']
    : kind === 'hun' ? ['hun', 'pick']
      : kind === 'listen' ? (speak ? ['listen', 'pick', 'hun'] : ['pick', 'hun'])
        : kind === 'word' ? ['word', 'hun', 'pick']
          : [...(m.word ? ['word'] : []), ...(m.hun ? ['hun', 'pick'] : []), ...(m.listen && speak ? ['listen'] : []), 'hun', 'pick'] as QType[];
  const first = chooseType(c, kind, ctx, firstMeet);
  const order = [first, ...shuffle([...new Set(pool)].filter(t => t !== first))];
  for (const t of order) {
    if (t === 'word') {
      if (!freshWords(c, ctx).length) continue;
    } else if (ctx.used.has(`${t}:${c}`)) continue;
    const q = makeQuestion(c, t, ctx, firstMeet);
    ctx.used.add(`${q.type}:${q.c}`);
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

  const wrong = distractorChars(c, ctx, nWrong);
  if (type === 'hun') {
    const options: Option[] = shuffle([c, ...wrong]).map(x => ({ key: x, label: hunEum(x), isHanja: false }));
    return { type, c, options, answer: c, isNew };
  }
  // pick / listen: 훈음을 보거나 듣고 한자를 고름
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
  return [`모두 ${h.strokes}획으로 쓰는 글자야`, themed ? `‘${group.name}’ 묶음에서 배운 글자야` : `${h.level} 글자야`];
}

/** 문제를 글로 적은 것 (기록용) */
export function questionText(q: Question): string {
  if (q.type === 'word' && q.word) return `${q.word.w} 읽기`;
  if (q.type === 'hun') return `${q.c} 훈음`;
  return `${hunEum(q.c)} → 한자`;
}
export function answerText(q: Question): string {
  if (q.type === 'word' && q.word) return q.word.r;
  if (q.type === 'hun') return hunEum(q.c);
  return q.c;
}
