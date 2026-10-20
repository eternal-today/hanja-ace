/**
 * 에이스 시리즈 공통 별 지갑 — 규칙 문서(common/star-chance-rules.md) 1·2·4·8번
 * ※ src/ace 폴더는 허브·수학·한자·영어 네 저장소에 똑같이 들어 있음. 고치면 네 곳에 같이 복사.
 *
 * 네 앱이 같은 주소(eternal-today.github.io) 아래에 있어 기기 저장소를 함께 씀.
 *
 * 남은 별 = 수학 번 별 + 한자 번 별 + 영어 번 별 + 부모님이 준 별
 *         − 수학 기록 속 힌트 별 − 공통 장부의 힌트 별 − 쿠폰 가격(되돌린 쿠폰 제외)
 *  - 부모님이 준 별(용돈처럼)은 남은 별에만 더함. 축하·명예의 전당·뱃지(공부로 번 별)에는 넣지 않음
 *  - 번 별은 각 과목 기록에서 계산 (숫자를 따로 옮기지 않음)
 *  - 수학 소원 쿠폰(예전 것)은 선물로 받은 것이라 별에서 빼지 않음
 *  - 축하·명예의 전당은 "합산 번 별"(쓴 별을 빼지 않은 값) 기준
 */
import { useSyncExternalStore } from 'react';
import { Chance, TIER_BY_ID, Tier } from './chances';
import { prefsChanged } from './prefs';

// ─────────────────────────────────────────────
// 저장 키
// ─────────────────────────────────────────────
export const K = {
  ledger: 'ace_ledger',            // { [id]: LedgerEntry }  쓴 별(힌트), 부모님이 준 별
  coupons: 'ace_coupons',          // { [id]: Coupon }       찬스 쿠폰
  celebrated: 'ace_celebrated',    // number[]               축하를 마친 합산 번 별 (10의 배수)
  celInit: 'ace_cel_init',
  pin: 'ace_pin',
  cacheMath: 'ace_cache_math',     // 다른 기기에서 받은 수학 기록 요약
  cacheHanja: 'ace_cache_hanja',   // 다른 기기에서 받은 한자 기록 요약
  migratedHanja: 'ace_migrated_hanja_v1',
  cacheEnglish: 'ace_cache_english',   // 다른 기기에서 받은 영어 기록 요약
  migratedEnglish: 'ace_migrated_english_v1',
  englishGone: 'ace_english_deleted',  // { [ts]: 지운 시각 } 부모님이 지운 영어 기록 (다른 기기에도 지운 것으로 알림)
  dirty: 'ace_sync_dirty',         // { wallet: number[], hanja: number[], english: number[] } 아직 서버에 안 올린 것
};

/** 다른 앱이 쓰는 키 (대부분 읽기만) */
const MATH = { records: 'records', wish: 'wish_coupons', used: 'used_coupons', config: 'app_config', pin: 'parent_pin' };
const HANJA = { records: 'hanja_records', spends: 'hanja_spends', coupons: 'hanja_coupons', config: 'hanja_config', pin: 'hanja_parent_pin' };
const ENGLISH = { records: 'english_records', config: 'english_config', pin: 'english_parent_pin' };

const DAY = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────
export type Subject = 'math' | 'hanja' | 'english';

export interface LedgerEntry {
  id: number;
  kind: 'hint' | 'gift';   // gift: 부모님이 준 별 (빼면 음수)
  amount: number;
  subject: Subject;
  note: string;
  updatedAt: number;
}

export interface Coupon {
  id: number;
  chanceId: string;
  tier: Tier | 'legacy';     // legacy = 한자 에이스에서 예전 가격으로 산 쿠폰
  emoji: string;
  name: string;
  desc: string;
  price: number;
  boughtAt: number;
  usedAt?: number;
  canceledAt?: number;
  updatedAt: number;
}

export type CouponState = 'active' | 'used' | 'expired' | 'canceled';

