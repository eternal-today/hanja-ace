import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, CheckCircle2, Delete, Flame, Home, Lightbulb, Loader2, RotateCcw, Sparkles, Star, Volume2, XCircle } from 'lucide-react';
import { Question, RoundItem, RoundKind, RoundRecord } from '../types';
import { GROUP_BY_ID, HANJA, charsOfStage, hunEum } from '../data';
import { actions, balanceOf, getState, useStore } from '../engine/store';
import { answerText, chooseType, freeHints, hintLines, makeQuestion, planRound, poolChars, questionText, wordsFor } from '../engine/quiz';
import { Tone, applyAnswer, toneOf } from '../engine/srs';
import { fireConfetti, speak, toast } from '../components/ui';

const KIND_NAME: Record<RoundKind, string> = { daily: '오늘의 한 판', hun: '훈음 맞히기', word: '낱말 읽기', listen: '듣고 고르기', check: '실력 확인' };

function buildRound(kind: RoundKind) {
  const s = getState();
  const plan = planRound(s.config, s.cards, kind);
  const pool = kind === 'check' ? charsOfStage('8급') : poolChars(s.config);
  const candidates = [...new Set([...pool, ...Object.keys(s.cards)])];
  const allowed = new Set(candidates);
  const config = kind === 'check' ? { ...s.config, difficulty: 2 } : s.config;
  const ctx = { config, candidates, allowed, usedWords: new Set<string>() };
  const met = new Set<string>();
  const questions: Question[] = plan.targets.map(c => {
    const first = plan.newChars.includes(c) && !met.has(c);
    met.add(c);
    return makeQuestion(c, chooseType(c, kind, ctx, first), ctx, first);
  });
  const tonesBefore: Record<string, Tone> = {};
  for (const c of new Set(plan.targets)) tonesBefore[c] = toneOf(s.cards[c]);
  const newShare = questions.filter(q => plan.newChars.includes(q.c)).length;
  const hard = s.config.difficulty === 3 || (questions.length > 0 && newShare * 2 >= questions.length);
  const free = kind === 'check' ? 0 : freeHints(questions.length, hard);
  return { plan, questions, allowed, tonesBefore, free };
}

interface Props {
  kind: RoundKind;
  onExit: () => void;
  onAgain: () => void;
  onMilestone: (stars: number) => void;
  onOpenShop: () => void;
}

