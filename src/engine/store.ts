/**
 * 저장소 — 기기의 localStorage가 1차 저장소.
 * 수학 에이스와 같은 주소(GitHub Pages)에서 돌면 브라우저 저장소를 함께 쓰므로
 * 모든 이름 앞에 'hanja_'를 붙여 서로 덮어쓰지 않게 함.
 *
 * 별은 "장부" 방식:
 *   번 별 = 학습 기록의 별을 모두 더한 값 (5문제 맞힐 때마다 1개)
 *   쓴 별 = 힌트·찬스에 쓴 내역을 모두 더한 값
 *   남은 별 = 번 별 − 쓴 별
 * 뱃지와 축하는 "번 별" 기준이라, 별을 써도 사라지지 않음.
 */
import { useSyncExternalStore } from 'react';
import { Card, Chance, Config, Coupon, RoundRecord, Spend } from '../types';
import { GROUPS } from '../data';
import { markDirty, notifyWallet, spendHint, summary, takeCelebration } from '../ace/wallet';

const P = 'hanja_';
const K = {
  config: P + 'config', cards: P + 'cards', records: P + 'records', spends: P + 'spends',
  coupons: P + 'coupons', celebrated: P + 'celebrated', confusions: P + 'confusions', pin: P + 'parent_pin',
};

export const DEFAULT_CHANCES: Chance[] = [
  { id: 'c01', emoji: '🛝', name: '놀이터 찬스', desc: '놀이터에서 30분 더 놀기', price: 30, on: true },
  { id: 'c02', emoji: '📖', name: '한 권 더 찬스', desc: '자기 전에 책 한 권 더 읽어 주기', price: 30, on: true },
  { id: 'c03', emoji: '🍪', name: '간식 찬스', desc: '오늘 간식을 내가 고르기', price: 30, on: true },
  { id: 'c04', emoji: '🦒', name: '목말 찬스', desc: '아빠 목말이나 업어 주기', price: 30, on: true },
  { id: 'c05', emoji: '🍽️', name: '메뉴 찬스', desc: '저녁 메뉴를 내가 정하기', price: 30, on: true },
  { id: 'c06', emoji: '🏪', name: '편의점 찬스', desc: '3,000원 안에서 직접 고르기', price: 50, on: true },
  { id: 'c07', emoji: '🛍️', name: '다이소 찬스', desc: '3,000원 안에서 직접 고르기', price: 50, on: true },
  { id: 'c08', emoji: '🍦', name: '아이스크림 찬스', desc: '아이스크림 가게 가기', price: 50, on: true },
  { id: 'c09', emoji: '🎲', name: '보드게임 찬스', desc: '내가 고른 게임을 가족과 한 판', price: 50, on: true },
  { id: 'c10', emoji: '🌙', name: '늦잠 찬스', desc: '평소보다 30분 늦게 자기', price: 50, on: true },
  { id: 'c11', emoji: '🎠', name: '키즈카페 찬스', desc: '주말에 키즈카페 가기', price: 100, on: true },
  { id: 'c12', emoji: '📚', name: '서점 찬스', desc: '서점에서 책 한 권 고르기', price: 100, on: true },
  { id: 'c13', emoji: '🚗', name: '나들이 찬스', desc: '주말에 갈 곳을 내가 정하기', price: 100, on: true },
  { id: 'c14', emoji: '💜', name: '단둘이 찬스', desc: '엄마나 아빠와 단둘이 데이트', price: 100, on: true },
  { id: 'c15', emoji: '🛠️', name: '만들어 줘 찬스', desc: '내가 원하는 게임이나 기능을 아빠가 만들어 주기', price: 100, on: true },
];

export const BADGES = [
  { id: 'b10', need: 10, iconName: 'Sprout', name: '새싹 한자꾼' },
  { id: 'b30', need: 30, iconName: 'Star', name: '별 수집가' },
  { id: 'b60', need: 60, iconName: 'Flame', name: '한자 불꽃' },
  { id: 'b100', need: 100, iconName: 'Gem', name: '다이아 두뇌' },
  { id: 'b200', need: 200, iconName: 'Trophy', name: '한자 챔피언' },
];

export const MIN_COUNT = 5;
export const MAX_COUNT = 30;

function defaultConfig(): Config {
  // Gemini 키는 같은 기기의 수학 에이스에 넣어 둔 값이 있으면 그대로 가져다 씀 (읽기만 함)
  let key = '';
  try {
    key = localStorage.getItem('gemini_key') || JSON.parse(localStorage.getItem('app_config') || '{}').geminiKey || '';
  } catch { /* 없음 */ }
  return {
    groupIds: GROUPS.filter(g => g.stage === '8급').map(g => g.id).concat(['7급-1']),
    modes: { hun: true, word: true, listen: true, write: true, order: true }, orderOff: [],
    count: 10, difficulty: 2, newPerRound: 3, hintCost: 1,
    childName: '', geminiKey: key, chances: DEFAULT_CHANCES,
  };
}

