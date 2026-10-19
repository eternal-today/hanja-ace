/**
 * 부모님 화면의 떠 있는 저장 막대 + 저장하지 않고 나갈 때 확인
 * ※ src/ace 폴더는 허브·수학·한자·영어 네 저장소에 똑같이 들어 있음. 고치면 네 곳에 같이 복사.
 *
 *  <AceSaveBar dirty onSave onRevert />  바뀐 설정이 있을 때만 화면 아래에 떠오름
 *  confirmLeave()                        부모님 화면을 나가기 전에 부름. 나가도 되면 true
 *                                        (저장하지 않은 설정이 있으면 "그냥 나갈까요?"를 물음)
 * 막대는 document.body에 그려서, 움직이는 화면 안에 있어도 화면 아래에 붙음
 */
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { RotateCcw } from 'lucide-react';

let unsaved = false;
let revertImpl: (() => void) | null = null;

/** 나가도 되면 true. 그냥 나가면 바뀐 설정은 되돌림 */
export function confirmLeave(): boolean {
  if (!unsaved) return true;
  if (!window.confirm('저장하지 않은 설정이 있어요.\n저장하지 않고 나갈까요?')) return false;
  const r = revertImpl;
  unsaved = false; revertImpl = null;
  if (r) r();
  return true;
}

export function AceSaveBar({ dirty, onSave, onRevert, label = '바뀐 설정이 있어요' }: {
  dirty: boolean; onSave: () => void; onRevert: () => void; label?: string;
}) {
  useEffect(() => {
    unsaved = dirty;
    revertImpl = dirty ? onRevert : null;
    if (!dirty) return;
    // 입력칸으로 스크롤할 때 막대에 가리지 않게
    const root = document.documentElement;
    const prevPad = root.style.scrollPaddingBottom;
    root.style.scrollPaddingBottom = '6rem';
    // 창을 닫거나 새로고침할 때도 한 번 물어봄
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => { window.removeEventListener('beforeunload', onUnload); root.style.scrollPaddingBottom = prevPad; };
  });
  useEffect(() => () => { unsaved = false; revertImpl = null; }, []);
  // 막대가 처음 뜰 때 입력 중인 칸이 가려지면 살짝 올림
  useEffect(() => {
    if (!dirty) return;
    const el = document.activeElement as HTMLElement | null;
    if (el && el !== document.body && el.getBoundingClientRect().bottom > window.innerHeight - 96) {
      window.scrollBy({ top: el.getBoundingClientRect().bottom - window.innerHeight + 112, behavior: 'smooth' });
    }
  }, [dirty]);   // 화면을 떠나면 정리

  return (
    <>
      {/* 막대가 마지막 내용을 가리지 않게 아래 여백 */}
      <div className="h-24" aria-hidden />
      {createPortal(<AnimatePresence>
        {dirty && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            className="fixed bottom-0 inset-x-0 z-[80] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none print:hidden">
            <div role="region" aria-label="설정 저장"
              className="pointer-events-auto max-w-2xl mx-auto bg-slate-900 text-white rounded-2xl shadow-2xl pl-5 pr-2 py-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span className="flex-1 min-w-0 text-sm font-bold truncate">{label}</span>
              <button onClick={onRevert}
                className="shrink-0 flex items-center gap-1 text-sm font-bold text-slate-300 px-3 py-2.5 rounded-xl active:bg-white/10">
                <RotateCcw size={14} />되돌리기
              </button>
              <button onClick={onSave}
                className="shrink-0 bg-white text-slate-900 text-sm font-black px-5 py-2.5 rounded-xl active:scale-95 transition-transform">
                저장하기
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
}
