/**
 * 놀이터 횟수 — 규칙 문서(common/star-chance-rules.md) 11번
 * ※ src/ace 폴더는 에이스 다섯 저장소에 똑같이 들어 있음. 고치면 다섯 곳에 같이 복사.
 *
 *  - "골라 하는 놀이터"의 항목마다(예: 스무고개) 하루 2번은 그냥 풀 수 있음. 하루는 0시에 다시 시작.
 *  - 3번째부터는 시작할 때마다 별 1개 (공통 장부 kind 'play'). 별이 모자라면 시작할 수 없음.
 *  - 별을 내고 푼 판은 별(생각 에이스는 물)을 받지 않음.
 *  - "오늘의 한 판"은 제한 없음.
 *  - 횟수는 기기 안에만 셈 (낸 별은 공통 장부라 다른 기기와 맞춰짐).
 *
 * 쓰는 법 (각 과목 앱)
 *   const play = usePlayGate('hanja');
 *   play.gate('hun', '뜻·소리 고르기', () => start('hun'));   // 놀이터 판을 시작하는 모든 곳에서
 *   {play.dialog}                                            // 화면 어딘가에 한 번
 *   <PlayBadge subject="hanja" item="hun" />                 // 놀이터 버튼 안 작은 표시
 *   paidRound('hanja', 'hun')                                // 판이 끝날 때: true면 별 0개
 */
import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Star } from 'lucide-react';
import { PLAY_COST, Subject, spendPlay, useWallet } from './wallet';

export const FREE_PLAYS = 2;
const LOG = 'ace_play_log';     // { "hanja:hun": [시작 시각, …] } 최근 사흘만 남김
const PAID = 'ace_play_paid';   // { hanja: "hun" } 별을 내고 시작한 판 (끝나거나 다음 판을 시작하면 지움)

function readJ<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } }
function writeJ(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } }
function dayStart(now = Date.now()): number { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }

/** 오늘 이 항목을 시작한 횟수 */
export function playsToday(subject: Subject, item: string): number {
  const t0 = dayStart();
  return (readJ<Record<string, number[]>>(LOG, {})[`${subject}:${item}`] || []).filter(t => t >= t0).length;
}
export function freeLeft(subject: Subject, item: string): number { return Math.max(0, FREE_PLAYS - playsToday(subject, item)); }

function recordStart(subject: Subject, item: string, paid: boolean) {
  const log = readJ<Record<string, number[]>>(LOG, {});
  const keep = Date.now() - 3 * 86400000;
  for (const k of Object.keys(log)) log[k] = log[k].filter(t => t >= keep);
  const key = `${subject}:${item}`;
  log[key] = [...(log[key] || []), Date.now()];
  writeJ(LOG, log);
  const p = readJ<Record<string, string>>(PAID, {});
  if (paid) p[subject] = item; else delete p[subject];
  writeJ(PAID, p);
}

/** 판이 끝날 때: 별을 내고 시작한 판이면 true (그 판은 별·물 없음). 한 번 읽으면 지움 */
export function paidRound(subject: Subject, item: string): boolean {
  const p = readJ<Record<string, string>>(PAID, {});
  const paid = p[subject] === item;
  if (subject in p) { delete p[subject]; writeJ(PAID, p); }
  return paid;
}
/** 놀이터가 아닌 판(오늘의 한 판 등)을 시작할 때: 남은 표시를 지움 */
export function clearPaid(subject: Subject) {
  const p = readJ<Record<string, string>>(PAID, {});
  if (subject in p) { delete p[subject]; writeJ(PAID, p); }
}

/** 놀이터 버튼 안 작은 표시: "오늘 2번" / "1번 남음" / "⭐1" */
export function PlayBadge({ subject, item, className = '' }: { subject: Subject; item: string; className?: string }) {
  useWallet();   // 판을 끝내고 돌아오면 다시 그림
  const left = freeLeft(subject, item);
  return left > 0
    ? <span className={`text-[10px] font-bold text-slate-400 ${className}`}>오늘 {left}번 더</span>
    : <span className={`text-[10px] font-black text-amber-600 inline-flex items-center gap-0.5 ${className}`}><Star size={10} className="fill-amber-500 text-amber-500" />{PLAY_COST}</span>;
}

/** 놀이터 판 시작 문지기 + 별 내기 확인 창 */
export function usePlayGate(subject: Subject) {
  const w = useWallet();
  const [ask, setAsk] = useState<{ item: string; label: string; go: () => void } | null>(null);

  const gate = (item: string, label: string, go: () => void) => {
    if (freeLeft(subject, item) > 0) { recordStart(subject, item, false); go(); return; }
    setAsk({ item, label, go });
  };
  const pay = () => {
    if (!ask) return;
    if (!spendPlay(subject, ask.label)) return;
    recordStart(subject, ask.item, true);
    const go = ask.go;
    setAsk(null);
    go();
  };
  const enough = w.balance >= PLAY_COST;

  const dialog = (
    <AnimatePresence>
      {ask && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setAsk(null)}>
          <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-[2rem] p-7 w-full max-w-sm text-center shadow-2xl space-y-4">
            <div className="text-5xl">🎟️</div>
            <h3 className="text-xl font-black text-slate-900 break-keep">오늘 ‘{ask.label}’은 {FREE_PLAYS}번 다 했어요</h3>
            <p className="text-sm text-slate-500 font-medium break-keep leading-relaxed">
              별 {PLAY_COST}개를 내면 한 번 더 할 수 있어요.<br />이번 판은 별을 받지 않아요. 내일이 되면 다시 {FREE_PLAYS}번 그냥 할 수 있어요.
            </p>
            <div className="text-sm font-bold text-amber-700 bg-amber-50 rounded-xl py-2 flex items-center justify-center gap-1.5">
              <Star size={16} className="fill-amber-500 text-amber-500" />지금 가진 별 {w.balance}개
            </div>
            {!enough && <p className="text-xs font-bold text-rose-500">별이 모자라요. 오늘의 한 판으로 별을 모아 보세요!</p>}
            <div className="flex gap-2">
              <button onClick={() => setAsk(null)} className="flex-1 py-3.5 rounded-2xl bg-slate-100 text-slate-600 font-black active:scale-95 transition-transform">다음에 할게요</button>
              <button onClick={pay} disabled={!enough}
                className="flex-1 py-3.5 rounded-2xl bg-amber-500 text-white font-black active:scale-95 transition-transform disabled:opacity-40">별 {PLAY_COST}개 내기</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return { gate, dialog };
}
