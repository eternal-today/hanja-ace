/**
 * 에이스 지갑·한자 기록의 기기 간 동기화
 * ※ src/ace 폴더는 허브·수학·한자 세 저장소에 똑같이 들어 있음. 고치면 세 곳에 같이 복사.
 *
 * 수학 에이스의 동기화 서버(Google Apps Script)를 그대로 씀. 서버 코드는 고치지 않음.
 * 서버는 데이터를 이름표(profileId)별로 따로 보관하므로 이름표만 나눠 씀.
 *   default : 수학 기록 (수학 앱이 올림, 여기서는 읽기만)
 *   hanja   : 한자 기록 (한자 앱이 올림)
 *   wallet  : 공통 장부(힌트), 찬스 쿠폰, 축하 완료 목록 (세 앱 모두 올림)
 * 연결 정보(웹 앱 URL·가족 코드)는 수학 앱에 넣어 둔 값을 함께 쓰고,
 * 수학 앱에서 연결하지 않은 기기는 허브 부모 화면에서 따로 넣을 수 있음.
 */
import {
  SyncProfile, readDirty, writeDirty, walletRecordFor, hanjaRecordFor, walletUpdatedAt,
  applyServerWallet, applyServerHanja, applyServerMath, notifyWallet, onWalletDirty,
} from './wallet';

const KEY = {
  url: 'ace_sync_url', token: 'ace_sync_token',
  mathUrl: 'sync_url', mathToken: 'sync_token',   // 수학 앱의 연결 정보
  lastAt: 'ace_sync_last_at',
  cursor: (p: string) => `ace_sync_cursor_${p}`,
};

type Profile = SyncProfile | 'default';

export function getAceSyncSettings(): { url: string; token: string; fromMath: boolean } | null {
  const mu = localStorage.getItem(KEY.mathUrl) || '', mt = localStorage.getItem(KEY.mathToken) || '';
  if (mu && mt) return { url: mu, token: mt, fromMath: true };
  const u = localStorage.getItem(KEY.url) || '', t = localStorage.getItem(KEY.token) || '';
  return u && t ? { url: u, token: t, fromMath: false } : null;
}
export function setAceSyncSettings(url: string, token: string) {
  localStorage.setItem(KEY.url, url.trim());
  localStorage.setItem(KEY.token, token.trim());
  scheduleAceSync(100);
}
export function clearAceSyncSettings() {
  [KEY.url, KEY.token].forEach(k => localStorage.removeItem(k));
  setStatus({ state: 'off' });
}

// ─────────────────────────────────────────────
// 상태 (부모 화면 표시용)
// ─────────────────────────────────────────────
export type AceSyncState = 'off' | 'idle' | 'syncing' | 'error';
export interface AceSyncStatus { state: AceSyncState; lastAt: number; pending: number; error: string }
let status: AceSyncStatus = { state: 'off', lastAt: 0, pending: 0, error: '' };
const statusListeners = new Set<(s: AceSyncStatus) => void>();
function setStatus(patch: Partial<AceSyncStatus>) {
  const d = readDirty();
  status = { ...status, ...patch, lastAt: Number(localStorage.getItem(KEY.lastAt) || 0), pending: d.wallet.length + d.hanja.length };
  if (!getAceSyncSettings()) status.state = 'off';
  statusListeners.forEach(fn => fn(status));
}
export function getAceSyncStatus() { setStatus({}); return status; }
export function onAceSyncStatus(fn: (s: AceSyncStatus) => void) { statusListeners.add(fn); return () => { statusListeners.delete(fn); }; }

// ─────────────────────────────────────────────
// 서버 통신 (수학 sync.ts와 같은 방식: text/plain으로 보내 CORS 사전 요청을 피함)
// ─────────────────────────────────────────────
const ERROR_TEXT: Record<string, string> = {
  unauthorized: '가족 코드가 맞지 않아요',
  busy: '서버가 바빠요. 잠시 후 다시 시도해요',
  bad_profile: '이름표가 올바르지 않아요',
  bad_json: '요청 형식 오류예요',
  bad_action: '서버 스크립트가 예전 버전이에요',
};
async function post(url: string, body: object): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', body: JSON.stringify(body), signal: ctrl.signal, redirect: 'follow' });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') throw new Error('서버 응답이 너무 늦어요');
    throw new Error('서버에 닿지 못했어요. 인터넷과 웹 앱 URL을 확인해 주세요');
  }
  clearTimeout(timer);
  const text = await res.text().catch(() => '');
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error(`서버가 엉뚱한 응답을 보냈어요 (HTTP ${res.status})`); }
  if (!data.ok) {
    const code = String(data.error || 'server');
    throw new Error(ERROR_TEXT[code] || `서버 오류: ${data.message || code}`);
  }
  return data;
}