export interface Summary {
  mathEarned: number;
  hanjaEarned: number;
  englishEarned: number;
  earned: number;        // 합산 번 별 (축하·명예의 전당 기준, 공부로 번 별만)
  gifted: number;        // 부모님이 준 별 (뺀 것 포함한 합계)
  spent: number;         // 쓴 별 전체
  balance: number;       // 남은 별
  hallCount: number;     // 명예의 전당 횟수 (100개마다)
  todayMath: number;     // 오늘 푼 문제 수
  todayHanja: number;
  todayEnglish: number;
}

// ─────────────────────────────────────────────
// 작은 도우미
// ─────────────────────────────────────────────
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function writeJSON(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { console.error('저장 실패', key, e); }
}
function startOfDay(t: number) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

let lastId = 0;
/** 기기 안에서 겹치지 않는 번호 (시각 기반) */
function newId(): number {
  const used = new Set<number>([
    ...Object.keys(readJSON<Record<string, unknown>>(K.ledger, {})).map(Number),
    ...Object.keys(readJSON<Record<string, unknown>>(K.coupons, {})).map(Number),
  ]);
  let id = Math.max(Date.now(), lastId + 1);
  while (used.has(id)) id++;
  lastId = id;
  return id;
}

// ─────────────────────────────────────────────
// 변경 알림 (화면이 다시 그려지도록)
// ─────────────────────────────────────────────
let version = 0;
const listeners = new Set<() => void>();
const changeHooks = new Set<() => void>();
/** 지갑이나 과목 기록이 바뀌었을 때 부름 → 화면 갱신 */
export function notifyWallet() {
  version++;
  listeners.forEach(fn => fn());
}
/** 지갑에서 올릴 것이 생겼을 때 (동기화 예약용) */
export function onWalletDirty(fn: () => void) { changeHooks.add(fn); return () => { changeHooks.delete(fn); }; }
function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
if (typeof window !== 'undefined') {
  // 같은 기기의 다른 탭(다른 에이스 앱)에서 바꾼 경우
  window.addEventListener('storage', e => { if (!e.key || e.key.startsWith('ace_') || e.key === MATH.records || e.key === HANJA.records || e.key === ENGLISH.records) notifyWallet(); });
}

/** 지갑 요약을 쓰는 화면용 훅 */
export function useWallet(): Summary {
  useSyncExternalStore(subscribe, () => version);
  return summary();
}

// ─────────────────────────────────────────────
// 동기화 대기열
// ─────────────────────────────────────────────
export type SyncProfile = 'wallet' | 'hanja' | 'english';
export function readDirty(): Record<SyncProfile, number[]> {
  const d = readJSON<Partial<Record<SyncProfile, number[]>>>(K.dirty, {});
  return { wallet: d.wallet || [], hanja: d.hanja || [], english: d.english || [] };
}
export function writeDirty(d: Record<SyncProfile, number[]>) { writeJSON(K.dirty, d); }
export function markDirty(p: SyncProfile, id: number) {
  const d = readDirty();
  if (!d[p].includes(id)) { d[p].push(id); writeDirty(d); }
  changeHooks.forEach(fn => fn());
}

// ─────────────────────────────────────────────
// 과목 기록 읽기 (이 기기 + 다른 기기에서 받은 것)
// ─────────────────────────────────────────────
interface MathRow { c: number; h: number; t: number; u: number }
interface HanjaRow { s: number; c: number; t: number; u: number }

function mathRows(): Map<number, MathRow> {
  const out = new Map<number, MathRow>();
  const cache = readJSON<Record<string, MathRow>>(K.cacheMath, {});
  for (const [k, v] of Object.entries(cache)) out.set(Number(k), v);
  const local = readJSON<Record<string, any>>(MATH.records, {});
  for (const r of Object.values(local)) {
    if (!r || typeof r.ts !== 'number' || r.kind === 'sheet') continue;
    const u = r.updatedAt || r.ts;
    const prev = out.get(r.ts);
    if (!prev || u >= prev.u) out.set(r.ts, { c: Number(r.correct) || 0, h: Number(r.hintStars) || 0, t: Number(r.total) || 0, u });
  }
  return out;
}

