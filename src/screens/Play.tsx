import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, CheckCircle2, Delete, Flame, Home, Lightbulb, Loader2, RotateCcw, Sparkles, Star, Volume2, XCircle } from 'lucide-react';
import { Question, RoundItem, RoundKind, RoundRecord } from '../types';
import { GROUP_BY_ID, HANJA, charsOfStage, hunEum } from '../data';
import { Milestone, actions, getState, useStore } from '../engine/store';
import { HINT_COST, useWallet } from '../ace/wallet';
import { paidRound } from '../ace/playground';
import { geminiKey } from '../ace/settings';
import { answerText, examHunEum, freeHints, hintLines, isRight, nextQuestion, planRound, poolChars, questionText, shownAnswer, shuffle, wordsFor } from '../engine/quiz';
import { StrokeChar, StrokeSteps, loadStrokes } from '../components/StrokeChar';
import { Tone, applyAnswer, toneOf } from '../engine/srs';
import { fireConfetti, speak, tap, toast } from '../components/ui';
import { SavedRound, clearRound, saveRound } from '../engine/resume';

const KIND_NAME: Record<RoundKind, string> = { daily: '오늘의 한 판', hun: '뜻·소리 고르기', word: '낱말 읽기', listen: '듣고 고르기', write: '훈음 쓰기', order: '필순', check: '실력 확인' };

function buildRound(kind: RoundKind) {
  const s = getState();
  const plan = planRound(s.config, s.cards, kind);
  const pool = kind === 'check' ? charsOfStage('8급') : poolChars(s.config);
  // 문제와 낱말에는 "이미 만난 글자 + 이번 판의 새 글자"만 씀. 아직 못 만난 글자는 나오지 않음.
  const known = kind === 'check' ? pool : [...new Set([...Object.keys(s.cards), ...plan.newChars])];
  const allowed = new Set(known);
  // 틀린 보기는 만난 글자에서 고르되, 만난 글자가 너무 적은 처음 며칠은 범위 안 글자를 빌려 씀
  const candidates = known.length >= 8 ? known : [...new Set([...known, ...pool])];
  const config = kind === 'check' ? { ...s.config, difficulty: 2 } : s.config;
  const wide = [...new Set([...known, ...pool])];   // 비슷한 보기를 찾는 범위
  const ctx = { config, candidates, wide, allowed, usedWords: new Set<string>(), used: new Set<string>() };
  const met = new Set<string>();
  const questions: Question[] = [];
  for (const c of plan.targets) {
    const first = plan.newChars.includes(c) && !met.has(c);
    met.add(c);
    const q = nextQuestion(c, kind, ctx, first);   // 한 판에서 같은 문제는 다시 나오지 않음
    if (q) questions.push(q);
  }
  const tonesBefore: Record<string, Tone> = {};
  for (const c of new Set(plan.targets)) tonesBefore[c] = toneOf(s.cards[c]);
  const newShare = questions.filter(q => plan.newChars.includes(q.c)).length;
  const hard = s.config.difficulty === 3 || (questions.length > 0 && newShare * 2 >= questions.length);
  const free = kind === 'check' ? 0 : freeHints(questions.length, hard);
  return { plan, questions, allowed, tonesBefore, free };
}

/** 저장해 둔 판을 그대로 되살림 */
function restoreRound(r: SavedRound) {
  return {
    plan: { targets: r.questions.map(x => x.c), newChars: r.newChars, dueCount: r.dueCount },
    questions: r.questions, allowed: new Set(r.allowed), tonesBefore: r.tonesBefore, free: r.free,
  };
}

/** 잘못 눌림 방지: 문제가 바뀌거나 조각을 누른 직후 이 시간(ms) 동안은 답이 제출되지 않음 */
const GUARD_MS = 400;

interface Props {
  kind: RoundKind;
  onExit: () => void;
  onAgain: () => void;
  onMilestone: (m: Milestone) => void;
  onOpenShop: () => void;
  resume?: SavedRound | null;                              // 이어서 풀기
  backRef: React.MutableRefObject<null | (() => void)>;    // 기기의 뒤로가기가 눌렸을 때 부를 동작
}

