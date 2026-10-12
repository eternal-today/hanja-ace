import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Baby, ChevronRight, User } from 'lucide-react';
import { RoundKind } from './types';
import { Milestone, useStore } from './engine/store';
import { initCelebration, migrateHanjaLegacy } from './ace/wallet';
import { startAceSync } from './ace/aceSync';
import { Overlays, askPin, fireConfetti } from './components/ui';
import ChildHome from './screens/ChildHome';
import Play from './screens/Play';
import Dogam from './screens/Dogam';
import Shop from './screens/Shop';
import Parent from './screens/Parent';
import { SavedRound, loadRound } from './engine/resume';

type ChildView = 'home' | 'play' | 'dogam' | 'shop';

// 첫 화면 그리기 전에: 첫날 장부·쿠폰을 에이스 지갑으로 옮기고(한 번만), 축하 목록 준비
migrateHanjaLegacy();
initCelebration();

export default function App() {
  const store = useStore();
  const [screen, setScreen] = useState<'landing' | 'parent' | 'child'>('landing');
  const [view, setView] = useState<ChildView>('home');
  const [kind, setKind] = useState<RoundKind>('daily');
  const [roundKey, setRoundKey] = useState(0);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [resume, setResume] = useState<SavedRound | null>(null);
  const playBackRef = useRef<null | (() => void)>(null);

  // ── 기기의 뒤로가기 ──
  // 첫 화면을 벗어나면 기록에 "받침" 한 칸을 넣어 두고, 뒤로가기가 눌리면 앱을 떠나지 않고
  // 풀이 중 → 확인창 / 도감·가게 → 아이 홈 / 아이 홈·부모 화면 → 첫 화면으로 보냄
  const nav = useRef({ screen, view });
  nav.current = { screen, view };
  const guard = useRef(false);
  useEffect(() => {
    const onPop = () => {
      guard.current = false;
      const cur = nav.current;
      if (cur.screen === 'landing') return;                 // 첫 화면에서는 평소처럼 나감
      history.pushState({ hanja: 1 }, '');                   // 받침을 다시 깔아 둠
      guard.current = true;
      if (cur.screen === 'parent') setScreen('landing');
      else if (cur.view === 'play') { if (playBackRef.current) playBackRef.current(); else setView('home'); }
      else if (cur.view === 'home') setScreen('landing');
      else setView('home');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (screen !== 'landing' && !guard.current) { history.pushState({ hanja: 1 }, ''); guard.current = true; }
    else if (screen === 'landing' && guard.current) { guard.current = false; history.back(); }   // 남은 받침 치우기
  }, [screen]);
  const name = store.config.childName?.trim();

  useEffect(() => {
    startAceSync({ pullMath: true });
    const fallback = document.getElementById('loading-fallback');
    if (fallback) fallback.style.display = 'none';
  }, []);

  const start = (k: RoundKind) => { setResume(null); setKind(k); setRoundKey(n => n + 1); setView('play'); };
  const resumeRound = () => {
    const saved = loadRound();
    if (!saved) { setView('home'); return; }
    setResume(saved); setKind(saved.kind); setRoundKey(n => n + 1); setView('play');
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 selection:bg-brand-100 selection:text-brand-900">
      <Overlays pin={store.pin} />

      <AnimatePresence mode="wait">
        {screen === 'landing' && (
          <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-gradient-to-br from-brand-50 via-white to-amber-50 flex flex-col items-center justify-center p-6 overflow-y-auto">
            <div className="absolute inset-0 bg-[radial-gradient(#d8c9ff_1px,transparent_1px)] [background-size:28px_28px] opacity-40" />
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}
              className="relative z-10 text-center max-w-sm w-full">
              <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 3 }} transition={{ type: 'spring', damping: 12, delay: 0.2 }}
                className="w-24 h-24 bg-gradient-to-br from-brand-500 to-brand-700 rounded-[2rem] mx-auto mb-7 flex items-center justify-center shadow-2xl shadow-brand-300/60">
                <span className="hanja text-6xl text-white">漢</span>
              </motion.div>
              <h1 className="text-4xl font-black text-slate-900 mb-3 leading-tight font-display">우리집 한자 에이스</h1>
              <p className="text-slate-500 mb-10 leading-relaxed font-medium">한 글자씩 모으는 한자 도감<br />8급부터 차근차근</p>
              <div className="space-y-4">
                <motion.button whileTap={{ scale: 0.97 }}
                  className="w-full group flex items-center justify-between bg-white border-2 border-slate-200 p-5 rounded-3xl hover:border-trust-500 hover:bg-trust-50 transition-all shadow-sm"
                  onClick={() => askPin('', () => setScreen('parent'))}>
                  <div className="flex items-center gap-4 text-left">
                    <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center group-hover:bg-trust-100 transition-colors">
                      <User size={24} className="text-slate-600 group-hover:text-trust-600" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">부모님 모드</div>
                      <div className="text-xs text-slate-500">급수·묶음 설정, 찬스, 기록 확인</div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-slate-300 group-hover:text-trust-500" />
                </motion.button>
                <motion.button whileTap={{ scale: 0.97 }}
                  className="w-full group flex items-center justify-between bg-gradient-to-br from-brand-500 to-brand-600 p-5 rounded-3xl hover:from-brand-600 hover:to-brand-700 transition-all shadow-xl shadow-brand-200"
                  onClick={() => { setScreen('child'); setView('home'); }}>
                  <div className="flex items-center gap-4 text-left">
                    <div className="w-12 h-12 bg-white/25 rounded-2xl flex items-center justify-center"><Baby size={24} className="text-white" /></div>
                    <div>
                      <div className="font-bold text-white text-lg">아이 모드</div>
                      <div className="text-xs text-white/80">한자 놀이하고 별 모으기</div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-white/60" />
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {screen === 'parent' && (
          <motion.div key="parent" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Parent onHome={() => setScreen('landing')} />
          </motion.div>
        )}

        {screen === 'child' && (
          <motion.div key="child" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="h-[100dvh] bg-gradient-to-b from-brand-50 to-white flex flex-col overflow-hidden">
            {view === 'home' && <ChildHome onHome={() => setScreen('landing')} onStart={start} onResume={resumeRound} onDogam={() => setView('dogam')} onShop={() => setView('shop')} />}
            {view === 'play' && (
              <Play key={roundKey} kind={kind} resume={resume} backRef={playBackRef} onExit={() => setView('home')} onAgain={() => start(kind)}
                onMilestone={m => { setMilestone(m); fireConfetti(m.hall ? 'epic' : m.value % 50 === 0 ? 'big' : 'normal'); }} onOpenShop={() => setView('shop')} />
            )}
            {view === 'dogam' && <Dogam onBack={() => setView('home')} />}
            {view === 'shop' && <Shop onBack={() => setView('home')} />}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 번 별 10개마다 축하 */}
      <AnimatePresence>
        {milestone && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setMilestone(null)}>
            <motion.div initial={{ scale: 0.5, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', damping: 14 }} onClick={e => e.stopPropagation()}
              className="bg-white rounded-[2.5rem] p-10 max-w-sm w-full text-center shadow-2xl">
              <div className="text-7xl mb-4">{milestone.hall ? '👑' : milestone.badge ? '🏅' : '🎉'}</div>
              <h2 className={`text-3xl font-black font-display mb-2 ${milestone.hall ? 'text-brand-600' : 'text-slate-900'}`}>
                {milestone.hall ? '명예의 전당 입성!' : milestone.value ? `별 ${milestone.value}개를 모았어!` : '새 뱃지!'}
              </h2>
              {milestone.value > 0 && <p className="text-xs font-bold text-slate-400 mb-2">수학과 한자에서 모은 별 {milestone.value}개</p>}
              <p className="text-slate-500 font-medium">
                {milestone.badge
                  ? <>한자 뱃지 <strong className="text-brand-600">‘{milestone.badge}’</strong>를 받았어요!</>
                  : milestone.hall ? <>{name ? `${name}는 ` : ''}진정한 에이스야 👑</> : <>{name ? `${name}, ` : ''}정말 대단해! 계속 모아 보자 ⭐</>}
              </p>
              <button onClick={() => setMilestone(null)} className="btn-primary w-full mt-6 py-4 text-lg">좋아! 🙌</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
