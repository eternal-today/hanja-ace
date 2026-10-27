import React from 'react';
import { motion } from 'motion/react';
import { BookOpen, ChevronRight, Ear, Languages, ListOrdered, PenLine, PlayCircle, Search, Sparkles, Star, Type } from 'lucide-react';
import { RoundKind } from '../types';
import { STAGES, charsOfStage } from '../data';
import { BADGES, useStore } from '../engine/store';
import { useWallet } from '../ace/wallet';
import { AceNav } from '../ace/AceNav';
import { AceRewardCards } from '../ace/Rewards';
import { PlayBadge } from '../ace/playground';

/** 골라 하는 놀이터 항목 이름 (하루 2번 그냥, 그 뒤로 별 1개) */
export const PLAY_LABEL: Partial<Record<RoundKind, string>> = { hun: '뜻·소리 고르기', word: '낱말 읽기', listen: '듣고 고르기', write: '훈음 쓰기', order: '필순' };
import { canSpeak, poolStatus } from '../engine/quiz';
import { toneOf } from '../engine/srs';
import { loadRound } from '../engine/resume';

const KIND_NAME: Record<RoundKind, string> = { daily: '오늘의 한 판', hun: '뜻·소리 고르기', word: '낱말 읽기', listen: '듣고 고르기', write: '훈음 쓰기', order: '필순', check: '실력 확인' };

interface Props {
  onParent: () => void;
  onStart: (kind: RoundKind) => void;
  onResume: () => void;
  onDogam: () => void;
  onRewards: () => void;
}