/** 연결 전 확인 (허브 부모 화면) */
export async function checkAceServer(url: string, token: string) {
  return post(url.trim(), { action: 'status', token: token.trim(), profileId: 'wallet' });
}

// ─────────────────────────────────────────────
// 한 이름표 동기화: 대기열을 올리고, 마지막 위치 이후 바뀐 것을 받음
// ─────────────────────────────────────────────
async function syncProfile(cfg: { url: string; token: string }, p: Profile) {
  const pushable = p === 'wallet' || p === 'hanja';
  const dirty = readDirty();
  const ids = pushable ? dirty[p as SyncProfile] : [];
  const sent = new Map<number, number>();
  const out: any[] = [];
  for (const id of ids) {
    const r = p === 'wallet' ? walletRecordFor(id) : hanjaRecordFor(id);
    if (!r) continue;
    out.push({ ...r, profileId: p });
    sent.set(id, r.updatedAt);
  }
  const since = Number(localStorage.getItem(KEY.cursor(p)) || 0);
  const res = await post(cfg.url, { action: 'sync', token: cfg.token, profileId: p, since, records: out });
  const recs: any[] = Array.isArray(res.records) ? res.records : [];
  if (p === 'wallet') applyServerWallet(recs);
  else if (p === 'hanja') applyServerHanja(recs);
  else applyServerMath(recs);

  if (pushable) {
    // 보낸 뒤 다시 바뀌지 않은 것만 대기열에서 뺌
    const now = readDirty();
    now[p as SyncProfile] = now[p as SyncProfile].filter(id => {
      const s = sent.get(id);
      if (s === undefined) return !!(p === 'wallet' ? walletRecordFor(id) : hanjaRecordFor(id));
      const cur = p === 'wallet' ? walletUpdatedAt(id) : hanjaRecordFor(id)?.updatedAt;
      return cur !== s;
    });
    writeDirty(now);
  }
  localStorage.setItem(KEY.cursor(p), String(res.seq || since));
}

let opts = { pullMath: true };
let inflight: Promise<void> | null = null;
let again = false;

export async function runAceSync(): Promise<void> {
  const cfg = getAceSyncSettings();
  if (!cfg) { setStatus({ state: 'off' }); return; }
  if (inflight) { again = true; return inflight; }
  inflight = (async () => {
    setStatus({ state: 'syncing', error: '' });
    try {
      await syncProfile(cfg, 'wallet');
      await syncProfile(cfg, 'hanja');
      if (opts.pullMath) await syncProfile(cfg, 'default');
      localStorage.setItem(KEY.lastAt, String(Date.now()));
      setStatus({ state: 'idle', error: '' });
    } catch (e: any) {
      setStatus({ state: 'error', error: e?.message || '동기화에 실패했어요' });
      throw e;
    } finally {
      notifyWallet();
    }
  })().finally(() => { inflight = null; });
  try { await inflight; } finally {
    if (again) { again = false; scheduleAceSync(300); }
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
export function scheduleAceSync(delay = 1500) {
  if (!getAceSyncSettings()) { setStatus({}); return; }
  setStatus({});
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; runAceSync().catch(() => { }); }, delay);
}

let started = false;
/**
 * 앱 시작 시 1회. 시작·화면 복귀·인터넷 복귀·지갑 변경 시 동기화.
 * pullMath: 수학 기록을 서버에서 받아 별 계산에 쓸지 (수학 앱은 자기 동기화가 있으므로 false)
 */
export function startAceSync(o: { pullMath: boolean }) {
  opts = o;
  if (started) return;
  started = true;
  onWalletDirty(() => scheduleAceSync());
  setStatus({ state: getAceSyncSettings() ? 'idle' : 'off' });
  scheduleAceSync(600);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleAceSync(300); });
  window.addEventListener('online', () => scheduleAceSync(300));
}
