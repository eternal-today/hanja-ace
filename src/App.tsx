import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RoundKind } from './types';
import { BADGES, Milestone, useStore } from './engine/store';
import { initCelebration, migrateHanjaLegacy } from './ace/wallet';
import { startAceSync } from './ace/aceSync';
import { AceRewardsSheet } from './ace/Rewards';
import { confirmLeave } from './ace/SaveBar';
import { clearPaid, usePlayGate } from './ace/playground';
import { PLAY_LABEL } from './screens/ChildHome';
import { Overlays, askPin, fireConfetti } from './components/ui';
import ChildHome from './screens/ChildHome';
import Play from './screens/Play';
import Dogam from './screens/Dogam';
import Parent from './screens/Parent';
import { SavedRound, loadRound } from './engine/resume';

type ChildView = 'home' | 'play' | 'dogam';

// 첫 화면 그리기 전에: 첫날 장부·쿠폰을 에이스 지갑으로 옮기고(한 번만), 축하 목록 준비
migrateHanjaLegacy();
initCelebration();

export default function App() {
  const store = useStore();
  const [screen, setScreen] = useState<'parent' | 'child'>('child');
  const [view, setView] = useState<ChildView>('home');
  const [kind, setKind] = useState<RoundKind>('daily');
  const [roundKey, setRoundKey] = useState(0);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [resume, setResume] = useState<SavedRound | null>(null);
  const playBackRef = useRef<null | (() => void)>(null);

  // ── 기기의 뒤로가기 ──
  // 아이 홈을 벗어나면 기록에 "받침" 한 칸을 넣어 두고, 뒤로가기가 눌리면 앱을 떠나지 않고
  // 풀이 중 → 확인창 / 도감·부모 화면 → 아이 홈으로 보냄. 아이 홈에서는 평소처럼 나감
  const atHome = screen === 'child' && view === 'home';
  const nav = useRef({ screen, view, rewardsOpen });
  nav.current = { screen, view, rewardsOpen };
  const guard = useRef(false);
  useEffect(() => {
    const onPop = () => {
      guard.current = false;
      const cur = nav.current;
      if (cur.screen === 'child' && cur.view === 'play') {
        history.pushState({ hanja: 1 }, '');                 // 풀이 중에는 받침을 다시 깔고 확인창
        guard.current = true;
        if (playBackRef.current) playBackRef.current(); else setView('home');
        return;
      }
      if (cur.screen === 'child' && cur.view === 'home') return;   // 아이 홈: 평소처럼 나감
      if (cur.screen === 'parent' && !confirmLeave()) {       // 저장하지 않은 설정이 있어 머물기로 함
        history.pushState({ hanja: 1 }, ''); guard.current = true; return;
      }
      setScreen('child'); setView('home');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (!atHome && !guard.current) { history.pushState({ hanja: 1 }, ''); guard.current = true; }
    else if (atHome && guard.current) { guard.current = false; history.back(); }   // 남은 받침 치우기
  }, [atHome]);
  const name = store.config.childName?.trim();

  useEffect(() => {
    startAceSync({ pullMath: true });
    const fallback = document.getElementById('loading-fallback');
    if (fallback) fallback.style.display = 'none';
  }, []);

  // 놀이터 항목은 하루 2번 그냥, 그 뒤로는 별 1개 (규칙 11번)
  const play = usePlayGate('hanja');
  const begin = (k: RoundKind) => { setResume(null); setKind(k); setRoundKey(n => n + 1); setView('play'); };
  const start = (k: RoundKind) => {
    if (PLAY_LABEL[k]) play.gate(k, PLAY_LABEL[k], () => begin(k));
    else { clearPaid('hanja'); begin(k); }
  };
  const resumeRound = () => {
    const saved = loadRound();
    if (!saved) { setView('home'); return; }
    setResume(saved); setKind(saved.kind); setRoundKey(n => n + 1); setView('play');
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 selection:bg-brand-100 selection:text-brand-900">
      <Overlays pin={store.pin} />

      <AnimatePresence mode="wait">
        {screen === 'parent' && (
          <motion.div key="parent" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Parent onHome={() => { setScreen('child'); setView('home'); }} />
          </motion.div>
        )}

        {screen === 'child' && (
          <motion.div key="child" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="h-[100dvh] bg-gradient-to-b from-brand-50 to-white flex flex-col overflow-hidden">
            {view === 'home' && <ChildHome onParent={() => askPin('', () => setScreen('parent'))} onStart={start} onResume={resumeRound} onDogam={() => setView('dogam')} onRewards={() => setRewardsOpen(true)} />}
            {view === 'play' && (
              <Play key={roundKey} kind={kind} resume={resume} backRef={playBackRef} onExit={() => setView('home')} onAgain={() => start(kind)}
                onMilestone={m => { setMilestone(m); fireConfetti(m.hall ? 'epic' : m.value % 50 === 0 ? 'big' : 'normal'); }} onOpenShop={() => setRewardsOpen(true)} />
            )}
            {view === 'dogam' && <Dogam onBack={() => setView('home')} />}
          </motion.div>
        )}
      </AnimatePresence>

      {play.dialog}

      {/* 내 보상 (별 잔액·내 보상 카드·결과 화면의 별을 누르면) */}
      <AceRewardsSheet open={rewardsOpen && screen === 'child'} onClose={() => setRewardsOpen(false)} childName={name} subject="hanja" badges={BADGES} />

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
              {milestone.value > 0 && <p className="text-xs font-bold text-slate-400 mb-2">모든 과목에서 모은 별 {milestone.value}개</p>}
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
