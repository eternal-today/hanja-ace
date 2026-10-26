/**
 * 부모님 설정의 기기 간 동기화 (이름표 prefs)
 * ※ src/ace 폴더는 허브·수학·한자·영어·생각 다섯 저장소에 똑같이 들어 있음. 고치면 다섯 곳에 같이 복사.
 *
 * 맞추는 것: 한자·영어·생각 설정과 PIN, 생각 해설 PIN, 에이스 홈 PIN, AI 키(Gemini, 에이스 홈에 넣은 키)
 *   생각나무(이름·종류·숲 / 물은 '쌓기 기록'으로 기기마다 쌓은 것을 합침), 영어에서 부모님이 넣은 표현
 *   - 수학 설정·PIN은 수학 앱이 자기 동기화로 이미 맞춤 (여기서는 다루지 않음)
 *   - 한자 설정 안의 예전 AI 키(geminiKey)는 올리지 않음 (공통 키를 씀)
 * 방식: 항목마다 "마지막으로 고친 시각"을 두고, 서버와 비교해 더 나중에 고친 쪽이 이김.
 *   - 앱을 켤 때 이미 있던 값은 아주 오래된 것으로 취급 (그 과목을 많이 푼 기기일수록 조금 앞섬).
 *     그래서 설정을 거의 안 쓴 기기의 기본값이 쓰던 기기의 설정을 덮지 않음.
 *   - 켠 뒤에 부모님이 고친 값은 지금 시각으로 올라가서 다른 기기에도 적용됨.
 * 에이스 홈 PIN과 AI 키는 가족 코드로 잠가서(AES-GCM) 올림. 서버 시트를 열어도 보이지 않음.
 * 다른 기기에서 받은 값이 적용되면 'ace-prefs' 이벤트를 보냄 → 각 앱이 설정을 다시 읽음.
 */

interface Item {
  id: number;
  key: string;
  type: 'json' | 'text' | 'secret';
  strip?: string[];          // json에서 올리지 않을 항목 (이 기기 값 유지)
  weight?: () => number;     // 처음 값의 우선순위 (많이 쓴 기기가 조금 앞섬)
}

function count(key: string): number {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Math.min(100000, Array.isArray(v) ? v.length : Object.keys(v || {}).length); } catch { return 0; }
}

const ITEMS: Item[] = [
  { id: 1, key: 'hanja_config', type: 'json', strip: ['geminiKey'], weight: () => count('hanja_records') },
  { id: 2, key: 'hanja_parent_pin', type: 'text', weight: () => count('hanja_records') },
  { id: 3, key: 'english_config', type: 'json', weight: () => count('english_records') },
  { id: 4, key: 'english_parent_pin', type: 'text', weight: () => count('english_records') },
  { id: 5, key: 'ace_pin', type: 'secret' },
  { id: 6, key: 'ace_gemini_key', type: 'secret' },
  { id: 7, key: 'thinking_config', type: 'json', weight: () => count('thinking_records') },
  { id: 8, key: 'thinking_parent_pin', type: 'text', weight: () => count('thinking_records') },
  { id: 9, key: 'thinking_peek_pin', type: 'secret' },
  { id: 10, key: 'thinking_tree', type: 'json', strip: ['drops'], weight: () => count('thinking_records') },   // 생각나무 이름·종류·숲·심은 시각 (물은 아래 쌓기 기록)
  { id: 11, key: 'english_custom_phrases', type: 'json', weight: () => count('english_records') },          // 영어: 부모님이 직접 넣은 표현   // 생각 에이스 '부모님 해설' PIN (정답이 보이므로 잠가서 올림)
];
const BY_ID = new Map(ITEMS.map(i => [i.id, i]));

/**
 * 쌓기만 하는 기록 — 기기마다 따로 쌓은 것을 모두 합침 (가장 나중 것이 이기는 방식이 아님)
 *   thinking_drops: 생각나무에 준 물. { [판 시각]: 방울 수 }. 두 기기에서 번갈아 풀어도 물이 사라지지 않음
 */
