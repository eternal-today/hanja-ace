import React, { useState } from 'react';
import { ChevronLeft, Volume2 } from 'lucide-react';
import { GROUPS, HANJA, STAGES, STAGES_WITH_WORDS, WORDS_BY_CHAR, charsOfStage, hunEum } from '../data';
import { useStore } from '../engine/store';
import { MAX_BOX, Tone, dayIndex, toneOf } from '../engine/srs';
import { CloseButton, Sheet, speak } from '../components/ui';

const TONE_CLASS: Record<Tone, string> = {
  none: 'bg-slate-100 border-slate-100 text-slate-300',
  grey: 'bg-white border-slate-300 text-slate-500',
  color: 'bg-brand-50 border-brand-300 text-brand-800 shadow-sm',
  gold: 'bg-gradient-to-br from-amber-50 to-yellow-100 border-amber-400 text-slate-900 shadow-md shadow-amber-200/60 ring-2 ring-amber-200',
};

export default function Dogam({ onBack }: { onBack: () => void }) {
  const { cards, config } = useStore();
  const firstStage = STAGES.find(st => config.groupIds.some(id => id.startsWith(st + '-'))) || '8급';
  const [stage, setStage] = useState(firstStage);
  const [open, setOpen] = useState<string | null>(null);

  const chars = charsOfStage(stage);
  const tones = chars.map(c => toneOf(cards[c]));
  const count = (t: Tone) => tones.filter(x => x === t).length;
  const today = dayIndex();
  const h = open ? HANJA[open] : null;
  const card = open ? cards[open] : undefined;
  const words = open ? (WORDS_BY_CHAR[open] || []).slice(0, 4) : [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-brand-50/95 backdrop-blur px-5 pt-5 pb-3 space-y-3">
        <div className="flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={onBack} aria-label="뒤로"
            className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 text-slate-500"><ChevronLeft size={22} /></button>
          <h2 className="text-2xl font-black text-slate-900 font-display flex-1">한자 도감</h2>
          <div className="text-xs font-bold text-slate-500 text-right leading-relaxed">
            <span className="text-amber-600">금테 {count('gold')}</span> · <span className="text-brand-600">색 {count('color')}</span> · 만남 {count('grey')}<br />전체 {chars.length}자
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto max-w-5xl mx-auto pb-1">
          {STAGES.map(st => (
            <button key={st} onClick={() => setStage(st)}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-black border-2 transition-all ${stage === st ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-100 text-slate-500'}`}>
              {st}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-10 max-w-5xl mx-auto space-y-5">
        <p className="text-xs font-bold text-slate-400">
          처음 만난 글자는 회색, 잘 맞히면 색이 칠해지고, 오래 기억하면 금테가 돼요.
          {!STAGES_WITH_WORDS.has(stage) && ' 이 단계는 낱말이 아직 준비 중이라 훈음 문제만 나와요.'}
        </p>
        {GROUPS.filter(g => g.stage === stage).map(g => (
          <section key={g.id}>
            <h3 className="text-sm font-black text-slate-700 mb-2">{g.name}</h3>
            <div className="grid grid-cols-5 landscape:grid-cols-10 gap-2">
              {g.chars.map(c => {
                const t = toneOf(cards[c]);
                return (
                  <button key={c} onClick={() => setOpen(c)}
                    className={`relative aspect-square rounded-2xl border-2 flex items-center justify-center hanja text-[clamp(1.5rem,6vmin,2.5rem)] active:scale-90 transition-transform ${TONE_CLASS[t]}`}>
                    {c}
                    {t === 'gold' && <span className="absolute -top-1.5 -right-1.5 text-sm">✨</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Sheet open={!!open} onClose={() => setOpen(null)}>
        {h && (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className={`w-28 h-28 rounded-3xl border-2 flex items-center justify-center hanja text-7xl shrink-0 ${TONE_CLASS[toneOf(card)]}`}>{h.c}</div>
              <div className="flex-1 min-w-0 pt-1">
                <button onClick={() => speak(hunEum(h.c))} className="flex items-center gap-2 text-2xl font-black text-slate-900 active:scale-95">
                  <Volume2 size={22} className="text-brand-500 shrink-0" />{h.hun} <span className="text-brand-600">{h.eum}</span>
                </button>
                <div className="text-xs font-bold text-slate-400 mt-2 leading-relaxed">
                  {h.level} · 모두 {h.strokes}획
                  {h.std && <><br />시험 표준 훈음: {h.std} {h.eum}</>}
                  {h.hunFull && <><br />뜻: {h.hunFull.split('·').join(', ')}</>}
                  {h.alt && <><br />다르게 읽으면: {h.alt}</>}
                </div>
              </div>
              <CloseButton onClick={() => setOpen(null)} />
            </div>

            <div className="bg-slate-50 rounded-2xl p-4">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
                <span>기억 상자</span>
                <span>
                  {!card ? '아직 만나지 않았어요'
                    : card.box >= MAX_BOX ? '금테 완성!'
                      : card.due <= today ? '오늘 다시 만날 차례예요' : `${card.due - today}일 뒤에 다시 만나요`}
                </span>
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map(b => (
                  <div key={b} className={`h-3 flex-1 rounded-full ${card && card.box >= b ? (b === 5 ? 'bg-amber-400' : b >= 3 ? 'bg-brand-400' : 'bg-slate-400') : 'bg-slate-200'}`} />
                ))}
              </div>
            </div>

            {words.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-black text-slate-800">이 글자가 들어간 낱말</h4>
                {words.map(w => (
                  <div key={w.w} className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
                    <div className="font-black text-amber-900"><span className="hanja text-xl mr-2">{w.w}</span>{w.r}</div>
                    <div className="text-sm font-bold text-amber-700">{w.gloss}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