function hanjaRows(): Map<number, HanjaRow> {
  const out = new Map<number, HanjaRow>();
  const cache = readJSON<Record<string, HanjaRow>>(K.cacheHanja, {});
  for (const [k, v] of Object.entries(cache)) out.set(Number(k), v);
  const local = readJSON<any[]>(HANJA.records, []);
  for (const r of Array.isArray(local) ? local : []) {
    if (!r || typeof r.ts !== 'number') continue;
    out.set(r.ts, { s: Number(r.stars) || 0, c: Number(r.correct) || 0, t: Number(r.total) || 0, u: r.ts });
  }
  return out;
}

/** 영어 기록 (이 기기 + 다른 기기에서 받은 것). 부모님이 지운 기록은 뺌 */
interface EnglishRow { s: number; c: number; t: number; u: number; d?: boolean }
function englishGone(): Record<string, number> { return readJSON<Record<string, number>>(K.englishGone, {}); }
function englishRows(): Map<number, EnglishRow> {
  const out = new Map<number, EnglishRow>();
  const cache = readJSON<Record<string, EnglishRow>>(K.cacheEnglish, {});
  for (const [k, v] of Object.entries(cache)) if (!v.d) out.set(Number(k), v);
  const local = readJSON<any[]>(ENGLISH.records, []);
  for (const r of Array.isArray(local) ? local : []) {
    if (!r || typeof r.ts !== 'number') continue;
    out.set(r.ts, { s: Number(r.stars) || 0, c: Number(r.correct) || 0, t: Number(r.total) || 0, u: r.ts });
  }
  for (const ts of Object.keys(englishGone())) out.delete(Number(ts));
  return out;
}

export function ledger(): LedgerEntry[] {
  return Object.values(readJSON<Record<string, LedgerEntry>>(K.ledger, {})).sort((a, b) => b.id - a.id);
}
export function coupons(): Coupon[] {
  return Object.values(readJSON<Record<string, Coupon>>(K.coupons, {})).sort((a, b) => b.boughtAt - a.boughtAt);
}

// ─────────────────────────────────────────────
// 요약 계산
// ─────────────────────────────────────────────
export function summary(now = Date.now()): Summary {
  const today = startOfDay(now);
  let mathEarned = 0, mathHint = 0, todayMath = 0;
  for (const [ts, r] of mathRows()) {
    mathEarned += Math.floor(r.c / 5);
    mathHint += r.h;
    if (ts >= today) todayMath += r.t;
  }
  let hanjaEarned = 0, todayHanja = 0;
  for (const [ts, r] of hanjaRows()) {
    hanjaEarned += r.s;
    if (ts >= today) todayHanja += r.t;
  }
  const led = ledger();
  const ledgerHint = led.filter(e => e.kind !== 'gift').reduce((a, e) => a + (e.amount || 0), 0);
  const gifted = led.filter(e => e.kind === 'gift').reduce((a, e) => a + (e.amount || 0), 0);
  const couponSpent = coupons().filter(c => !c.canceledAt).reduce((a, c) => a + (c.price || 0), 0);
  let englishEarned = 0, todayEnglish = 0;
  for (const [ts, r] of englishRows()) {
    englishEarned += r.s;
    if (ts >= today) todayEnglish += r.t;
  }
  const earned = mathEarned + hanjaEarned + englishEarned;
  const spent = mathHint + ledgerHint + couponSpent;
  return {
    mathEarned, hanjaEarned, englishEarned, earned, gifted, spent,
    balance: Math.max(0, earned + gifted - spent),
    hallCount: Math.floor(earned / 100),
    todayMath, todayHanja, todayEnglish,
  };
}

