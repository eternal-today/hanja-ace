/**
 * 찬스 목록과 단계 — 규칙 문서(common/star-chance-rules.md) 4·5번
 * ※ src/ace 폴더는 허브·수학·한자·영어·생각 다섯 저장소에 똑같이 들어 있음. 고치면 다섯 곳에 같이 복사.
 */

export type Tier = 'light' | 'mid' | 'big' | 'special';

export interface TierInfo {
  id: Tier;
  name: string;
  price: number;
  /** 구매 제한: 주(일요일 시작) 1개, 달 1개, 없음 */
  limit: 'week' | 'month' | null;
  /** 유효기간(일). 없으면 null */
  expiryDays: number | null;
}

export const TIERS: TierInfo[] = [
  { id: 'light', name: '가벼운 찬스', price: 30, limit: null, expiryDays: 7 },
  { id: 'mid', name: '중간 찬스', price: 60, limit: 'week', expiryDays: null },
  { id: 'big', name: '큰 찬스', price: 150, limit: 'month', expiryDays: null },
  { id: 'special', name: '특별 찬스', price: 300, limit: null, expiryDays: null },
];
export const TIER_BY_ID: Record<Tier, TierInfo> = Object.fromEntries(TIERS.map(t => [t.id, t])) as Record<Tier, TierInfo>;

export interface Chance {
  id: string;
  tier: Tier;
  emoji: string;
  name: string;
  desc: string;
}

export const CHANCES: Chance[] = [
  // 가벼운 찬스 (30개)
  { id: 'l-book', tier: 'light', emoji: '📖', name: '한 권 더', desc: '자기 전에 책 한 권 더 읽어 주기' },
  { id: 'l-bath', tier: 'light', emoji: '🛁', name: '목욕놀이', desc: '목욕놀이하기' },
  { id: 'l-menu', tier: 'light', emoji: '🍽️', name: '메뉴', desc: '저녁 메뉴를 내가 정하기' },
  { id: 'l-snack', tier: 'light', emoji: '🍪', name: '간식', desc: '내일 간식 고르기' },
  { id: 'l-play', tier: 'light', emoji: '🛝', name: '놀이터', desc: '놀이터에서 30분 더 놀기' },
  { id: 'l-train', tier: 'light', emoji: '🚂', name: '기차공원', desc: '기차공원 가기' },
  { id: 'l-library', tier: 'light', emoji: '📚', name: '도서관', desc: '도서관 가서 책 고르기' },
  // 중간 찬스 (60개)
  { id: 'm-tablet', tier: 'mid', emoji: '📱', name: '태블릿', desc: '태블릿 30분 더 하기' },
  { id: 'm-video', tier: 'mid', emoji: '📺', name: '영상', desc: '오늘 영상 시청 30분 더 하기' },
  { id: 'm-korean', tier: 'mid', emoji: '🗣️', name: '한국어 영상', desc: '영어 영상을 한국어로 보기' },
  { id: 'm-cook', tier: 'mid', emoji: '🧑‍🍳', name: '같이 요리', desc: '쿠키, 팬케이크, 피자 등 같이 만들기' },
  { id: 'm-bakery', tier: 'mid', emoji: '🥐', name: '빵집', desc: '빵집에서 하나 고르기' },
  { id: 'm-mart', tier: 'mid', emoji: '🛒', name: '장보기 대장', desc: '마트에서 1만 원 안에서 하나 고르기' },
  { id: 'm-legoroom', tier: 'mid', emoji: '🧱', name: '레고방', desc: '레고방 가기' },
  { id: 'm-friend', tier: 'mid', emoji: '👫', name: '친구 초대', desc: '친구를 집에 초대하기' },
  // 큰 찬스 (150개)
  { id: 'b-store', tier: 'big', emoji: '🏪', name: '편의점·다이소', desc: '편의점이나 다이소에 가서 1만 원 안에서 고르기' },
  { id: 'b-eatout', tier: 'big', emoji: '🍕', name: '외식·배달', desc: '외식할 식당이나 배달 메뉴를 내가 정하기' },
  { id: 'b-bookstore', tier: 'big', emoji: '📗', name: '서점', desc: '서점에서 책 한 권 고르기' },
  { id: 'b-kidscafe', tier: 'big', emoji: '🎠', name: '키즈카페', desc: '키즈카페 가기' },
  { id: 'b-museum', tier: 'big', emoji: '🔬', name: '체험관', desc: '과학관, 박물관, 수학체험관 등 가기' },
  // 특별 찬스 (300개)
  { id: 's-lego', tier: 'special', emoji: '🏗️', name: '레고', desc: '레고 사기 (금액은 부모님이 정해요)' },
  { id: 's-park', tier: 'special', emoji: '🎡', name: '놀이공원', desc: '놀이공원이나 동물원, 아쿠아리움 가기' },
  { id: 's-water', tier: 'special', emoji: '🏊', name: '물놀이', desc: '수영장이나 물놀이장 가기' },
];
