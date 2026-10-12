/**
 * 에이스 시리즈 앱 주소
 * GitHub Pages에서는 지금 주소 기준, 내 컴퓨터에서 개발할 때는 실제 배포 주소로 보냄
 */
const ORIGIN = typeof location !== 'undefined' && location.hostname.endsWith('github.io')
  ? location.origin
  : 'https://eternal-today.github.io';

export const LINKS = {
  home: `${ORIGIN}/ace-home/`,
  math: `${ORIGIN}/math-worksheet-final/`,
  hanja: `${ORIGIN}/hanja-ace/`,
};

/** 에이스 홈(허브)으로 이동. view: 'shop'(찬스 가게), 'coupons'(쿠폰함) */
export function goHome(view?: 'shop' | 'coupons') {
  location.href = LINKS.home + (view ? `#${view}` : '');
}