/** 장부 화면용: 쓴 별 내역 (최근 것이 위) */
/** gift면 받은 별(+), 아니면 쓴 별(−) */
export interface SpendRow { at: number; label: string; amount: number; refunded?: boolean; gift?: boolean }
export function spendHistory(limit = 50): SpendRow[] {
  const rows: SpendRow[] = [];
  for (const e of ledger()) {
    if (e.kind === 'gift') rows.push({ at: e.id, label: `${e.amount >= 0 ? '🎁 부모님이 준 별' : '✏️ 부모님이 뺀 별'}${e.note ? ` (${e.note})` : ''}`, amount: e.amount, gift: true });
    else rows.push({ at: e.id, label: `💡 ${e.subject === 'math' ? '수학' : e.subject === 'english' ? '영어' : '한자'} 힌트${e.note ? ` (${e.note})` : ''}`, amount: e.amount });
  }
  for (const c of coupons()) rows.push({ at: c.boughtAt, label: `${c.emoji} ${c.name}`, amount: c.price, refunded: !!c.canceledAt });
  const local = readJSON<Record<string, any>>(MATH.records, {});
  const seen = new Set<number>();
  for (const r of Object.values(local)) {
    if (r && r.hintStars > 0) { rows.push({ at: r.ts, label: '💡 수학 힌트', amount: r.hintStars }); seen.add(r.ts); }
  }
  const cache = readJSON<Record<string, MathRow>>(K.cacheMath, {});
  for (const [k, v] of Object.entries(cache)) {
    if (v.h > 0 && !seen.has(Number(k))) rows.push({ at: Number(k), label: '💡 수학 힌트', amount: v.h });
  }
  return rows.sort((a, b) => b.at - a.at).slice(0, limit);
}

// ─────────────────────────────────────────────
// 힌트로 별 쓰기 (모든 과목 1개)
// ─────────────────────────────────────────────
export const HINT_COST = 1;

/** 공통 장부에 힌트 1회를 적음. 별이 모자라면 false */
export function spendHint(subject: Subject, note: string): boolean {
  if (summary().balance < HINT_COST) return false;
  const all = readJSON<Record<string, LedgerEntry>>(K.ledger, {});
  const id = newId();
  all[id] = { id, kind: 'hint', amount: HINT_COST, subject, note: note.slice(0, 40), updatedAt: Date.now() };
  writeJSON(K.ledger, all);
  markDirty('wallet', id);
  notifyWallet();
  return true;
}

/**
 * 부모님이 별 주기(용돈처럼) 또는 빼기(바로잡기). amount: 양수=주기, 음수=빼기.
 * 남은 별에만 반영되고 축하·명예의 전당·뱃지에는 들어가지 않음.
 */
export function giveStars(amount: number, note: string): boolean {
  const n = Math.trunc(amount);
  if (!n) return false;
  const all = readJSON<Record<string, LedgerEntry>>(K.ledger, {});
  const id = newId();
  all[id] = { id, kind: 'gift', amount: n, subject: 'hanja', note: note.trim().slice(0, 40), updatedAt: Date.now() };
  writeJSON(K.ledger, all);
  markDirty('wallet', id);
  notifyWallet();
  return true;
}

// ─────────────────────────────────────────────
// 찬스 쿠폰
// ─────────────────────────────────────────────
export function expiresAt(c: Coupon): number | null {
  if (c.tier === 'legacy') return null;
  const d = TIER_BY_ID[c.tier]?.expiryDays;
  return d ? c.boughtAt + d * DAY : null;
}
export function couponState(c: Coupon, now = Date.now()): CouponState {
  if (c.canceledAt) return 'canceled';
  if (c.usedAt) return 'used';
  const exp = expiresAt(c);
  if (exp !== null && now >= exp) return 'expired';
  return 'active';
}
/** 남은 날 (유효기간이 있는 쿠폰만). 산 직후 7, 마지막 24시간은 1 */
export function daysLeft(c: Coupon, now = Date.now()): number | null {
  const exp = expiresAt(c);
  if (exp === null) return null;
  return Math.max(0, Math.ceil((exp - now) / DAY));
}

/** 이번 주(일요일 0시 시작) 범위 */
export function weekRange(now = Date.now()): [number, number] {
  const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay());
  const end = new Date(d); end.setDate(d.getDate() + 7);
  return [d.getTime(), end.getTime()];
}
/** 이번 달 범위 */
export function monthRange(now = Date.now()): [number, number] {
  const d = new Date(now);
  return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()];
}

/** ok가 false면 reason: 별 부족(need개 더), 주·달 제한(until부터 다시) */
export interface BuyCheck { ok: boolean; reason?: 'stars' | 'week' | 'month'; need?: number; until?: number }