const LOGS: Record<string, string> = { thinking_drops: 'thinking_drops_log' };
const LOG_DIRTY = 'ace_prefs_log_dirty';   // [[이름, 시각]] 아직 올리지 않은 것

const META = 'ace_prefs_meta';     // { id: { u: 고친 시각, h: 마지막으로 맞춘 값 } }
const DIRTY = 'ace_prefs_dirty';   // 아직 올리지 않은 항목 번호
export const PREFS_EVENT = 'ace-prefs';

type Meta = Record<string, { u: number; h: string | null }>;
function readJ<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } }
function writeJ(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } }

/** 이 기기의 현재 값 (비교·전송용 문자열). 없으면 null */
function current(it: Item): string | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(it.key); } catch { return null; }
  if (raw === null || raw === '') return null;
  if (it.type !== 'json') return raw;
  try {
    const o = JSON.parse(raw);
    if (it.strip) for (const s of it.strip) delete o[s];
    return JSON.stringify(o);
  } catch { return null; }
}

function markDirty(id: number) {
  const d = readJ<number[]>(DIRTY, []);
  if (!d.includes(id)) { d.push(id); writeJ(DIRTY, d); }
}
export function prefsPendingCount(): number { return readJ<number[]>(DIRTY, []).length + readJ<[string, number][]>(LOG_DIRTY, []).length; }

/** 쌓기 기록 읽기 */
export function logRead(name: string): Record<string, number> { return readJ<Record<string, number>>(LOGS[name], {}); }
/** 쌓기 기록 더하기 (같은 시각이면 덮어씀) → 곧바로 동기화 */
export function logAdd(name: string, ts: number, value: number) {
  const key = LOGS[name];
  if (!key) return;
  const m = readJ<Record<string, number>>(key, {});
  m[ts] = value;
  writeJ(key, m);
  const d = readJ<[string, number][]>(LOG_DIRTY, []);
  if (!d.some(([n, t]) => n === name && t === ts)) { d.push([name, ts]); writeJ(LOG_DIRTY, d); }
  prefsChanged();
}

/** 앱을 켤 때 1회: 처음 보는 값은 아주 오래된 값으로 등록 */
export function initPrefs() {
  const meta = readJ<Meta>(META, {});
  let changed = false;
  for (const it of ITEMS) {
    if (meta[it.id]) continue;
    const cur = current(it);
    if (cur === null) continue;
    meta[it.id] = { u: 1 + (it.weight ? it.weight() : 0), h: cur };
    markDirty(it.id);
    changed = true;
  }
  if (changed) writeJ(META, meta);
}

/** 동기화 직전: 켠 뒤에 바뀐 값을 찾아 지금 시각으로 표시 */
function collectChanges() {
  const meta = readJ<Meta>(META, {});
  let changed = false;
  for (const it of ITEMS) {
    const cur = current(it);
    const m = meta[it.id];
    if (!m) {
      if (cur === null) continue;
    } else if (m.h === cur) continue;
    meta[it.id] = { u: Date.now(), h: cur };
    markDirty(it.id);
    changed = true;
  }
  if (changed) writeJ(META, meta);
}

// ─────────────────────────────────────────────
// 잠그기 (가족 코드로 AES-GCM)
// ─────────────────────────────────────────────
const enc = new TextEncoder(), dec = new TextDecoder();
async function keyFrom(token: string) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('ace-prefs:' + token));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function lock(text: string, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(token), enc.encode(text)));
  const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length);
  return b64(out);
}
async function unlock(data: string, token: string): Promise<string> {
  const all = unb64(data);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await keyFrom(token), all.slice(12));
  return dec.decode(pt);
}