export interface State {
  config: Config;
  cards: Record<string, Card>;
  records: RoundRecord[];           // 최근 것이 앞
  spends: Spend[];
  coupons: Coupon[];
  celebrated: number[];             // 축하를 마친 "번 별" 마일스톤
  confusions: Record<string, number>; // "정답>고른답" → 횟수
  pin: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function load(): State {
  const def = defaultConfig();
  const saved = read<Partial<Config>>(K.config, {});
  const config: Config = { ...def, ...saved, modes: { ...def.modes, ...(saved.modes || {}) } };
  config.count = Math.min(MAX_COUNT, Math.max(MIN_COUNT, config.count || 10));
  if (!Array.isArray(config.chances) || !config.chances.length) config.chances = DEFAULT_CHANCES;
  const known = new Set(GROUPS.map(g => g.id));
  config.groupIds = (config.groupIds || []).filter(id => known.has(id));
  if (!Array.isArray(config.orderOff)) config.orderOff = [];
  return {
    config,
    cards: read(K.cards, {}),
    records: read<RoundRecord[]>(K.records, []),
    spends: read<Spend[]>(K.spends, []),
    coupons: read<Coupon[]>(K.coupons, []),
    celebrated: read<number[]>(K.celebrated, []),
    confusions: read(K.confusions, {}),
    pin: localStorage.getItem(K.pin) || '1234',
  };
}

let state: State = load();
const listeners = new Set<() => void>();

function commit(patch: Partial<State>) {
  state = { ...state, ...patch };
  try {
    if (patch.config) localStorage.setItem(K.config, JSON.stringify(state.config));
    if (patch.cards) localStorage.setItem(K.cards, JSON.stringify(state.cards));
    if (patch.records) localStorage.setItem(K.records, JSON.stringify(state.records));
    if (patch.spends) localStorage.setItem(K.spends, JSON.stringify(state.spends));
    if (patch.coupons) localStorage.setItem(K.coupons, JSON.stringify(state.coupons));
    if (patch.celebrated) localStorage.setItem(K.celebrated, JSON.stringify(state.celebrated));
    if (patch.confusions) localStorage.setItem(K.confusions, JSON.stringify(state.confusions));
    if (patch.pin) localStorage.setItem(K.pin, state.pin);
  } catch (e) { console.error('저장 실패', e); }
  listeners.forEach(fn => fn());
}

export const getState = () => state;
export function useStore(): State {
  return useSyncExternalStore(
    fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => state,
  );
}

// ── 별 장부 ──
/** 한자에서 번 별 (한자 뱃지 기준) */
export const earnedStars = (s: State) => s.records.reduce((a, r) => a + (r.stars || 0), 0);
/** 쓴 별·남은 별은 수학과 함께 쓰는 에이스 지갑에서 계산 (src/ace/wallet.ts) */
export const spentStars = (_s?: State) => summary().spent;
export const balanceOf = (_s?: State) => summary().balance;

/** 판을 끝낸 뒤 띄울 축하: 합산 별 10개마다(100개마다 명예의 전당), 한자 뱃지 */
export interface Milestone { value: number; hall: boolean; badge: string | null }
export const earnedBadgeIds = (s: State) => { const e = earnedStars(s); return BADGES.filter(b => e >= b.need).map(b => b.id); };

// ── 바꾸는 동작 ──
export const actions = {
  saveConfig(config: Config) {
    commit({ config: { ...config, count: Math.min(MAX_COUNT, Math.max(MIN_COUNT, config.count)) } });
  },
  setPin(pin: string) { commit({ pin }); },
  setCards(cards: Record<string, Card>) { commit({ cards }); },
  addConfusion(answer: string, chosen: string) {
    const key = `${answer}>${chosen}`;
    commit({ confusions: { ...state.confusions, [key]: (state.confusions[key] || 0) + 1 } });
  },
  /**
   * 한 판 끝: 기록 저장 + 서버로 올릴 대기열에 넣음.
   * 축하는 수학과 합친 "번 별" 기준(에이스 지갑), 뱃지는 한자에서 번 별 기준.
   * 기록은 지우지 않음(별 계산에 쓰임). 오래된 판은 문제별 내용만 비워 저장 공간을 아낌.
   */
  addRecord(rec: RoundRecord): Milestone | null {
    const before = earnedStars(state);
    const records = [rec, ...state.records].map((r, i) => (i >= 300 && r.items?.length ? { ...r, items: [] } : r));
    commit({ records });
    markDirty('hanja', rec.ts);
    notifyWallet();
    const after = earnedStars(state);
    const badge = BADGES.find(b => before < b.need && after >= b.need) || null;
    const cel = takeCelebration();
    if (!cel && !badge) return null;
    return { value: cel?.value ?? 0, hall: !!cel?.hall, badge: badge ? badge.name : null };
  },
  /** 힌트에 별 쓰기 (에이스 지갑 공통 장부, 1회 1개). 남은 별이 모자라면 false */
  spendHint(note: string): boolean {
    return spendHint('hanja', note);
  },
  /** 부모가 "이 묶음은 이미 알아요"로 표시 → 4번 칸에서 시작 */
  markKnown(chars: string[], today: number, interval: number) {
    const cards = { ...state.cards };
    for (const c of chars) {
      const cur = cards[c];
      if (!cur || cur.box < 4) cards[c] = { box: 4, due: today + interval, seen: cur?.seen || 0, wrong: cur?.wrong || 0, last: Date.now() };
    }
    commit({ cards });
  },
  resetCards(chars: string[]) {
    const cards = { ...state.cards };
    for (const c of chars) delete cards[c];
    commit({ cards });
  },
};