export function purchaseCheck(ch: Chance, now = Date.now(), s: Summary = summary(now)): BuyCheck {
  const tier = TIER_BY_ID[ch.tier];
  if (tier.limit) {
    const [from, to] = tier.limit === 'week' ? weekRange(now) : monthRange(now);
    const bought = coupons().some(c => c.tier === ch.tier && !c.canceledAt && c.boughtAt >= from && c.boughtAt < to);
    if (bought) return { ok: false, reason: tier.limit, until: to };
  }
  if (s.balance < tier.price) return { ok: false, reason: 'stars', need: tier.price - s.balance };
  return { ok: true };
}

export function buyChance(ch: Chance): Coupon | null {
  if (!purchaseCheck(ch).ok) return null;
  const tier = TIER_BY_ID[ch.tier];
  const all = readJSON<Record<string, Coupon>>(K.coupons, {});
  const id = newId();
  const c: Coupon = {
    id, chanceId: ch.id, tier: ch.tier, emoji: ch.emoji, name: ch.name, desc: ch.desc,
    price: tier.price, boughtAt: id, updatedAt: id,
  };
  all[id] = c;
  writeJSON(K.coupons, all);
  markDirty('wallet', id);
  notifyWallet();
  return c;
}

function patchCoupon(id: number, patch: Partial<Coupon>): boolean {
  const all = readJSON<Record<string, Coupon>>(K.coupons, {});
  const c = all[id];
  if (!c) return false;
  all[id] = { ...c, ...patch, updatedAt: Math.max(Date.now(), c.updatedAt + 1) };
  writeJSON(K.coupons, all);
  markDirty('wallet', id);
  notifyWallet();
  return true;
}
/** 쿠폰 사용 (부모 PIN 확인 뒤 부름) */
export function useCoupon(id: number): boolean {
  const c = coupons().find(x => x.id === id);
  if (!c || couponState(c) !== 'active') return false;
  return patchCoupon(id, { usedAt: Date.now() });
}
/** 잘못 산 쿠폰 되돌리기 — 별을 돌려주고 구매 제한 횟수에서도 빠짐 (쓰지 않은 쿠폰만) */
export function cancelCoupon(id: number): boolean {
  const c = coupons().find(x => x.id === id);
  if (!c || c.usedAt || c.canceledAt) return false;
  return patchCoupon(id, { canceledAt: Date.now() });
}

// ─────────────────────────────────────────────
// 수학 에이스의 예전 소원 쿠폰 (별 50·150·250…에서 받은 것)
// ─────────────────────────────────────────────
/**
 * 소원 쿠폰 발급을 멈춘 수학 에이스 배포 시각. 이보다 먼저 푼 기록으로 도달한 50·150·250… 쿠폰만 인정
 * (수학 에이스 sync.ts의 wishFreezeMax와 같은 기준 — 에이스 홈에서도 바로 맞게 보이도록 여기서 한 번 더 거름)
 */
const WISH_STOP_AT = Date.parse('2026-10-12T20:46:00+09:00');
function wishCap(): number {
  let before = 0;
  for (const [ts, r] of mathRows()) if (ts < WISH_STOP_AT) before += Math.floor(r.c / 5) - r.h;
  let max = 0;
  for (let m = 50; m <= before; m += 50) if (m % 100 !== 0) max = m;
  return max;
}
export function mathWishCoupons(): number[] {
  const cap = wishCap();
  return readJSON<number[]>(MATH.wish, []).filter(v => v <= cap).slice().sort((a, b) => a - b);
}
/** 소원 쿠폰 사용 — 수학 에이스와 같은 방식(사용 목록에 추가)이라 수학 동기화로 다른 기기에도 반영됨 */
export function useMathWish(value: number) {
  writeJSON(MATH.wish, mathWishCoupons().filter(v => v !== value));
  const used = readJSON<number[]>(MATH.used, []);
  if (!used.includes(value)) writeJSON(MATH.used, [...used, value].sort((a, b) => a - b));
  notifyWallet();
}

// ─────────────────────────────────────────────
// 축하와 명예의 전당 (합산 번 별 기준)
// ─────────────────────────────────────────────
export function celebrated(): number[] { return readJSON<number[]>(K.celebrated, []); }