export default function ChildHome({ onParent, onStart, onResume, onDogam, onRewards }: Props) {
  const store = useStore();
  const { config, cards } = store;
  const wallet = useWallet();   // 수학·한자 합산 별
  const balance = wallet.balance;
  const status = poolStatus(config, cards);
  const name = config.childName?.trim();
  const saved = loadRound();   // 풀다 멈춘 판

  // 도감 요약: 글자를 하나라도 만난 단계 + 지금 공부하는 단계
  const activeStages = STAGES.filter(st => config.groupIds.some(id => id.startsWith(st + '-')) || charsOfStage(st).some(c => cards[c]));
  const stageRows = (activeStages.length ? activeStages : ['8급']).map(st => {
    const chars = charsOfStage(st);
    const tones = chars.map(c => toneOf(cards[c]));
    return {
      st, total: chars.length,
      gold: tones.filter(t => t === 'gold').length,
      color: tones.filter(t => t === 'color').length,
      grey: tones.filter(t => t === 'grey').length,
    };
  });

  const unseen8 = charsOfStage('8급').filter(c => !cards[c]).length;
  const showCheck = unseen8 >= 20;

  const sub = status.total === 0 ? '부모님 화면에서 묶음을 골라 주세요'
    : status.unseen > 0 && status.due > 0 ? `새 글자와 복습 ${status.due}자가 기다려요`
      : status.unseen > 0 ? '새 글자를 만나러 가요'
        : status.due > 0 ? `복습할 글자 ${status.due}자가 기다려요` : '오늘 복습은 끝! 한 판 더 해도 좋아요';

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <header className="flex flex-wrap items-center gap-2 mb-6 max-w-lg landscape:max-w-5xl mx-auto w-full">
        <AceNav current="hanja" onParent={onParent} />
        <button onClick={onRewards} aria-label="내 보상 보기"
          className="ml-auto bg-white px-5 py-2.5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3 active:scale-95 transition-transform">
          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
            <Star size={18} className="text-amber-500 fill-amber-500" />
          </div>
          <span className="font-black text-slate-700 text-lg font-display">{balance}</span>
          <ChevronRight size={16} className="text-slate-300 -ml-1" />
        </button>
      </header>

      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-lg landscape:max-w-5xl mx-auto space-y-6 landscape:space-y-0 landscape:grid landscape:grid-cols-2 landscape:gap-8 landscape:items-start">
        <div className="space-y-5">
          <div className="text-center space-y-1">
            <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }} className="text-brand-400 flex justify-center">
              <Sparkles size={26} />
            </motion.div>
            <h2 className="text-3xl font-black text-slate-900 font-display">{name ? `안녕, ${name}!` : '안녕, 한자 에이스!'}</h2>
            <p className="text-slate-500 font-medium">오늘은 어떤 한자를 만나 볼까?</p>
          </div>

          {saved && (
            <motion.button whileTap={{ scale: 0.97 }} onClick={onResume}
              className="w-full bg-emerald-50 border-2 border-emerald-300 rounded-3xl p-4 flex items-center gap-4 text-left">
              <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shrink-0"><PlayCircle size={26} /></div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-emerald-800">이어서 풀기</div>
                <div className="text-xs font-bold text-emerald-600">{KIND_NAME[saved.kind]} · {saved.questions.length}문제 중 {Math.min(saved.items.length + 1, saved.questions.length)}번 문제부터</div>
              </div>
              <ChevronRight size={18} className="text-emerald-400 shrink-0" />
            </motion.button>
          )}

          <motion.button whileTap={{ scale: 0.97 }} onClick={() => onStart('daily')}
            className="w-full bg-gradient-to-br from-brand-500 to-brand-700 p-7 landscape:p-6 rounded-[2rem] shadow-xl shadow-brand-200 flex items-center gap-5 text-left">
            <div className="w-16 h-16 bg-white/25 rounded-2xl flex items-center justify-center shrink-0">
              <span className="hanja text-4xl text-white">漢</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-2xl font-black text-white">오늘의 한 판</div>
              <div className="text-white/80 text-sm font-medium mt-0.5">{config.count}문제 · {sub}</div>
            </div>
            <ChevronRight size={24} className="text-white/60 shrink-0" />
          </motion.button>

          <div>
            <div className="text-xs font-black text-slate-400 mb-2 px-1">골라 하는 놀이터</div>
            <div className="grid grid-cols-3 gap-3">
              {([
                { kind: 'hun', label: '뜻·소리 고르기', icon: <Type size={26} />, on: true },
                { kind: 'word', label: '낱말 읽기', icon: <Languages size={26} />, on: true },
                { kind: 'listen', label: '듣고 고르기', icon: <Ear size={26} />, on: canSpeak() },
                { kind: 'write', label: '훈음 쓰기', icon: <PenLine size={26} />, on: true },
                { kind: 'order', label: '필순', icon: <ListOrdered size={26} />, on: true },
              ] as { kind: RoundKind; label: string; icon: React.ReactNode; on: boolean }[]).map(m => (
                <motion.button key={m.kind} whileTap={{ scale: 0.95 }} disabled={!m.on} onClick={() => onStart(m.kind)}
                  className="bg-white border-2 border-slate-200 rounded-3xl p-4 flex flex-col items-center gap-2 text-brand-600 disabled:opacity-40">
                  {m.icon}
                  <span className="text-sm font-black text-slate-700 break-keep text-center">{m.label}</span>
                  <PlayBadge subject="hanja" item={m.kind} />
                </motion.button>
              ))}
            </div>
          </div>

          {showCheck && (
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => onStart('check')}
              className="w-full bg-white border-2 border-dashed border-brand-300 rounded-3xl p-4 flex items-center gap-4 text-left">
              <div className="w-12 h-12 bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center shrink-0"><Search size={22} /></div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-slate-800">8급 실력 확인</div>
                <div className="text-xs font-bold text-slate-400">이미 아는 글자는 도감에 바로 색칠돼요 ({unseen8}자)</div>
              </div>
              <ChevronRight size={18} className="text-slate-300 shrink-0" />
            </motion.button>
          )}
        </div>

        <div className="space-y-4">
          {/* 도감 */}
          <button onClick={onDogam}
            className="w-full bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5 space-y-4 active:scale-[0.98] transition-transform text-left">
            <div className="flex items-center justify-between">
              <span className="font-black text-slate-800 flex items-center gap-2"><BookOpen size={18} className="text-brand-500" />한자 도감</span>
              <span className="text-xs font-bold text-brand-500 flex items-center">펼쳐 보기<ChevronRight size={14} /></span>
            </div>
            {stageRows.map(r => (
              <div key={r.st}>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-slate-600">{r.st}</span>
                  <span className="text-slate-400">
                    <span className="text-amber-600">금테 {r.gold}</span> · <span className="text-brand-600">색 {r.color}</span> · 전체 {r.total}
                  </span>
                </div>
                <div className="bg-slate-100 h-3 rounded-full overflow-hidden flex">
                  <div className="bg-amber-400 h-full" style={{ width: `${(r.gold / r.total) * 100}%` }} />
                  <div className="bg-brand-400 h-full" style={{ width: `${(r.color / r.total) * 100}%` }} />
                  <div className="bg-slate-300 h-full" style={{ width: `${(r.grey / r.total) * 100}%` }} />
                </div>
              </div>
            ))}
          </button>

          {/* 내 보상 · 찬스 바꾸기 · 명예의 전당 (모든 에이스 같은 모양) */}
          <AceRewardCards subject="hanja" badges={BADGES} onOpen={onRewards} />
        </div>
      </motion.div>
    </div>
  );
}
