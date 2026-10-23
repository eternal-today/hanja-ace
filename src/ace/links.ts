/**
 * 에이스 시리즈 앱 주소
 * ※ src/ace 폴더는 허브·수학·한자·영어·생각 다섯 저장소에 똑같이 들어 있음. 고치면 다섯 곳에 같이 복사.
 * GitHub Pages에서는 지금 주소 기준, 내 컴퓨터에서 개발할 때는 실제 배포 주소로 보냄
 */
const ORIGIN = typeof location !== 'undefined' && location.hostname.endsWith('github.io')
  ? location.origin
  : 'https://eternal-today.github.io';

export const LINKS = {
  home: `${ORIGIN}/ace-home/`,
  math: `${ORIGIN}/math-worksheet-final/`,
  hanja: `${ORIGIN}/hanja-ace/`,
  english: `${ORIGIN}/english-ace/`,
  thinking: `${ORIGIN}/thinking-ace/`,
};

export type SubjectId = 'math' | 'hanja' | 'english' | 'thinking';

/** 과목 목록 — 새 과목을 만들면 여기에 한 줄 더함 (허브 카드, 앱 사이 이동 버튼에 쓰임) */
export const SUBJECTS: { id: SubjectId; name: string; href: string; mark: string; color: string }[] = [
  { id: 'math', name: '수학 에이스', href: LINKS.math, mark: '+', color: '#2452e9' },
  { id: 'hanja', name: '한자 에이스', href: LINKS.hanja, mark: '漢', color: '#6d3fe0' },
  { id: 'english', name: '영어 에이스', href: LINKS.english, mark: 'A', color: '#c3613a' },
  { id: 'thinking', name: '생각 에이스', href: LINKS.thinking, mark: '생', color: '#0e828a' },
];

/** 에이스 홈(허브)으로 이동. view: 'shop'(찬스 가게), 'coupons'(쿠폰함) */
export function goHome(view?: 'shop' | 'coupons') {
  location.href = LINKS.home + (view ? `#${view}` : '');
}