/** 앱을 켤 때 한 번: 처음이면 지금까지의 마일스톤을 조용히 "축하 완료"로 (폭죽이 한꺼번에 터지지 않게) */
export function initCelebration() {
  if (localStorage.getItem(K.celInit)) return;
  const earned = summary().earned;
  const set = new Set(celebrated());
  for (let m = 10; m <= earned; m += 10) { if (!set.has(m)) { set.add(m); markDirty('wallet', m); } }
  writeJSON(K.celebrated, [...set].sort((a, b) => a - b));
  localStorage.setItem(K.celInit, '1');
}

export interface Celebration { value: number; hall: boolean }
/**
 * 판을 끝낸 뒤 부름: 새로 넘은 10의 배수가 있으면 축하 완료로 표시하고 가장 큰 것을 돌려줌.
 * 그 사이에 100의 배수가 있으면 명예의 전당.
 */
export function takeCelebration(): Celebration | null {
  initCelebration();
  const earned = summary().earned;
  const set = new Set(celebrated());
  const fresh: number[] = [];
  for (let m = 10; m <= earned; m += 10) if (!set.has(m)) { set.add(m); fresh.push(m); }
  if (!fresh.length) return null;
  writeJSON(K.celebrated, [...set].sort((a, b) => a - b));
  fresh.forEach(m => markDirty('wallet', m));
  notifyWallet();
  const halls = fresh.filter(m => m % 100 === 0);
  return halls.length ? { value: halls[halls.length - 1], hall: true } : { value: fresh[fresh.length - 1], hall: false };
}

// ─────────────────────────────────────────────
// 한자 에이스 첫날 데이터 옮기기 (한 번만, 다시 실행해도 같은 번호라 중복 없음)
// ─────────────────────────────────────────────
export function migrateHanjaLegacy() {
  if (localStorage.getItem(K.migratedHanja)) return;
  const spends = readJSON<any[]>(HANJA.spends, []);
  const oldCoupons = readJSON<any[]>(HANJA.coupons, []);
  const led = readJSON<Record<string, LedgerEntry>>(K.ledger, {});
  const cps = readJSON<Record<string, Coupon>>(K.coupons, {});
  // 힌트로 쓴 별 → 공통 장부 (찬스로 쓴 별은 아래 쿠폰 가격으로 계산되므로 옮기지 않음)
  for (const s of Array.isArray(spends) ? spends : []) {
    if (!s || s.kind !== 'hint' || !(s.amount > 0) || typeof s.ts !== 'number') continue;
    if (led[s.ts]) continue;
    led[s.ts] = { id: s.ts, kind: 'hint', amount: s.amount, subject: 'hanja', note: String(s.note || '').slice(0, 40), updatedAt: s.ts };
    markDirty('wallet', s.ts);
  }
  // 예전 가격으로 산 찬스 쿠폰 → 공통 쿠폰 (구매 제한·유효기간 없음)
  const used = new Set(Object.keys(cps).map(Number));
  for (const c of Array.isArray(oldCoupons) ? oldCoupons : []) {
    if (!c || typeof c.boughtAt !== 'number') continue;
    let id = c.boughtAt;
    const same = Object.values(cps).find(x => x.tier === 'legacy' && x.boughtAt === c.boughtAt && x.name === c.name);
    if (same) continue;
    while (used.has(id) || led[id]) id++;
    used.add(id);
    cps[id] = {
      id, chanceId: 'legacy', tier: 'legacy', emoji: c.emoji || '🎟️', name: c.name || '찬스', desc: c.desc || '',
      price: Number(c.price) || 0, boughtAt: c.boughtAt, updatedAt: c.usedAt || c.boughtAt,
      ...(c.usedAt ? { usedAt: c.usedAt } : {}),
    };
    markDirty('wallet', id);
  }
  // 지금까지의 한자 기록도 한 번 서버로 올림 (다른 기기에서 별을 계산할 수 있게)
  const recs = readJSON<any[]>(HANJA.records, []);
  for (const r of Array.isArray(recs) ? recs : []) if (r && typeof r.ts === 'number') markDirty('hanja', r.ts);
  writeJSON(K.ledger, led);
  writeJSON(K.coupons, cps);
  localStorage.setItem(K.migratedHanja, '1');
  notifyWallet();
}