export default function Play({ kind, onExit, onAgain, onMilestone, onOpenShop }: Props) {
  const store = useStore();
  const { config } = store;
  const balance = balanceOf(store);
  const [round] = useState(() => buildRound(kind));
  const { questions, plan, allowed, tonesBefore } = round;

  const [phase, setPhase] = useState<'intro' | 'solving' | 'result'>(plan.newChars.length ? 'intro' : 'solving');
  const [introIdx, setIntroIdx] = useState(0);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [built, setBuilt] = useState<number[]>([]);       // 조립형: 고른 조각 번호
  const [hint, setHint] = useState<string[] | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [freeUsed, setFreeUsed] = useState(0);
  const [paidUsed, setPaidUsed] = useState(0);
  const [askPaid, setAskPaid] = useState(false);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [items, setItems] = useState<RoundItem[]>([]);
  const [record, setRecord] = useState<RoundRecord | null>(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const q = questions[idx];
  const answered = picked !== null;
  const lastOk = answered && items[idx]?.ok;
  const freeLeft = round.free - freeUsed;
  const name = config.childName?.trim();

  // 듣고 고르기: 문제가 나오면 바로 읽어 줌
  useEffect(() => {
    if (phase === 'solving' && q?.type === 'listen') {
      const t = setTimeout(() => speak(hunEum(q.c)), 350);
      return () => clearTimeout(t);
    }
  }, [phase, idx]);

  // ── 문제가 없을 때 ──
  if (!questions.length) {
    const text = kind === 'check' ? '8급 글자는 이미 모두 만났어요!'
      : kind === 'word' ? '낱말이 준비된 글자가 아직 없어요. 다른 놀이를 골라 볼까?'
        : '아직 공부할 글자가 없어요. 부모님 화면에서 묶음을 골라 주세요.';
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="text-6xl">📭</div>
        <p className="text-lg font-bold text-slate-600">{text}</p>
        <button className="btn-primary px-10 py-4 text-lg" onClick={onExit}>홈으로</button>
      </div>
    );
  }

  const finish = async (finalItems: RoundItem[]) => {
    const correct = finalItems.filter(i => i.ok).length;
    const total = finalItems.length;
    const stars = Math.floor(correct / 5);
    const groupNames = [...new Set(finalItems.map(i => {
      const g = GROUP_BY_ID[HANJA[i.c]?.groupId];
      return g ? `${g.stage} ${g.name}` : '';
    }).filter(Boolean))];
    const rec: RoundRecord = {
      ts: Date.now(), date: new Date().toLocaleDateString('ko-KR'), kind, correct, total, stars,
      hintsFree: freeUsed, hintsPaid: paidUsed, groupNames, items: finalItems,
    };
    const hit = actions.addRecord(rec);
    setRecord(rec);
    setPhase('result');
    const pct = total ? Math.round((correct / total) * 100) : 0;
    if (pct === 100) setTimeout(() => fireConfetti('epic'), 300);
    else if (pct >= 80) setTimeout(() => fireConfetti('big'), 300);
    if (hit) setTimeout(() => onMilestone(hit), 1400);

    if (config.geminiKey) {
      setFeedbackLoading(true);
      try {
        const wrong = finalItems.filter(i => !i.ok);
        const who = name ? `"${name}"(이)` : '우리 아이';
        const detail = wrong.slice(0, 6).map(i => `${i.q} (정답 ${i.ans}, 아이 답 ${i.val || '무응답'})`).join(' / ');
        const prompt = wrong.length
          ? `${who}의 오늘 한자 공부 결과야. 총 ${total}문제 중 ${correct}개 정답.\n틀린 문제: ${detail}\n\n아이 눈높이(반말)로 따뜻하게 피드백해 줘. 1) 잘한 점을 구체적으로 칭찬하고 2) 틀린 글자 가운데 딱 하나만 골라 다음에 다시 보자고 말하고 3) 힘나는 말로 마무리해. 이모지 적당히, 3문장. 절대 혼내지 마. 한자의 뜻이나 유래를 새로 지어내서 설명하지 말고, 위에 적힌 정답만 사용해.`
          : `${who}가 오늘 한자 ${total}문제를 전부 맞혔어! 이름을 불러 주면서 아주 신나고 따뜻하게 칭찬해 줘. 반말, 이모지 듬뿍, 2문장. 한자의 뜻이나 유래를 새로 지어내서 설명하지는 마.`;
        const { callGemini } = await import('../geminiUtils');   // 키가 있을 때만 내려받음
        const text = await callGemini({ apiKey: config.geminiKey, prompt, thinkingBudget: 128 });
        setFeedback(text.trim());
      } catch {
        setFeedback('');
      } finally {
        setFeedbackLoading(false);
      }
    }
  };

  const goNext = (finalItems: RoundItem[]) => {
    if (idx + 1 >= questions.length) { finish(finalItems); return; }
    setIdx(idx + 1);
    setPicked(null); setBuilt([]); setHint(null); setRemoved([]);
  };

  const answer = (value: string) => {
    if (answered) return;
    const ok = value === q.answer;
    const hinted = hint !== null;
    const cards = { ...getState().cards };
    cards[q.c] = applyAnswer(cards[q.c], ok, hinted, kind === 'check');
    actions.setCards(cards);
    if (!ok && q.type !== 'word' && HANJA[value]) actions.addConfusion(q.c, value);

    const shown = q.type === 'word' ? value : q.type === 'hun' ? (HANJA[value] ? hunEum(value) : value) : value;
    const item: RoundItem = { c: q.c, type: q.type, q: questionText(q), ans: answerText(q), val: shown, ok, hint: hinted };
    const next = [...items, item];
    setItems(next);
    setPicked(value);
    const nc = ok ? combo + 1 : 0;
    setCombo(nc);
    if (nc > maxCombo) setMaxCombo(nc);
    if (ok) timerRef.current = setTimeout(() => goNext(next), 1000);
  };

  const showHint = (paid: boolean) => {
    const lines = hintLines(q, allowed);
    setHint(lines);
    if (q.options.length > 2) {
      const wrong = q.options.filter(o => o.key !== q.answer).map(o => o.key);
      setRemoved([wrong[Math.floor(Math.random() * wrong.length)]]);
    }
    if (paid) setPaidUsed(n => n + 1); else setFreeUsed(n => n + 1);
  };

  const pressHint = () => {
    if (answered || hint || kind === 'check') return;
    if (freeLeft > 0) { showHint(false); return; }
    if (balance < config.hintCost) { toast('별이 모자라요. 스스로 풀어 볼까? 💪'); return; }
    setAskPaid(true);
  };

  const leave = () => {
    if (phase === 'solving' && items.length > 0) {
      if (kind === 'check') { finish(items); return; }
      if (!window.confirm('지금 나가면 이번 판의 별을 받지 못해요. 나갈까요?')) return;
    }
    onExit();
  };

  // ════════ 새 글자 미리 보기 ════════
  if (phase === 'intro') {
    const c = plan.newChars[introIdx];
    const h = HANJA[c];
    const w = wordsFor(c, allowed)[0];
    const last = introIdx + 1 >= plan.newChars.length;
    return (
      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-md text-center space-y-5">
          <div className="text-sm font-black text-brand-600 flex items-center justify-center gap-2">
            <Sparkles size={16} />오늘 처음 만나는 글자 {introIdx + 1} / {plan.newChars.length}
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={c} initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }}
              className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-brand-100 p-8 space-y-4">
              <div className="hanja text-[clamp(6rem,30vmin,10rem)] text-slate-900">{c}</div>
              <button onClick={() => speak(hunEum(c))}
                className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 font-black text-2xl px-6 py-3 rounded-2xl active:scale-95">
                <Volume2 size={22} />{h.hun} <span className="text-brand-500">{h.eum}</span>
              </button>
              <div className="text-xs font-bold text-slate-400">{h.std ? `시험에서는 “${h.std} ${h.eum}” · ` : ''}모두 {h.strokes}획{h.alt ? ` · ${h.alt}(으)로도 읽어요` : ''}</div>
              {w && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-left">
                  <div className="font-black text-amber-800"><span className="hanja text-2xl mr-2">{w.w}</span>{w.r}</div>
                  <div className="text-sm font-bold text-amber-700 mt-1">{w.gloss}</div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          <button className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2"
            onClick={() => (last ? setPhase('solving') : setIntroIdx(introIdx + 1))}>
            {last ? '문제 풀러 가기' : '다음 글자'}<ArrowRight size={22} />
          </button>
          <button className="text-sm font-bold text-slate-400" onClick={onExit}>홈으로</button>
        </div>
      </div>
    );
  }

  // ════════ 결과 ════════
  if (phase === 'result' && record) {
    const pct = record.total ? Math.round((record.correct / record.total) * 100) : 0;
    const cfg = pct >= 90 ? { emoji: '🏆', msg: '완벽해요!', sub: '오늘의 한자 공부를 멋지게 끝냈어!', color: 'bg-amber-100' }
      : pct >= 70 ? { emoji: '🌟', msg: '잘했어요!', sub: '정말 열심히 풀었구나!', color: 'bg-brand-100' }
        : pct >= 50 ? { emoji: '💪', msg: '조금만 더!', sub: '틀린 글자는 곧 다시 만나게 돼!', color: 'bg-orange-100' }
          : { emoji: '📚', msg: '다시 도전!', sub: '천천히 다시 해 보면 잘할 수 있어!', color: 'bg-rose-100' };
    const cards = store.cards;
    const uniq = [...new Set(record.items.map(i => i.c))];
    const rank: Record<Tone, number> = { none: 0, grey: 1, color: 2, gold: 3 };
    const upGold = uniq.filter(c => toneOf(cards[c]) === 'gold' && tonesBefore[c] !== 'gold');
    const upColor = uniq.filter(c => toneOf(cards[c]) === 'color' && rank[tonesBefore[c]] < 2);
    const spent = record.hintsPaid * config.hintCost;
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-lg landscape:max-w-5xl mx-auto space-y-6 landscape:space-y-0 landscape:grid landscape:grid-cols-2 landscape:gap-6 landscape:items-start">
          <div className="bg-white rounded-[2.5rem] p-7 shadow-2xl shadow-slate-200/50 border border-slate-100 space-y-5 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 10, delay: 0.1 }}
              className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center text-4xl ${cfg.color}`}>{cfg.emoji}</motion.div>
            <div>
              <h2 className="text-3xl font-black text-slate-900 font-display">{cfg.msg}</h2>
              <p className="text-slate-500 font-medium mt-1">{cfg.sub}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 p-3 rounded-3xl">
                <div className="text-2xl font-black text-brand-600 font-display">{record.correct}<span className="text-xs text-slate-400">/{record.total}</span></div>
                <div className="text-[11px] font-bold text-slate-400 mt-1">정답</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-3xl">
                <div className="text-2xl font-black text-amber-500 font-display flex items-center justify-center gap-1"><Star size={20} className="fill-amber-500" />+{record.stars}</div>
                <div className="text-[11px] font-bold text-slate-400 mt-1">번 별</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-3xl">
                <div className="text-2xl font-black text-orange-500 font-display flex items-center justify-center gap-1"><Flame size={20} />{maxCombo}</div>
                <div className="text-[11px] font-bold text-slate-400 mt-1">최고 콤보</div>
              </div>
            </div>
            <button onClick={onOpenShop} className="w-full bg-amber-50 border border-amber-100 rounded-3xl p-4 text-left active:scale-[0.98] transition-transform">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-amber-700">지금 가진 별</span>
                <span className="flex items-center gap-1.5 text-2xl font-black text-amber-600 font-display"><Star size={22} className="fill-amber-500 text-amber-500" />{balance}</span>
              </div>
              <p className="text-xs font-bold text-amber-600 mt-1">
                이번 판: 번 별 {record.stars}개{spent > 0 ? ` · 힌트에 쓴 별 ${spent}개` : ''}
                <span className="text-amber-400 font-medium"> · 5문제 맞힐 때마다 별 1개</span>
              </p>
            </button>
            {(upGold.length > 0 || upColor.length > 0) && (
              <div className="bg-brand-50 border border-brand-100 rounded-3xl p-4 text-left space-y-2">
                {upGold.length > 0 && (
                  <div className="text-sm font-black text-amber-600">✨ 금테가 된 글자 <span className="hanja text-xl text-slate-800 ml-1 tracking-widest">{upGold.join('')}</span></div>
                )}
                {upColor.length > 0 && (
                  <div className="text-sm font-black text-brand-700">🎨 색이 칠해진 글자 <span className="hanja text-xl text-slate-800 ml-1 tracking-widest">{upColor.join('')}</span></div>
                )}
              </div>
            )}
            <AnimatePresence>
              {(feedback || feedbackLoading) && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="p-5 bg-gradient-to-br from-brand-50 to-brand-100/50 rounded-[2rem] text-brand-800 font-bold border border-brand-100 text-left">
                  {feedbackLoading
                    ? <div className="flex items-center justify-center gap-2 text-brand-600"><Loader2 className="animate-spin" size={20} /><span>선생님이 오늘 공부를 살펴보고 있어요...</span></div>
                    : <p className="leading-relaxed whitespace-pre-wrap">{feedback}</p>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-[2rem] p-5 border border-slate-100 shadow-sm text-left">
              <h4 className="text-sm font-black text-slate-800 mb-3">문제별 결과</h4>
              <div className="grid gap-2 max-h-72 overflow-y-auto pr-1">
                {record.items.map((it, i) => (
                  <div key={i} className={`p-3 rounded-xl border flex justify-between items-center gap-3 ${it.ok ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="hanja text-2xl text-slate-800 w-8 text-center shrink-0">{it.c}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-black text-slate-700 truncate">{it.ans}</div>
                        <div className="text-[11px] font-bold text-slate-400 truncate">{it.q}{it.hint ? ' · 힌트 봄' : ''}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!it.ok && <span className="text-xs font-black text-rose-600">{it.val || '-'}</span>}
                      {it.ok ? <CheckCircle2 size={18} className="text-emerald-500" /> : <XCircle size={18} className="text-rose-500" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pb-4">
              {kind !== 'check' && (
                <button className="btn-primary flex-1 py-5 text-lg flex items-center justify-center gap-2" onClick={onAgain}>
                  <RotateCcw size={20} /><span>한 판 더</span>
                </button>
              )}
              <button className={`${kind === 'check' ? 'btn-primary' : 'btn-secondary'} flex-1 py-5 text-lg flex items-center justify-center gap-2`} onClick={onExit}>
                <Home size={20} /><span>홈으로</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ════════ 문제 풀기 ════════
  const h = HANJA[q.c];
  const caption = q.type === 'hun' ? '이 한자의 뜻과 소리는?'
    : q.type === 'pick' ? '알맞은 한자를 골라요'
      : q.type === 'listen' ? '잘 듣고 알맞은 한자를 골라요'
        : '색칠된 낱말은 어떻게 읽을까요?';
  const builtText = built.map(i => q.tiles![i]).join('');
  const needLen = q.assemble ? Array.from(q.answer).length : 0;

  return (
    <div className="flex flex-col h-full max-w-2xl landscape:max-w-6xl mx-auto w-full">
      {/* 진행바 */}
      <div className="shrink-0 px-4 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <button onClick={leave} aria-label="나가기"
            className="shrink-0 w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 text-slate-400">
            <Home size={16} />
          </button>
          <div className="bg-slate-200 h-2.5 flex-1 rounded-full overflow-hidden">
            <motion.div className="bg-gradient-to-r from-brand-500 to-brand-400 h-full rounded-full"
              initial={{ width: 0 }} animate={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
          </div>
          <AnimatePresence>
            {combo >= 2 && (
              <motion.span key={combo} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                className="shrink-0 flex items-center gap-1 bg-orange-100 text-orange-600 font-black text-xs px-2.5 py-1 rounded-full">
                <Flame size={12} /> {combo}
              </motion.span>
            )}
          </AnimatePresence>
          <span className="shrink-0 flex items-center gap-1 text-xs font-black text-amber-600"><Star size={14} className="fill-amber-400 text-amber-400" />{balance}</span>
          <span className="shrink-0 text-xs font-black text-slate-400">{idx + 1}/{questions.length}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col landscape:flex-row">
        {/* 문제 카드 */}
        <div className="flex-1 min-h-0 min-w-0 px-4 py-2 landscape:pr-2 landscape:pb-4">
          <div className="w-full h-full bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col items-center justify-center px-5 py-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-brand-500/10" />
            <div className="absolute top-4 left-5 right-5 flex items-center justify-between text-xs font-black">
              <span className="text-slate-400">{KIND_NAME[kind]}</span>
              {q.isNew && <span className="bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full">새 글자</span>}
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={idx} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}
                className="flex flex-col items-center justify-center gap-3 w-full text-center">
                <div className="text-sm font-bold text-slate-500">{caption}</div>

                {q.type === 'hun' && <div className="hanja text-[clamp(5rem,26vmin,11rem)] text-slate-900">{q.c}</div>}

                {q.type === 'pick' && (
                  <div className="text-[clamp(2.25rem,9vmin,4rem)] font-black text-slate-900 font-display">
                    {h.hun} <span className="text-brand-600">{h.eum}</span>
                  </div>
                )}

                {q.type === 'listen' && (
                  <button onClick={() => speak(hunEum(q.c))} aria-label="다시 듣기"
                    className="w-32 h-32 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white flex flex-col items-center justify-center gap-1 shadow-xl shadow-brand-200 active:scale-95 transition-transform">
                    <Volume2 size={48} />
                    <span className="text-xs font-black">다시 듣기</span>
                  </button>
                )}

                {q.type === 'word' && q.word && (
                  <div className="space-y-4 w-full">
                    <p className="text-[clamp(1.25rem,4.2vmin,1.9rem)] font-bold text-slate-800 leading-relaxed break-keep">
                      {q.word.sent.split(q.word.w).map((part, i, arr) => (
                        <React.Fragment key={i}>
                          {part}
                          {i < arr.length - 1 && <mark className="hanja bg-brand-100 text-brand-800 rounded-lg px-1.5 py-0.5 mx-0.5 text-[1.3em]">{q.word!.w}</mark>}
                        </React.Fragment>
                      ))}
                    </p>
                    {q.assemble && (
                      <div className="flex items-center justify-center gap-2 min-h-[4rem]">
                        {Array.from({ length: needLen }).map((_, i) => (
                          <button key={i} disabled={answered || built[i] === undefined}
                            onClick={() => setBuilt(built.filter((_, k) => k !== i))}
                            className={`w-14 h-16 rounded-2xl border-b-4 text-3xl font-black font-display flex items-center justify-center ${
                              answered ? (lastOk ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-rose-500 bg-rose-50 text-rose-600')
                                : built[i] !== undefined ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-slate-200 bg-slate-50 text-slate-300'}`}>
                            {built[i] !== undefined ? q.tiles![built[i]] : '?'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 답한 뒤: 정답 알려 주기 */}
                {answered && (
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`px-5 py-3 rounded-2xl font-black ${lastOk ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    <div className="text-sm">{lastOk ? (combo >= 5 ? `${combo}연속 정답! 불타오른다! 🔥` : combo >= 3 ? `${combo}연속! 대단해! ⚡` : '정답이야! 🌟') : '아까비! 정답을 같이 볼까? 💪'}</div>
                    <div className="mt-1 text-lg text-slate-800">
                      {q.type === 'word' && q.word
                        ? <><span className="hanja text-2xl mr-2">{q.word.w}</span>{q.word.r}<span className="block text-sm font-bold text-slate-500 mt-0.5">{q.word.gloss}</span></>
                        : <><span className="hanja text-2xl mr-2">{q.c}</span>{h.hun} {h.eum}{h.std && <span className="block text-xs font-bold text-slate-500 mt-0.5">시험에서는 “{h.std} {h.eum}”</span>}</>}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* 힌트 */}
            <AnimatePresence>
              {hint && !answered && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                  className="absolute inset-x-3 bottom-3 bg-amber-50 rounded-2xl border-2 border-amber-200 p-3 shadow-lg z-20 text-left space-y-1">
                  {hint.map((line, i) => (
                    <div key={i} className={`font-bold text-sm ${i === 0 ? 'text-amber-800 font-black' : 'text-amber-700'}`}>{i === 0 ? '💡 ' : ''}{line}</div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 보기와 버튼 */}
        <div className="shrink-0 px-4 pb-4 pt-1 space-y-2 landscape:w-[44%] landscape:max-w-lg landscape:pl-2 landscape:pt-2 landscape:flex landscape:flex-col landscape:justify-center">
          {q.assemble ? (
            <>
              <div className="grid grid-cols-4 gap-2">
                {q.tiles!.map((t, i) => {
                  const used = built.includes(i);
                  return (
                    <button key={i} disabled={answered || used || built.length >= needLen}
                      onClick={() => setBuilt([...built, i])}
                      className={`rounded-2xl border-2 py-4 text-2xl font-black font-display transition-all active:scale-90 ${used ? 'bg-slate-100 border-slate-100 text-slate-300' : 'bg-white border-slate-200 text-slate-800 shadow-sm'}`}>
                      {t}
                    </button>
                  );
                })}
              </div>
              {!answered && (
                <div className="flex gap-2">
                  <button className="btn-secondary shrink-0 px-4 py-3.5" aria-label="지우기" onClick={() => setBuilt(built.slice(0, -1))} disabled={!built.length}><Delete size={20} /></button>
                  <button className="btn-primary flex-1 py-3.5 text-lg flex items-center justify-center gap-2"
                    disabled={built.length !== needLen} onClick={() => answer(builtText)}>
                    <span>정답 확인</span><ArrowRight size={22} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className={`grid gap-2.5 ${q.options.length === 3 && !q.options[0].isHanja ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {q.options.map(o => {
                const isAns = o.key === q.answer;
                const isPicked = o.key === picked;
                const gone = removed.includes(o.key) && !answered;
                const tone = answered
                  ? isAns ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                    : isPicked ? 'bg-rose-50 border-rose-400 text-rose-600' : 'bg-white border-slate-100 text-slate-300'
                  : gone ? 'bg-slate-50 border-slate-100 text-slate-200'
                    : 'bg-white border-slate-200 text-slate-800 shadow-sm active:scale-95 active:bg-brand-50 active:border-brand-300';
                return (
                  <button key={o.key} disabled={answered || gone} onClick={() => answer(o.key)}
                    className={`relative rounded-3xl border-2 transition-all flex items-center justify-center ${o.isHanja ? 'hanja text-[clamp(3rem,13vmin,5rem)] py-4 landscape:py-6' : 'text-[clamp(1.15rem,4.6vmin,1.75rem)] font-black py-5 landscape:py-7 px-2'} ${tone}`}>
                    {o.label}
                    {answered && isAns && <CheckCircle2 size={22} className="absolute top-2 right-2 text-emerald-500" />}
                    {answered && isPicked && !isAns && <XCircle size={22} className="absolute top-2 right-2 text-rose-500" />}
                  </button>
                );
              })}
            </div>
          )}

          {!answered && kind !== 'check' && (
            <button onClick={pressHint} disabled={!!hint}
              className="btn-secondary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-40">
              <Lightbulb size={20} className="text-amber-500" />
              <span className="text-sm">힌트</span>
              {freeLeft > 0
                ? <span className="flex items-center gap-0.5">{Array.from({ length: round.free }).map((_, i) => (
                  <span key={i} className={`w-2.5 h-2.5 rounded-full ${i < freeLeft ? 'bg-amber-400' : 'bg-slate-200'}`} />
                ))}</span>
                : <span className="flex items-center gap-0.5 text-xs font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full"><Star size={12} className="fill-amber-500 text-amber-500" />{config.hintCost}개</span>}
            </button>
          )}
          {!answered && kind === 'check' && (
            <button onClick={leave} className="btn-secondary w-full py-3 text-sm">여기까지만 할래요</button>
          )}
          {answered && !lastOk && (
            <button className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2" onClick={() => goNext(items)}>
              <span>알겠어요</span><ArrowRight size={22} />
            </button>
          )}
        </div>
      </div>

      {/* 별을 쓰는 힌트 확인 */}
      <AnimatePresence>
        {askPaid && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setAskPaid(false)}>
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8, opacity: 0 }} onClick={e => e.stopPropagation()}
              className="bg-white rounded-[2rem] p-7 max-w-xs w-full text-center shadow-2xl space-y-4">
              <div className="text-5xl">💡</div>
              <h3 className="text-xl font-black text-slate-900 font-display">별 {config.hintCost}개를 쓰고 힌트를 볼까?</h3>
              <p className="text-sm font-bold text-slate-500">기본 힌트를 다 썼어요. 지금 가진 별은 {balance}개예요.</p>
              <div className="flex gap-2">
                <button className="btn-secondary flex-1 py-3" onClick={() => setAskPaid(false)}>스스로 풀래</button>
                <button className="btn-primary flex-1 py-3" onClick={() => {
                  setAskPaid(false);
                  if (actions.spend('hint', config.hintCost, questionText(q))) showHint(true);
                  else toast('별이 모자라요.');
                }}>힌트 볼래</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
