/**
 * 에이스 공통 설정 — 지금은 Gemini API 키
 * ※ src/ace 폴더는 허브·수학·한자 세 저장소에 똑같이 들어 있음. 고치면 세 곳에 같이 복사.
 *
 * 키는 에이스 홈 부모님 모드에서 한 번 넣으면 모든 에이스가 함께 씀.
 * 기기 안에만 저장하고 서버(동기화)로는 보내지 않음 → 기기마다 한 번씩 넣음.
 * 에이스 홈에 넣은 키가 없으면 각 앱에 따로 넣어 둔 키를 씀 (예전 방식).
 */
const KEY = 'ace_gemini_key';

function get(k: string): string {
  try { return localStorage.getItem(k) || ''; } catch { return ''; }
}

/** 에이스 홈에 넣은 키 */
export function hubGeminiKey(): string { return get(KEY).trim(); }
export function setHubGeminiKey(k: string) {
  try {
    if (k.trim()) localStorage.setItem(KEY, k.trim());
    else localStorage.removeItem(KEY);
  } catch { /* 저장 실패는 무시 */ }
}

/** 실제로 쓸 키: 에이스 홈 키 → 이 앱에 넣은 키 */
export function geminiKey(appKey?: string): string {
  return hubGeminiKey() || (appKey || '').trim();
}

/** 허브 부모 화면용: 이 기기에서 쓰는 키와 어디서 온 것인지 */
export function geminiKeySource(): { key: string; from: 'hub' | 'math' | 'hanja' | null } {
  const hub = hubGeminiKey();
  if (hub) return { key: hub, from: 'hub' };
  let math = get('gemini_key').trim();
  if (!math) { try { math = String(JSON.parse(get('app_config') || '{}').geminiKey || '').trim(); } catch { /* 없음 */ } }
  if (math) return { key: math, from: 'math' };
  let hanja = '';
  try { hanja = String(JSON.parse(get('hanja_config') || '{}').geminiKey || '').trim(); } catch { /* 없음 */ }
  if (hanja) return { key: hanja, from: 'hanja' };
  return { key: '', from: null };
}

/** 키를 가려서 보여줌 (AIza…1234) */
export function maskKey(k: string): string {
  return k.length > 8 ? `${k.slice(0, 4)}…${k.slice(-4)}` : k ? '••••' : '';
}