// ─────────────────────────────────────────────
// 공통 정보 (1차: 각 앱 값을 빌려 씀)
// ─────────────────────────────────────────────
export function childName(): string {
  const m = readJSON<any>(MATH.config, {});
  const h = readJSON<any>(HANJA.config, {});
  const e = readJSON<any>(ENGLISH.config, {});
  return String(m?.childName || h?.childName || e?.childName || '').trim();
}
/** 허브 부모 PIN: 허브에서 정한 값 → 수학 PIN → 한자 PIN → 1234 */
/**
 * 에이스 홈 PIN — 별·쿠폰을 다루므로 과목 앱 PIN과 따로 둠 (기기 안에만 저장).
 * 아직 없으면 '' → 처음 열 때 과목 앱 PIN으로 부모님인지 확인한 뒤 새로 만듦.
 */
export function hubPin(): string {
  try { return localStorage.getItem(K.pin) || ''; } catch { return ''; }
}
export function setHubPin(pin: string) { localStorage.setItem(K.pin, pin); prefsChanged(); }
/** 과목 앱 PIN들 (수학, 한자, 영어. 바꾸지 않았으면 1234) */
export function subjectPins(): string[] {
  const get = (k: string) => { try { return localStorage.getItem(k) || '1234'; } catch { return '1234'; } };
  // 영어 PIN은 바꾼 경우에만 (영어 앱을 아직 안 쓴 기기에서 처음 PIN 1234가 다시 통하지 않게)
  let en = '';
  try { en = localStorage.getItem(ENGLISH.pin) || ''; } catch { /* 없음 */ }
  return [...new Set([get(MATH.pin), get(HANJA.pin), ...(en ? [en] : [])])];
}
/** 새 에이스 홈 PIN으로 쓸 수 있는지. 안 되면 이유 */
export function hubPinProblem(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'PIN은 숫자 4자리예요';
  if (pin === '1234') return '처음 PIN(1234)은 쓸 수 없어요';
  if (subjectPins().includes(pin)) return '수학·한자·영어 에이스 PIN과 다른 번호로 정해 주세요';
  return null;
}

// ─────────────────────────────────────────────
// 동기화용 변환 (aceSync.ts에서 사용)
// ─────────────────────────────────────────────
/** 대기열의 번호 → 서버로 보낼 기록 */
export function walletRecordFor(id: number): any | null {
  const led = readJSON<Record<string, LedgerEntry>>(K.ledger, {});
  if (led[id]) return { ...led[id], kind: led[id].kind === 'gift' ? 'gift' : 'hint', ts: id };
  const cps = readJSON<Record<string, Coupon>>(K.coupons, {});
  if (cps[id]) return { ...cps[id], kind: 'coupon', ts: id };
  if (celebrated().includes(id)) return { kind: 'cel', ts: id, updatedAt: id };
  return null;
}
export function walletUpdatedAt(id: number): number | null {
  const r = walletRecordFor(id);
  return r ? r.updatedAt : null;
}
export function hanjaRecordFor(ts: number): any | null {
  const local = readJSON<any[]>(HANJA.records, []);
  const r = Array.isArray(local) ? local.find(x => x && x.ts === ts) : null;
  return r ? { ...r, updatedAt: r.ts } : null;
}