// ─────────────────────────────────────────────
// 서버와 주고받기 (aceSync.ts가 부름)
// ─────────────────────────────────────────────
/** 보낼 기록 목록과, 보낸 항목의 시각 */
export async function prefsOutbox(token: string): Promise<{ records: any[]; sent: Map<number, number> }> {
  collectChanges();
  const meta = readJ<Meta>(META, {});
  const records: any[] = [], sent = new Map<number, number>();
  for (const id of readJ<number[]>(DIRTY, [])) {
    const it = BY_ID.get(id), m = meta[id];
    if (!it || !m) continue;
    let v: string | null = m.h;
    if (v !== null && it.type === 'secret') v = await lock(v, token);
    records.push({ ts: id, updatedAt: m.u, v, locked: it.type === 'secret' });
    sent.set(id, m.u);
  }
  for (const [name, ts] of readJ<[string, number][]>(LOG_DIRTY, [])) {
    const v = logRead(name)[ts];
    if (v === undefined) continue;
    records.push({ ts, updatedAt: ts, log: name, v });
    sent.set(-ts, 0);   // 쌓기 기록은 음수 번호로 표시
  }
  return { records, sent };
}

/** 올린 뒤: 그 사이 다시 바뀌지 않은 항목만 대기열에서 뺌 */
export function prefsSent(sent: Map<number, number>) {
  const meta = readJ<Meta>(META, {});
  writeJ(DIRTY, readJ<number[]>(DIRTY, []).filter(id => !(sent.has(id) && meta[id]?.u === sent.get(id))));
  writeJ(LOG_DIRTY, readJ<[string, number][]>(LOG_DIRTY, []).filter(([, ts]) => !sent.has(-ts)));
}

/** 받은 기록 적용. 바뀐 것이 있으면 'ace-prefs' 이벤트 */
export async function applyServerPrefs(records: any[], token: string) {
  if (!records.length) return;
  const meta = readJ<Meta>(META, {});
  let changed = false;
  for (const r of records) {
    if (r && r.log && LOGS[r.log]) {   // 쌓기 기록: 없던 것만 더함
      const m = logRead(r.log);
      if (m[r.ts] === undefined && typeof r.v === 'number') { m[r.ts] = r.v; writeJ(LOGS[r.log], m); changed = true; }
      continue;
    }
    const it = r && BY_ID.get(Number(r.ts));
    if (!it) continue;
    const u = Number(r.updatedAt) || 0;
    if (meta[it.id] && meta[it.id].u >= u) continue;
    let v: string | null = r.v ?? null;
    try {
      if (v !== null && r.locked) v = await unlock(v, token);
    } catch { continue; }   // 가족 코드가 달라 풀 수 없으면 건너뜀
    try {
      if (v === null) localStorage.removeItem(it.key);
      else if (it.type === 'json' && it.strip) {
        // 이 기기에만 두는 항목은 그대로 살림
        const local = readJ<Record<string, unknown>>(it.key, {});
        const next = JSON.parse(v);
        for (const s of it.strip) if (s in local) next[s] = local[s];
        localStorage.setItem(it.key, JSON.stringify(next));
      } else localStorage.setItem(it.key, v);
    } catch { continue; }
    meta[it.id] = { u, h: current(it) };
    changed = true;
  }
  writeJ(META, meta);
  if (changed && typeof window !== 'undefined') window.dispatchEvent(new Event(PREFS_EVENT));
}

/** 각 앱: 다른 기기에서 설정이 넘어오면 fn 실행 (설정 다시 읽기) */
export function onPrefsApplied(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => { };
  window.addEventListener(PREFS_EVENT, fn);
  return () => window.removeEventListener(PREFS_EVENT, fn);
}

// 설정을 고친 곳에서 부르면 곧바로 동기화 (aceSync가 연결)
let hook: (() => void) | null = null;
export function setPrefsHook(fn: () => void) { hook = fn; }
export function prefsChanged() { if (hook) hook(); }