export default function Play({ kind, onExit, onAgain, onMilestone, onOpenShop, resume, backRef }: Props) {
  const store = useStore();
  const { config } = store;
  const balance = useWallet().balance;   // 수학·한자 합산 별
  const [round] = useState(() => (resume ? restoreRound(resume) : buildRound(kind)));
  const { questions, plan, allowed, tonesBefore } = round;

  const [phase, setPhase] = useState<'intro' | 'solving' | 'retry' | 'result'>(!resume && plan.newChars.length ? 'intro' : 'solving');
  const [introIdx, setIntroIdx] = useState(0);
  const [idx, setIdx] = useState(resume ? resume.items.length : 0);
  const [picked, setPicked] = useState<string | null>(null);   // 제출한 답
  const [sel, setSel] = useState<string | null>(null);         // 골라 둔 보기 (아직 제출 전)
  const selAt = useRef(0);
  const [okNow, setOkNow] = useState<boolean | null>(null);     // 방금 낸 답이 맞았는지
  // 틀린 문제 다시 풀기 (별·기록·기억 상자에는 영향 없음)
  const [retryQs, setRetryQs] = useState<Question[]>([]);
  const [rIdx, setRIdx] = useState(0);
  const pending = useRef<{ pct: number; hit: Milestone | null }>({ pct: 0, hit: null });
  const [built, setBuilt] = useState<number[]>([]);       // 조립형: 고른 조각 번호
  const [hint, setHint] = useState<string[] | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [freeUsed, setFreeUsed] = useState(resume?.freeUsed || 0);
  const [paidUsed, setPaidUsed] = useState(resume?.paidUsed || 0);
  const [askQuit, setAskQuit] = useState(false);
  const [askPaid, setAskPaid] = useState(false);
  const [combo, setCombo] = useState(resume?.combo || 0);
  const [maxCombo, setMaxCombo] = useState(resume?.maxCombo || 0);
  const [items, setItems] = useState<RoundItem[]>(resume?.items || []);
  const [record, setRecord] = useState<RoundRecord | null>(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const readyAt = useRef(0);   // 이 시각 전에는 답을 받지 않음
  const tileAt = useRef(0);    // 마지막으로 조각을 누른 시각
  useEffect(() => { readyAt.current = Date.now() + GUARD_MS; }, [idx, rIdx, phase]);

  // 풀 때마다 자동 저장 (앱이 닫혀도 이어서 풀 수 있게)
  useEffect(() => {
    if (phase !== 'solving' || !questions.length) return;
    saveRound({
      ts: Date.now(), kind, questions, newChars: plan.newChars, dueCount: plan.dueCount, allowed: [...allowed],
      tonesBefore, free: round.free, items, freeUsed, paidUsed, combo, maxCombo,
    });
  }, [phase, items, freeUsed, paidUsed]);

  // 기기의 뒤로가기: 풀이 중이면 확인창, 아니면 홈으로
  useEffect(() => {
    backRef.current = () => { if (phase === 'solving') setAskQuit(v => !v); else if (phase === 'retry') enterResult(); else onExit(); };
    return () => { backRef.current = null; };
  });

  const inRetry = phase === 'retry';
  const q = inRetry ? retryQs[rIdx] : questions[idx];
  const builtText = q?.tiles ? built.map(i => q.tiles![i]).join('') : '';
  const needLen = q?.assemble ? Array.from(q.answer).length : 0;
  const answered = picked !== null;
  const lastOk = answered && okNow === true;
  const freeLeft = round.free - freeUsed;
  const name = config.childName?.trim();

  // 필순 문제가 있는 판이면 획 데이터를 미리 내려받음
  useEffect(() => { if (questions.some(x => x.type === 'order')) loadStrokes().catch(() => {}); }, []);

  // 듣고 고르기: 문제가 나오면 바로 읽어 줌
  useEffect(() => {
    if ((phase === 'solving' || phase === 'retry') && q?.type === 'listen') {
      const t = setTimeout(() => speak(hunEum(q.c)), 350);
      return () => clearTimeout(t);
    }
  }, [phase, idx, rIdx]);

  // 이어서 풀기인데 마지막 문제까지 이미 답한 상태로 닫혔던 경우: 바로 결과로
  const resumedDone = useRef(false);
  useEffect(() => {
    if (resume && !resumedDone.current && items.length >= questions.length && questions.length > 0) {
      resumedDone.current = true;
      finish(items);
    }
  }, []);

  // ── 문제가 없을 때 ──
  if (!questions.length) {
    const text = kind === 'check' ? '8급 글자는 이미 모두 만났어요!'
      : kind === 'word' ? '낱말이 준비된 글자가 아직 없어요. 다른 놀이를 골라 볼까?'
        : kind === 'order' ? '필순 문제를 낼 글자를 아직 못 만났어요. 필순 문제는 8급·7급 글자 가운데 일부만 나와요.'
        : '아직 공부할 글자가 없어요. 부모님 화면에서 묶음과 새 글자 수를 확인해 주세요.';
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
    // 찍기 방지: 정답이 40%보다 적은 판은 별 없음 (아무거나 고르면 25~33%)
    const accOk = total === 0 || correct / total >= 0.4;
    // 놀이터 무료 2번 뒤 별을 내고 한 판은 별 없음 (규칙 11번)
    const paid = kind !== 'daily' && kind !== 'check' && paidRound('hanja', kind);
    const stars = accOk && !paid ? Math.floor(correct / 5) : 0;
    const groupNames = [...new Set(finalItems.map(i => {
      const g = GROUP_BY_ID[HANJA[i.c]?.groupId];
      return g ? `${g.stage} ${g.name}` : '';
    }).filter(Boolean))];
    const rec: RoundRecord = {
      ts: Date.now(), date: new Date().toLocaleDateString('ko-KR'), kind, correct, total, stars,
      hintsFree: freeUsed, hintsPaid: paidUsed, groupNames, items: finalItems,
      ...(!accOk && Math.floor(correct / 5) > 0 ? { lowAcc: true } : {}),
      ...(paid ? { paidPlay: true } : {}),
    };
    clearRound();
    const hit = actions.addRecord(rec);
    setRecord(rec);
    const pct = total ? Math.round((correct / total) * 100) : 0;
    pending.current = { pct, hit };
    // 틀린 문제가 있으면 결과 전에 한 번씩 다시 풀어 봄 (별과 기록은 이미 정해졌고 바뀌지 않음)
    const wrongQs = kind === 'check' ? [] : questions.filter((_, i) => finalItems[i] && !finalItems[i].ok);
    if (wrongQs.length) {
      setRetryQs(wrongQs.map(x => ({ ...x, options: x.type === 'order' ? x.options : shuffle(x.options), tiles: x.tiles ? shuffle(x.tiles) : x.tiles, isNew: false })));
      setRIdx(0);
      setPicked(null); setSel(null); setBuilt([]); setHint(null); setRemoved([]); setOkNow(null);
      setPhase('retry');
    } else enterResult();

    const aiKey = geminiKey(config.geminiKey);   // 에이스 홈에 넣은 키가 먼저
    if (aiKey) {
      setFeedbackLoading(true);
      try {
        const wrong = finalItems.filter(i => !i.ok);
        const who = name ? `"${name}"(이)` : '우리 아이';
        const detail = wrong.slice(0, 6).map(i => `${i.q} (정답 ${i.ans}, 아이 답 ${i.val || '무응답'})`).join(' / ');
        const prompt = wrong.length
          ? `${who}의 오늘 한자 공부 결과야. 총 ${total}문제 중 ${correct}개 정답.\n틀린 문제: ${detail}\n\n아이 눈높이(반말)로 따뜻하게 피드백해 줘. 1) 잘한 점을 구체적으로 칭찬하고 2) 틀린 글자 가운데 딱 하나만 골라 다음에 다시 보자고 말하고 3) 힘나는 말로 마무리해. 이모지 적당히, 3문장. 절대 혼내지 마. 한자의 뜻이나 유래를 새로 지어내서 설명하지 말고, 위에 적힌 정답만 사용해.`
          : `${who}가 오늘 한자 ${total}문제를 전부 맞혔어! 이름을 불러 주면서 아주 신나고 따뜻하게 칭찬해 줘. 반말, 이모지 듬뿍, 2문장. 한자의 뜻이나 유래를 새로 지어내서 설명하지는 마.`;
        const { callGemini } = await import('../geminiUtils');   // 키가 있을 때만 내려받음
        const text = await callGemini({ apiKey: aiKey, prompt, thinkingBudget: 128 });
        setFeedback(text.trim());
      } catch {
        setFeedback('');
      } finally {
        setFeedbackLoading(false);
      }
    }
  };

  const enterResult = () => {
    const { pct, hit } = pending.current;
    setPhase('result');
    if (pct === 100) setTimeout(() => fireConfetti('epic'), 300);
    else if (pct >= 80) setTimeout(() => fireConfetti('big'), 300);
    if (hit) setTimeout(() => onMilestone(hit), 1400);
  };

  const goNext = (finalItems: RoundItem[]) => {
    if (inRetry) {
      if (rIdx + 1 >= retryQs.length) { enterResult(); return; }
      setRIdx(rIdx + 1);
      setPicked(null); setSel(null); setBuilt([]); setHint(null); setRemoved([]); setOkNow(null);
      return;
    }
    if (idx + 1 >= questions.length) { finish(finalItems); return; }
    setIdx(idx + 1);
    setOkNow(null);
    setPicked(null); setSel(null); setBuilt([]); setHint(null); setRemoved([]);
  };

  const answer = (value: string) => {
    if (answered || Date.now() < readyAt.current) return;
    readyAt.current = Date.now() + GUARD_MS;
    const ok = isRight(q, value);
    setOkNow(ok);
    if (inRetry) {   // 다시 풀기: 연습만. 별·기록·기억 상자는 그대로
      setPicked(value);
      if (ok) timerRef.current = setTimeout(() => goNext(items), 1000);
      return;
    }
    const hinted = hint !== null;
    const cards = { ...getState().cards };
    cards[q.c] = applyAnswer(cards[q.c], ok, hinted, kind === 'check');
    actions.setCards(cards);
    if (!ok && (q.type === 'hun' || q.type === 'pick' || q.type === 'listen') && HANJA[value]) actions.addConfusion(q.c, value);

    const item: RoundItem = { c: q.c, type: q.type, q: questionText(q), ans: answerText(q), val: shownAnswer(q, value), ok, hint: hinted };
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
      const out = wrong[Math.floor(Math.random() * wrong.length)];
      setRemoved([out]);
      if (sel === out) setSel(null);
    }
    if (paid) setPaidUsed(n => n + 1); else setFreeUsed(n => n + 1);
  };

  const pressHint = () => {
    if (answered || hint || kind === 'check') return;
    if (freeLeft > 0) { showHint(false); return; }
    if (balance < HINT_COST) { toast('별이 모자라요. 스스로 풀어 볼까? 💪'); return; }
    setAskPaid(true);
  };

  /** 화면의 홈 버튼: 풀이 중이면 뒤로가기와 같은 확인창을 거침 */
  const leave = () => { if (phase === 'solving') setAskQuit(true); else if (phase === 'retry') enterResult(); else onExit(); };
  const quit = () => {
    setAskQuit(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (items.length === 0) clearRound();   // 한 문제도 안 풀었으면 남기지 않음
    onExit();
  };
  /** 보기는 누르면 "고르기"만 되고, 정답 확인을 눌러야 제출됨 (잘못 눌러도 바꿀 수 있음) */
  const choose = (key: string) => {
    if (answered || removed.includes(key)) return;
    selAt.current = Date.now();
    setSel(key);
  };
  const submitChoice = () => {
    if (!sel || removed.includes(sel) || Date.now() - selAt.current < GUARD_MS) return;
    answer(sel);
  };
  const pressTile = (i: number) => {
    if (answered || built.includes(i) || built.length >= needLen) return;
    tileAt.current = Date.now();
    setBuilt([...built, i]);
  };
  const submitBuilt = () => {
    if (built.length !== needLen || Date.now() - tileAt.current < GUARD_MS) return;
    answer(builtText);
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
    const spent = record.hintsPaid * HINT_COST;
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
              <p className="text-[11px] font-bold text-amber-500 mt-0.5">모든 과목에서 모은 별을 함께 써요</p>
              {record.paidPlay && (
                <p className="text-xs font-black text-amber-700 mt-2 bg-white rounded-xl px-3 py-2">
                  별을 내고 한 판이라 이번 판은 별이 없어요. 오늘의 한 판에서는 별을 받을 수 있어! ⭐
                </p>
              )}
              {record.lowAcc && (
                <p className="text-xs font-black text-rose-500 mt-2 bg-white rounded-xl px-3 py-2">
                  10문제 중 4문제보다 적게 맞혀서 이번 판은 별이 없어요. 천천히 생각하고 고르면 별을 받을 수 있어! 💪
                </p>
              )}
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
  if (!q) return null;
  const curNo = inRetry ? rIdx + 1 : idx + 1;
  const curTotal = inRetry ? retryQs.length : questions.length;
  const h = HANJA[q.c];
  const caption = q.type === 'hun' ? '이 한자의 뜻과 소리는?'
    : q.type === 'pick' ? '이 뜻을 가진 한자를 골라요'
      : q.type === 'eum' ? '이 한자의 소리(음)는?'
        : q.type === 'write' ? '시험처럼 훈과 음을 만들어요'
          : q.type === 'order' ? '진하게 칠한 획은 몇 번째로 쓸까요?'
      : q.type === 'listen' ? '잘 듣고 알맞은 한자를 골라요'
        : '색칠된 낱말은 어떻게 읽을까요?';

  /** 조립형 답 칸 (훈음 쓰기는 훈과 음 사이를 띄움) */
  const slots = (
    <div className="flex flex-wrap items-center justify-center gap-2 min-h-[4rem]">
      {Array.from({ length: needLen }).map((_, i) => (
        <React.Fragment key={i}>
          {q.split !== undefined && i === q.split && <span className="w-3" />}
          <button disabled={answered || built[i] === undefined}
            {...tap(() => { if (!answered && built[i] !== undefined) setBuilt(built.filter((_, k) => k !== i)); })}
            className={`w-14 h-16 rounded-2xl border-b-4 text-3xl font-black font-display flex items-center justify-center ${
              answered ? (lastOk ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-rose-500 bg-rose-50 text-rose-600')
                : built[i] !== undefined ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-slate-200 bg-slate-50 text-slate-300'}`}>
            {built[i] !== undefined ? q.tiles![built[i]] : '?'}
          </button>
        </React.Fragment>
      ))}
    </div>
  );

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
              initial={{ width: 0 }} animate={{ width: `${(curNo / curTotal) * 100}%` }} />
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
          <span className="shrink-0 text-xs font-black text-slate-400">{curNo}/{curTotal}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col landscape:flex-row">
        {/* 문제 카드 */}
        <div className="flex-1 min-h-0 min-w-0 px-4 py-2 landscape:pr-2 landscape:pb-4">
          <div className="w-full h-full bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col items-center justify-center px-5 py-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-brand-500/10" />
            <div className="absolute top-4 left-5 right-5 flex items-center justify-between text-xs font-black">
              <span className={inRetry ? 'text-rose-500' : 'text-slate-400'}>{inRetry ? '틀린 문제 다시 풀기 · 별과 상관없는 연습이에요' : KIND_NAME[kind]}</span>
              {q.isNew && <span className="bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full">새 글자</span>}
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={inRetry ? `r${rIdx}` : idx} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}
                className="flex flex-col items-center justify-center gap-3 w-full text-center">
                <div className="text-sm font-bold text-slate-500">{caption}</div>

                {(q.type === 'hun' || q.type === 'eum') && <div className="hanja text-[clamp(5rem,26vmin,11rem)] text-slate-900">{q.c}</div>}

                {q.type === 'write' && (
                  <>
                    <div className="hanja text-[clamp(4rem,20vmin,8rem)] text-slate-900 leading-none">{q.c}</div>
                    {slots}
                  </>
                )}

                {q.type === 'order' && (
                  <StrokeChar c={q.c} hi={q.stroke ?? 0} className="w-[clamp(9rem,34vmin,15rem)] h-[clamp(9rem,34vmin,15rem)] text-[clamp(7rem,28vmin,12rem)]" />
                )}

                {q.type === 'pick' && (
                  <div>
                    <div className="text-[clamp(2.5rem,10vmin,4.5rem)] font-black text-slate-900 font-display">{h.hun}</div>
                    {h.std && <div className="text-xs font-bold text-slate-400">시험에서는 “{h.std}”</div>}
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
                    {q.assemble && slots}
                  </div>
                )}

                {/* 답한 뒤: 정답 알려 주기 */}
                {answered && (
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`px-5 py-3 rounded-2xl font-black ${lastOk ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    <div className="text-sm">{lastOk ? (inRetry ? '이번엔 맞혔어! 👍' : combo >= 5 ? `${combo}연속 정답! 불타오른다! 🔥` : combo >= 3 ? `${combo}연속! 대단해! ⚡` : '정답이야! 🌟') : '아까비! 정답을 같이 볼까? 💪'}</div>
                    <div className="mt-1 text-lg text-slate-800">
                      {q.type === 'word' && q.word
                        ? <><span className="hanja text-2xl mr-2">{q.word.w}</span>{q.word.r}<span className="block text-sm font-bold text-slate-500 mt-0.5">{q.word.gloss}</span></>
                        : q.type === 'write'
                          ? <><span className="hanja text-2xl mr-2">{q.c}</span>{examHunEum(q.c)}{h.std && <span className="block text-xs font-bold text-slate-500 mt-0.5">쉬운 말로는 “{h.hun} {h.eum}”</span>}{h.alt && <span className="block text-xs font-bold text-slate-500 mt-0.5">“{h.alt}”도 맞아요</span>}</>
                          : <><span className="hanja text-2xl mr-2">{q.c}</span>{h.hun} {h.eum}{h.std && <span className="block text-xs font-bold text-slate-500 mt-0.5">시험에서는 “{h.std} {h.eum}”</span>}</>}
                      {q.type === 'order' && (
                        <div className="mt-2 space-y-1">
                          <div className="text-sm text-slate-600">진한 획은 <span className="text-amber-600">{answerText(q)}</span>로 써요</div>
                          <StrokeSteps c={q.c} mark={q.stroke ?? 0} />
                        </div>
                      )}
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
                      {...tap(() => pressTile(i))}
                      className={`rounded-2xl border-2 py-4 text-2xl font-black font-display transition-colors select-none ${used ? 'bg-slate-100 border-slate-100 text-slate-300' : 'bg-white border-slate-200 text-slate-800 shadow-sm active:bg-brand-100 active:border-brand-300'}`}>
                      {t}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className={`grid gap-2.5 ${q.type === 'eum' && q.options.length === 3 ? 'grid-cols-3' : q.options.length === 3 && !q.options[0].isHanja && q.type !== 'eum' ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {q.options.map(o => {
                const isAns = o.key === q.answer;
                const isPicked = o.key === picked;
                const gone = removed.includes(o.key) && !answered;
                const tone = answered
                  ? isAns ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                    : isPicked ? 'bg-rose-50 border-rose-400 text-rose-600' : 'bg-white border-slate-100 text-slate-300'
                  : gone ? 'bg-slate-50 border-slate-100 text-slate-200'
                    : o.key === sel ? 'bg-brand-100 border-brand-500 text-brand-900 shadow-md ring-2 ring-brand-200'
                      : 'bg-white border-slate-200 text-slate-800 shadow-sm active:bg-brand-50 active:border-brand-300';
                return (
                  <button key={o.key} disabled={answered || gone} {...tap(() => choose(o.key))}
                    className={`relative rounded-3xl border-2 transition-colors select-none flex items-center justify-center ${o.isHanja ? 'hanja text-[clamp(3rem,13vmin,5rem)] py-4 landscape:py-6' : q.type === 'eum' ? 'text-[clamp(2rem,8vmin,3rem)] font-black py-4 landscape:py-6 px-2' : 'text-[clamp(1.15rem,4.6vmin,1.75rem)] font-black py-5 landscape:py-7 px-2'} ${tone}`}>
                    {o.label}
                    {answered && isAns && <CheckCircle2 size={22} className="absolute top-2 right-2 text-emerald-500" />}
                    {answered && isPicked && !isAns && <XCircle size={22} className="absolute top-2 right-2 text-rose-500" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* 힌트는 왼쪽, 정답 확인은 오른쪽 — 서로 떨어뜨려 잘못 누르지 않게 함 */}
          {!answered && (
            <div className="flex items-stretch gap-6 mt-4 pt-4 border-t-2 border-dashed border-slate-200">
              <div className="w-[26%] shrink-0">
                {kind !== 'check' && !inRetry && (
                  <button onClick={pressHint} disabled={!!hint} aria-label="힌트"
                    className="btn-secondary w-full h-full px-2 py-2 flex flex-col items-center justify-center gap-1 disabled:opacity-40">
                    <span className="flex items-center gap-1 text-sm whitespace-nowrap"><Lightbulb size={18} className="text-amber-500 shrink-0" />힌트</span>
                    {freeLeft > 0
                      ? <span className="flex items-center gap-0.5">{Array.from({ length: round.free }).map((_, i) => (
                        <span key={i} className={`w-2 h-2 rounded-full ${i < freeLeft ? 'bg-amber-400' : 'bg-slate-200'}`} />
                      ))}</span>
                      : <span className="flex items-center gap-0.5 text-[11px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full"><Star size={11} className="fill-amber-500 text-amber-500" />{HINT_COST}개</span>}
                  </button>
                )}
              </div>
              <div className="flex-1 min-w-0 flex gap-2">
                {q.assemble && (
                  <button className="btn-secondary shrink-0 px-4 py-4" aria-label="지우기" onClick={() => setBuilt(built.slice(0, -1))} disabled={!built.length}><Delete size={20} /></button>
                )}
                {q.assemble ? (
                  <button className="btn-primary flex-1 py-4 text-lg flex items-center justify-center gap-2"
                    disabled={built.length !== needLen} onClick={submitBuilt}>
                    <span>정답 확인</span><ArrowRight size={22} />
                  </button>
                ) : (
                  <button className="btn-primary flex-1 py-4 text-lg flex items-center justify-center gap-2" disabled={!sel} onClick={submitChoice}>
                    <span>{sel ? '정답 확인' : '보기를 골라요'}</span>{sel && <ArrowRight size={22} />}
                  </button>
                )}
              </div>
            </div>
          )}

          {!answered && kind === 'check' && (
            <button onClick={() => (items.length ? finish(items) : quit())} className="btn-secondary w-full py-3 mt-3 text-sm">여기까지만 할래요</button>
          )}
          {answered && !lastOk && (
            <button className="btn-primary w-full py-4 mt-3 text-lg flex items-center justify-center gap-2" onClick={() => { if (Date.now() >= readyAt.current) goNext(items); }}>
              <span>알겠어요</span><ArrowRight size={22} />
            </button>
          )}
        </div>
      </div>

      {/* 그만둘지 확인 (홈 버튼, 기기의 뒤로가기) */}
      <AnimatePresence>
        {askQuit && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setAskQuit(false)}>
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8, opacity: 0 }} onClick={e => e.stopPropagation()}
              className="bg-white rounded-[2rem] p-7 max-w-xs w-full text-center shadow-2xl space-y-4">
              <div className="text-5xl">🚪</div>
              <h3 className="text-xl font-black text-slate-900 font-display">풀이를 그만둘까요?</h3>
              <p className="text-sm font-bold text-slate-500 break-keep">
                {items.length > 0 ? '지금까지 푼 문제는 저장돼요. 홈에서 이어서 풀 수 있어요.' : '아직 푼 문제가 없어요.'}
              </p>
              <div className="flex gap-2">
                <button className="btn-secondary flex-1 py-3" onClick={quit}>그만두기</button>
                <button className="btn-primary flex-1 py-3" onClick={() => setAskQuit(false)}>계속 풀기</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 별을 쓰는 힌트 확인 */}
      <AnimatePresence>
        {askPaid && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setAskPaid(false)}>
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8, opacity: 0 }} onClick={e => e.stopPropagation()}
              className="bg-white rounded-[2rem] p-7 max-w-xs w-full text-center shadow-2xl space-y-4">
              <div className="text-5xl">💡</div>
              <h3 className="text-xl font-black text-slate-900 font-display">별 {HINT_COST}개를 쓰고 힌트를 볼까?</h3>
              <p className="text-sm font-bold text-slate-500">기본 힌트를 다 썼어요. 지금 가진 별은 {balance}개예요.</p>
              <div className="flex gap-2">
                <button className="btn-secondary flex-1 py-3" onClick={() => setAskPaid(false)}>스스로 풀래</button>
                <button className="btn-primary flex-1 py-3" onClick={() => {
                  setAskPaid(false);
                  if (actions.spendHint(questionText(q))) showHint(true);
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
