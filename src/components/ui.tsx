import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { CheckCircle2, Delete, Lock, Sprout, Star, Flame, Gem, Trophy, X } from 'lucide-react';
import { canSpeak } from '../engine/quiz';

// ── 어디서든 부를 수 있는 알림·PIN 확인 ──
type ToastFn = (msg: string) => void;
type PinFn = (purpose: string, action: () => void) => void;
let toastImpl: ToastFn = () => { };
let pinImpl: PinFn = () => { };
export const toast: ToastFn = msg => toastImpl(msg);
/** 부모님 PIN을 확인한 뒤 action 실행 */
export const askPin: PinFn = (purpose, action) => pinImpl(purpose, action);

export function fireConfetti(intensity: 'normal' | 'big' | 'epic' = 'normal') {
  const count = { normal: 80, big: 160, epic: 280 }[intensity];
  const colors = ['#8556f2', '#f59e0b', '#fbbf24', '#34d399', '#60a5fa', '#bda3ff', '#f472b6'];
  confetti({ particleCount: count, spread: 90, origin: { y: 0.6 }, colors });
  if (intensity !== 'normal') {
    setTimeout(() => confetti({ particleCount: count / 2, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors }), 150);
    setTimeout(() => confetti({ particleCount: count / 2, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors }), 150);
  }
  if (intensity === 'epic') {
    setTimeout(() => confetti({ particleCount: 120, spread: 130, origin: { y: 0.4 }, colors, scalar: 1.3 }), 400);
  }
}

/** 한국어로 읽어 주기 (기기에 음성이 없으면 조용히 넘어감) */
export function speak(text: string) {
  if (!canSpeak()) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 0.85;
    const v = window.speechSynthesis.getVoices().find(x => x.lang?.toLowerCase().startsWith('ko'));
    if (v) u.voice = v;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* 무시 */ }
}

export const BadgeIcon = ({ name, size = 24, className = '' }: { name: string; size?: number; className?: string }) => {
  const icons: Record<string, any> = { Sprout, Star, Flame, Gem, Trophy };
  const Icon = icons[name] || Star;
  return <Icon size={size} className={className} />;
};

/** 아래에서 올라오는 창 (보상, 도감 상세 등) */
export function Sheet({ open, onClose, children, wide = false }: { open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6" onClick={onClose}>
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: 'spring', damping: 22 }}
            onClick={e => e.stopPropagation()}
            className={`bg-white w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[88vh] overflow-y-auto rounded-t-[2rem] sm:rounded-[2rem] p-6 shadow-2xl`}>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const CloseButton = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} aria-label="닫기"
    className="shrink-0 w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center active:scale-90"><X size={20} /></button>
);

/** 알림과 PIN 창. App에 한 번만 둠 */
export function Overlays({ pin }: { pin: string }) {
  const [msg, setMsg] = useState('');
  const [pinReq, setPinReq] = useState<{ purpose: string; action: () => void } | null>(null);
  const [buffer, setBuffer] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    toastImpl = m => {
      setMsg(m);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMsg(''), 2800);
    };
    pinImpl = (purpose, action) => { setBuffer(''); setError(false); setPinReq({ purpose, action }); };
    return () => { if (timer) clearTimeout(timer); toastImpl = () => { }; pinImpl = () => { }; };
  }, []);

  const press = (n: number) => {
    if (buffer.length >= 4 || !pinReq) return;
    const next = buffer + n;
    setBuffer(next);
    if (next.length < 4) return;
    if (next === pin) {
      const action = pinReq.action;
      setPinReq(null); setBuffer('');
      action();
    } else {
      setError(true);
      setTimeout(() => { setBuffer(''); setError(false); }, 700);
    }
  };

  return (
    <>
      <AnimatePresence>
        {msg && (
          <motion.div initial={{ opacity: 0, y: 20, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-8 left-1/2 z-[9999] max-w-[90vw] bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
            <CheckCircle2 size={18} className="text-brand-300 shrink-0" />
            <span className="font-medium text-sm">{msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {pinReq && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-xs text-center shadow-2xl max-h-[96dvh] overflow-y-auto">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl mx-auto mb-4 flex items-center justify-center"><Lock size={26} className="text-slate-400" /></div>
              <h3 className="text-xl font-black text-slate-900 mb-1 font-display">부모님 인증</h3>
              <p className="text-sm text-slate-400 mb-6 font-medium">{pinReq.purpose || 'PIN 번호 4자리를 입력하세요'}</p>
              <div className="flex justify-center gap-4 mb-6">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${buffer.length > i ? 'bg-trust-600 border-trust-600 scale-110' : 'border-slate-200'}`} />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                  <button key={n} className="h-13 py-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-xl font-black text-slate-700 transition-colors active:scale-90" onClick={() => press(n)}>{n}</button>
                ))}
                <button className="py-3 flex items-center justify-center text-slate-300 hover:text-slate-500" aria-label="닫기" onClick={() => { setPinReq(null); setBuffer(''); }}><X size={24} /></button>
                <button className="py-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-xl font-black text-slate-700 transition-colors active:scale-90" onClick={() => press(0)}>0</button>
                <button className="py-3 flex items-center justify-center text-slate-300 hover:text-slate-500" aria-label="지우기" onClick={() => setBuffer(buffer.slice(0, -1))}><Delete size={20} /></button>
              </div>
              {error && <div className="text-rose-500 mt-4 text-sm font-bold">PIN 번호가 올바르지 않습니다.</div>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