/** 영어 기록 → 서버로 보낼 것 (별 계산에 필요한 것만. 지운 기록은 "지움" 표시로 덮어씀) */
export function englishRecordFor(ts: number): any | null {
  const gone = englishGone()[ts];
  if (gone) return { ts, deleted: true, stars: 0, correct: 0, total: 0, updatedAt: gone };
  const local = readJSON<any[]>(ENGLISH.records, []);
  const r = Array.isArray(local) ? local.find(x => x && x.ts === ts) : null;
  return r ? { ts: r.ts, date: r.date, menu: r.menu, stars: Number(r.stars) || 0, correct: Number(r.correct) || 0, total: Number(r.total) || 0, updatedAt: r.ts } : null;
}
export function applyServerEnglish(records: any[]) {
  if (!records.length) return;
  const cache = readJSON<Record<string, EnglishRow>>(K.cacheEnglish, {});
  for (const r of records) {
    if (!r || typeof r.ts !== 'number') continue;
    const u = Number(r.updatedAt) || r.ts;
    if (cache[r.ts] && cache[r.ts].u > u) continue;
    cache[r.ts] = r.deleted ? { s: 0, c: 0, t: 0, u, d: true } : { s: Number(r.stars) || 0, c: Number(r.correct) || 0, t: Number(r.total) || 0, u };
  }
  writeJSON(K.cacheEnglish, cache);
}
/** 영어 앱 처음 한 번: 지금까지의 영어 기록을 서버로 올림 (다른 기기에서 별을 계산할 수 있게) */
export function migrateEnglishRecords() {
  if (localStorage.getItem(K.migratedEnglish)) return;
  const recs = readJSON<any[]>(ENGLISH.records, []);
  for (const r of Array.isArray(recs) ? recs : []) if (r && typeof r.ts === 'number') markDirty('english', r.ts);
  localStorage.setItem(K.migratedEnglish, '1');
}
/** 영어 기록 지우기 (부모님 "기록 정리"): 이 기기에서 보이는 영어 기록 전부를 지운 것으로 표시하고 서버에도 알림 */
export function forgetEnglishRecords() {
  const gone = englishGone();
  const now = Date.now();
  const ids = new Set<number>(Object.keys(readJSON<Record<string, EnglishRow>>(K.cacheEnglish, {})).map(Number));
  for (const r of readJSON<any[]>(ENGLISH.records, [])) if (r && typeof r.ts === 'number') ids.add(r.ts);
  for (const ts of ids) if (!gone[ts]) { gone[ts] = now; markDirty('english', ts); }
  writeJSON(K.englishGone, gone);
  notifyWallet();
}

/** 서버에서 받은 지갑 기록 반영 (같은 번호는 나중에 고친 쪽이 이김, 축하는 합침) */
export function applyServerWallet(records: any[]) {
  if (!records.length) return;
  const led = readJSON<Record<string, LedgerEntry>>(K.ledger, {});
  const cps = readJSON<Record<string, Coupon>>(K.coupons, {});
  const cel = new Set(celebrated());
  for (const r of records) {
    if (!r || typeof r.ts !== 'number') continue;
    const u = Number(r.updatedAt) || r.ts;
    if (r.kind === 'hint' || r.kind === 'gift') {
      if (!led[r.ts] || u > led[r.ts].updatedAt) led[r.ts] = { id: r.ts, kind: r.kind, amount: Number(r.amount) || 0, subject: r.subject === 'math' ? 'math' : r.subject === 'english' ? 'english' : 'hanja', note: String(r.note || ''), updatedAt: u };
    } else if (r.kind === 'coupon') {
      if (!cps[r.ts] || u > cps[r.ts].updatedAt) {
        const { kind, ts, profileId, ...rest } = r;
        cps[r.ts] = { ...rest, id: r.ts, updatedAt: u } as Coupon;
      }
    } else if (r.kind === 'cel') {
      cel.add(r.ts);
    }
  }
  writeJSON(K.ledger, led);
  writeJSON(K.coupons, cps);
  writeJSON(K.celebrated, [...cel].sort((a, b) => a - b));
}
export function applyServerHanja(records: any[]) {
  if (!records.length) return;
  const cache = readJSON<Record<string, HanjaRow>>(K.cacheHanja, {});
  for (const r of records) {
    if (!r || typeof r.ts !== 'number') continue;
    cache[r.ts] = { s: Number(r.stars) || 0, c: Number(r.correct) || 0, t: Number(r.total) || 0, u: Number(r.updatedAt) || r.ts };
  }
  writeJSON(K.cacheHanja, cache);
}
export function applyServerMath(records: any[]) {
  if (!records.length) return;
  const cache = readJSON<Record<string, MathRow>>(K.cacheMath, {});
  for (const r of records) {
    if (!r || typeof r.ts !== 'number' || r.kind === 'sheet') continue;
    const u = Number(r.updatedAt) || r.ts;
    if (!cache[r.ts] || u >= cache[r.ts].u) cache[r.ts] = { c: Number(r.correct) || 0, h: Number(r.hintStars) || 0, t: Number(r.total) || 0, u };
  }
  writeJSON(K.cacheMath, cache);
}
