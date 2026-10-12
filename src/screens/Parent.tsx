import React, { useRef, useState } from 'react';
import {
  Award, Check, CheckCircle2, ChevronLeft, ChevronRight, Database, Gift, History, Home, Lightbulb, Lock,
  Plus, Settings, Smartphone, Sparkles, Star, Trash2, XCircle,
} from 'lucide-react';
import { Config, RoundRecord } from '../types';
import { GROUPS, GROUP_BY_ID, HANJA, STAGES, STAGES_WITH_WORDS, charsOfStage, hunEum } from '../data';
import { MAX_COUNT, MIN_COUNT, actions, earnedStars, getState, useStore } from '../engine/store';
import { HINT_COST, couponState, coupons as aceCoupons, mathWishCoupons, useWallet } from '../ace/wallet';
import { LINKS, goHome } from '../ace/links';
import { hubGeminiKey, maskKey } from '../ace/settings';
import { freeHints, poolChars } from '../engine/quiz';
import { INTERVALS, dayIndex, toneOf } from '../engine/srs';
import { toast } from '../components/ui';

const KIND_LABEL: Record<string, string> = { daily: '오늘의 한 판', hun: '훈음 맞히기', word: '낱말 읽기', listen: '듣고 고르기', check: '실력 확인' };

const Card = ({ children, dim = false }: { children: React.ReactNode; dim?: boolean }) => (
  <section className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5 ${dim ? 'opacity-70 hover:opacity-100 transition-opacity' : ''}`}>{children}</section>
);
const Title = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="flex items-center gap-2 text-slate-900 font-bold">{icon}<h3>{children}</h3></div>
);
const Label = ({ children }: { children: React.ReactNode }) => <label className="text-xs font-bold text-slate-400 tracking-wider block">{children}</label>;
const Stepper = ({ value, min, max, onChange, unit }: { value: number; min: number; max: number; onChange: (n: number) => void; unit: string }) => (
  <div className="flex items-center gap-3">
    <button className="w-11 h-11 rounded-xl border-2 border-slate-200 font-black text-slate-500 active:scale-90 disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
    <span className="font-black text-slate-800 w-16 text-center">{value}{unit}</span>
    <button className="w-11 h-11 rounded-xl border-2 border-slate-200 font-black text-slate-500 active:scale-90 disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
  </div>
);

export default function Parent({ onHome }: { onHome: () => void }) {
  const store = useStore();
  const [tab, setTab] = useState<'settings' | 'chance' | 'records'>('settings');
  const [draft, setDraft] = useState<Config>(store.config);
  const [stage, setStage] = useState(() => STAGES.find(st => store.config.groupIds.some(id => id.startsWith(st + '-'))) || '8급');
  const [newPin, setNewPin] = useState('');
  const [selected, setSelected] = useState<RoundRecord | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { cards } = store;
  const dirty = JSON.stringify({ ...draft, chances: null }) !== JSON.stringify({ ...store.config, chances: null });
  const save = () => {
    if (!draft.groupIds.length) { toast('묶음을 하나 이상 골라 주세요'); return; }
    if (!draft.modes.hun && !draft.modes.word && !draft.modes.listen) { toast('문제 유형을 하나 이상 켜 주세요'); return; }
    actions.saveConfig({ ...draft, chances: getState().config.chances });
    toast('설정이 저장되었습니다!');
  };

  const stageGroups = GROUPS.filter(g => g.stage === stage);
  const toggleGroup = (id: string) => setDraft(d => ({ ...d, groupIds: d.groupIds.includes(id) ? d.groupIds.filter(x => x !== id) : [...d.groupIds, id] }));
  const pool = poolChars(draft);
  const hasWords = STAGES_WITH_WORDS.has(stage);

  // ── 별·쿠폰: 수학과 함께 쓰는 에이스 지갑 ──
  const wallet = useWallet();

  // ── 기록 요약 ──
  const today = dayIndex();
  const savedPool = poolChars(store.config);
  const boxes = [1, 2, 3, 4, 5].map(b => savedPool.filter(c => cards[c]?.box === b).length);
  const unseen = savedPool.filter(c => !cards[c]).length;
  const dueNow = savedPool.filter(c => cards[c] && cards[c].due <= today).length;
  const weak = Object.entries(cards).filter(([, v]) => v.wrong > 0).sort((a, b) => b[1].wrong - a[1].wrong).slice(0, 10);
  const pairs = Object.entries(store.confusions).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const coupons = [...aceCoupons().filter(c => couponState(c) === 'active'), ...mathWishCoupons()];

  const exportBackup = () => {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith('hanja_')) data[k] = localStorage.getItem(k) || '';
    }
    const blob = new Blob([JSON.stringify({ app: 'hanja-ace', at: Date.now(), data }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `한자에이스_백업_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const importBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed?.app !== 'hanja-ace' || !parsed.data) throw new Error('형식');
        if (!window.confirm('이 기기의 한자 에이스 기록·별·쿠폰·설정을 백업 파일의 내용으로 바꿉니다.\n\n계속할까요?')) return;
        Object.keys(localStorage).filter(k => k.startsWith('hanja_')).forEach(k => localStorage.removeItem(k));
        for (const [k, v] of Object.entries(parsed.data as Record<string, string>)) {
          if (k.startsWith('hanja_')) localStorage.setItem(k, v);
        }
        location.reload();
      } catch { toast('한자 에이스 백업 파일이 아니에요'); }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 pb-24">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onHome} aria-label="아이 홈" className="p-2 hover:bg-slate-100 rounded-full transition-colors"><Home size={20} className="text-slate-600" /></button>
          <h2 className="font-bold text-slate-900">부모님 설정</h2>
        </div>
        <div className="bg-trust-100 text-trust-700 text-[10px] font-black px-2 py-1 rounded-md tracking-wider">ADMIN</div>
      </header>

      <nav className="bg-white border-b border-slate-200 px-6 flex gap-6 overflow-x-auto">
        {([['settings', '학습 설정', <Settings size={16} />], ['chance', '찬스와 별', <Gift size={16} />], ['records', '학습 기록', <History size={16} />]] as const).map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`shrink-0 py-4 text-sm font-bold transition-all border-b-2 ${tab === id ? 'border-trust-600 text-trust-600' : 'border-transparent text-slate-400'}`}>
            <div className="flex items-center gap-2">{icon}{label}{id === 'chance' && coupons.length > 0 && <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{coupons.length}</span>}</div>
          </button>
        ))}
      </nav>

      <main className="p-6 max-w-2xl mx-auto">
        {/* ══════════ 학습 설정 ══════════ */}
        {tab === 'settings' && (
          <div className="space-y-6 animate-slide-up">
            <Card>
              <Title icon={<Award size={18} className="text-trust-600" />}>급수와 묶음 선택</Title>
              <p className="text-sm text-slate-500 leading-relaxed">
                한국어문회 기준입니다. 고른 묶음의 글자가 문제에 나오고, 아직 만나지 않은 글자는 묶음 순서대로 조금씩 새로 나옵니다.
                교재로 배운 묶음만 체크하면 교재 진도에 맞출 수 있습니다.
              </p>
              <div className="space-y-2">
                <Label>급수</Label>
                <div className="grid grid-cols-4 gap-2">
                  {STAGES.map(st => {
                    const n = draft.groupIds.filter(id => id.startsWith(st + '-')).length;
                    return (
                      <button key={st} onClick={() => setStage(st)}
                        className={`relative py-2.5 rounded-xl border-2 font-bold text-sm transition-all ${stage === st ? 'bg-trust-600 border-trust-600 text-white' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}>
                        {st}
                        {n > 0 && <span className={`absolute -top-1.5 -right-1.5 text-[10px] font-black px-1.5 py-0.5 rounded-full ${stage === st ? 'bg-white text-trust-700' : 'bg-trust-600 text-white'}`}>{n}</span>}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400">
                  {stage === '7급' ? '7급Ⅱ와 7급의 새 한자 100자를 주제별 10묶음으로 나눴습니다.' : `${stage} 새 한자 ${charsOfStage(stage).length}자`}
                  {!hasWords && ' · 낱말 데이터가 준비 중이라 이 급수 글자는 훈음·듣기 문제로만 나옵니다.'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>묶음 ({stage})</Label>
                <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-xl p-2 space-y-1 bg-slate-50/50">
                  {stageGroups.map(g => {
                    const on = draft.groupIds.includes(g.id);
                    const met = g.chars.filter(c => cards[c]).length;
                    return (
                      <button key={g.id} onClick={() => toggleGroup(g.id)}
                        className={`w-full text-left px-4 py-2.5 rounded-lg transition-all flex items-center justify-between gap-3 ${on ? 'bg-white text-trust-700 shadow-sm border border-trust-100' : 'text-slate-500 hover:bg-white/50 border border-transparent'}`}>
                        <span className="min-w-0">
                          <span className="text-sm font-bold">{g.name}</span>
                          <span className="hanja block text-base tracking-[0.2em] text-slate-400 truncate">{g.chars.join('')}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-bold text-slate-400">{met}/{g.chars.length} 만남</span>
                          {on && <Check size={16} className="text-trust-500" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <button className="text-[11px] font-bold text-trust-600 hover:underline"
                    onClick={() => setDraft(d => ({ ...d, groupIds: [...new Set([...d.groupIds, ...stageGroups.map(g => g.id)])] }))}>이 급수 전체 선택</button>
                  <button className="text-[11px] font-bold text-slate-400 hover:underline"
                    onClick={() => setDraft(d => ({ ...d, groupIds: d.groupIds.filter(id => !id.startsWith(stage + '-')) }))}>이 급수 전체 해제</button>
                  <button className="text-[11px] font-bold text-amber-600 hover:underline"
                    onClick={() => {
                      const chars = stageGroups.filter(g => draft.groupIds.includes(g.id)).flatMap(g => g.chars);
                      if (!chars.length) { toast('먼저 묶음을 골라 주세요'); return; }
                      if (!window.confirm(`${stage}에서 고른 묶음의 글자 ${chars.length}자를 "이미 아는 글자"로 표시합니다.\n도감에 색이 칠해지고 ${INTERVALS[4]}일 뒤 복습으로 나옵니다.\n\n계속할까요?`)) return;
                      actions.markKnown(chars, dayIndex(), INTERVALS[4]);
                      toast(`${chars.length}자를 아는 글자로 표시했어요`);
                    }}>고른 묶음을 "이미 아는 글자"로 표시</button>
                </div>
              </div>
              <div className="bg-trust-50 text-trust-700 text-sm font-bold rounded-xl px-4 py-3">
                지금 고른 범위: {draft.groupIds.length}묶음 · {pool.length}자
                <span className="text-trust-500 font-medium"> (새 글자 {pool.filter(c => !cards[c]).length}자)</span>
              </div>
            </Card>

            <Card>
              <Title icon={<Settings size={18} className="text-trust-600" />}>문제 설정</Title>
              <div className="space-y-3">
                <Label>한 판의 문제 수 ({draft.count}문제)</Label>
                <input type="range" min={MIN_COUNT} max={MAX_COUNT} step={5} value={draft.count}
                  onChange={e => setDraft({ ...draft, count: parseInt(e.target.value) })} className="w-full accent-trust-600" />
                <div className="flex justify-between text-[10px] font-bold text-slate-300"><span>5문제</span><span>15문제</span><span>30문제</span></div>
              </div>
              <div className="space-y-3">
                <Label>난이도</Label>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  {[1, 2, 3].map(d => (
                    <button key={d} onClick={() => setDraft({ ...draft, difficulty: d })}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${draft.difficulty === d ? 'bg-white text-trust-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                      {d === 1 ? '쉬움' : d === 2 ? '보통' : '어려움'}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {draft.difficulty === 1 ? '보기 3개 가운데 고릅니다. 틀린 보기는 아무 글자나 나옵니다.'
                    : draft.difficulty === 2 ? '보기 4개 가운데 고릅니다. 모양이 비슷하거나 음이 같은 글자, 한 음절이 겹치는 낱말을 2개쯤 섞습니다.'
                      : '보기 4개가 모두 헷갈리는 글자로 나오고, 낱말은 음절 조각을 조립해 답합니다. (실제 시험은 한글로 직접 씁니다)'}
                </p>
              </div>
              <div className="space-y-3">
                <Label>한 판에 새로 나오는 글자</Label>
                <Stepper value={draft.newPerRound} min={0} max={10} unit="자" onChange={n => setDraft({ ...draft, newPerRound: n })} />
                <p className="text-[11px] text-slate-400 leading-relaxed">새 글자는 문제 전에 카드로 먼저 보여 주고, 한 판에서 두 번씩 나옵니다. 0으로 두면 복습만 합니다.</p>
              </div>
              <div className="space-y-3">
                <Label>오늘의 한 판에 섞을 문제 유형</Label>
                <div className="grid gap-2">
                  {([['hun', '훈음 맞히기', '한자를 보고 훈음 고르기, 훈음을 보고 한자 고르기'], ['word', '낱말 읽기', '문장 속 한자어의 독음 맞히기 (시험에서 비중이 가장 큼)'], ['listen', '듣고 고르기', '훈음을 듣고 한자 고르기']] as const).map(([k, label, desc]) => (
                    <button key={k} onClick={() => setDraft({ ...draft, modes: { ...draft.modes, [k]: !draft.modes[k] } })}
                      className={`text-left px-4 py-3 rounded-xl border-2 flex items-center justify-between gap-3 ${draft.modes[k] ? 'border-trust-200 bg-trust-50' : 'border-slate-100 bg-white'}`}>
                      <span>
                        <span className={`text-sm font-bold ${draft.modes[k] ? 'text-trust-700' : 'text-slate-400'}`}>{label}</span>
                        <span className="block text-[11px] text-slate-400">{desc}</span>
                      </span>
                      <span className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${draft.modes[k] ? 'bg-trust-600' : 'bg-slate-200'}`}>
                        <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${draft.modes[k] ? 'translate-x-5' : ''}`} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <Title icon={<Lightbulb size={18} className="text-amber-500" />}>힌트</Title>
              <p className="text-sm text-slate-500 leading-relaxed">
                판마다 기본 힌트를 무료로 줍니다. 지금 설정({draft.count}문제)에서는 <strong className="text-slate-700">{freeHints(draft.count, draft.difficulty === 3)}개</strong>입니다.
                (10문제 2개, 20문제 3개, 30문제 4개. 어려움 난이도이거나 새 글자가 절반 이상인 판은 1개 더)
                남은 힌트는 다음 판으로 넘어가지 않습니다.
              </p>
              <div className="space-y-2">
                <p className="text-sm text-slate-500">기본 힌트를 다 쓴 뒤에는 힌트 한 번에 <strong className="text-slate-700">별 {HINT_COST}개</strong>를 씁니다. (수학 에이스와 같음)</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">힌트를 보고 맞힌 글자는 기억 상자에서 올라가지 않고, 틀린 글자는 첫 칸으로 돌아갑니다.</p>
              </div>
            </Card>

            <Card>
              <Title icon={<Star size={18} className="text-amber-400" />}>아이 이름</Title>
              <input type="text" className="input-field bg-slate-50" placeholder="예: 지민" maxLength={10}
                value={draft.childName || ''} onChange={e => setDraft({ ...draft, childName: e.target.value })} />
              <p className="text-[11px] text-slate-400">인사와 칭찬에서 아이 이름을 불러 줘요. (선택)</p>
            </Card>

            <div>
              <button className={`btn-primary w-full py-4 text-lg bg-trust-600 hover:bg-trust-700 shadow-trust-100 ${dirty ? '' : 'opacity-60'}`} onClick={save}>
                {dirty ? '바뀐 설정 저장하기' : '모든 설정 저장하기'}
              </button>
            </div>

            <div className="pt-10 border-t-2 border-dashed border-slate-200 space-y-6">
              <div className="flex items-center justify-center gap-2">
                <div className="h-px bg-slate-200 flex-1" />
                <div className="text-[10px] font-black text-slate-300 tracking-[0.3em] whitespace-nowrap">SYSTEM</div>
                <div className="h-px bg-slate-200 flex-1" />
              </div>

              <Card dim>
                <Title icon={<Sparkles size={18} className="text-slate-400" />}>AI 칭찬 피드백 (선택)</Title>
                <Label>Gemini API Key</Label>
                {hubGeminiKey() ? (
                  <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-3">
                    에이스 홈에 넣은 키({maskKey(hubGeminiKey())})를 쓰고 있어요. 바꾸려면 <a href={LINKS.home} className="text-trust-600 font-bold underline">에이스 홈</a> 부모님 모드에서 바꿔요.
                  </p>
                ) : (
                  <input type="password" className="input-field bg-slate-50" placeholder="AIza..."
                    value={draft.geminiKey} onChange={e => setDraft({ ...draft, geminiKey: e.target.value })} />
                )}
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  한 판이 끝난 뒤의 칭찬 한마디에만 씁니다. 문제, 정답, 힌트는 검수한 데이터로만 만들고 AI가 관여하지 않습니다.
                  에이스 홈 부모님 모드에 키를 넣으면 모든 에이스가 함께 써요.
                </p>
              </Card>

              <Card dim>
                <Title icon={<Lock size={18} className="text-slate-400" />}>보안 설정</Title>
                <Label>새 PIN 번호 (4자리)</Label>
                <div className="flex gap-2">
                  <input type="password" inputMode="numeric" maxLength={4} className="input-field flex-1 bg-slate-50" placeholder="****"
                    value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} />
                  <button className="btn-secondary px-6" onClick={() => {
                    if (newPin.length !== 4) { toast('PIN 번호는 4자리여야 합니다.'); return; }
                    actions.setPin(newPin); setNewPin(''); toast('PIN 번호가 변경되었습니다!');
                  }}>변경</button>
                </div>
                <p className="text-[11px] text-slate-400">처음 PIN은 1234입니다. 수학 에이스의 PIN과는 따로 저장됩니다.</p>
              </Card>

              <Card dim>
                <Title icon={<Database size={18} className="text-slate-400" />}>기록 백업</Title>
                <p className="text-sm text-slate-500 leading-relaxed">
                  기록·별·쿠폰·설정은 이 기기에만 저장됩니다. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 백업 파일로 내려받아 두세요.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-secondary py-3 text-sm" onClick={exportBackup}>백업 파일 받기</button>
                  <button className="btn-secondary py-3 text-sm" onClick={() => fileRef.current?.click()}>백업 파일 불러오기</button>
                </div>
                <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importBackup} />
              </Card>

              <Card dim>
                <Title icon={<Smartphone size={18} className="text-slate-400" />}>홈 화면에 추가하기</Title>
                <p className="text-sm text-slate-500 leading-relaxed">
                  브라우저 메뉴에서 <strong>'홈 화면에 추가'</strong>를 누르면 앱처럼 아이콘으로 바로 실행할 수 있습니다.
                </p>
                <div className="flex gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-10 h-10 bg-trust-600 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"><Plus size={20} /></div>
                  <div className="text-[11px] text-slate-400 leading-tight flex items-center">
                    아이폰: 공유 버튼 → 홈 화면에 추가<br />안드로이드: 메뉴 버튼 → 앱 설치 또는 홈 화면에 추가
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ══════════ 찬스와 별 (에이스 홈으로 옮김) ══════════ */}
        {tab === 'chance' && (
          <div className="space-y-6 animate-slide-up">
            <div className="grid grid-cols-3 gap-3">
              {[['남은 별 (합산)', wallet.balance, 'text-amber-600'], ['한자에서 번 별', earnedStars(store), 'text-emerald-600'], ['쓴 별 (합산)', wallet.spent, 'text-slate-600']].map(([label, n, color]) => (
                <div key={label as string} className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                  <div className={`text-2xl font-black font-display ${color}`}>{n as number}</div>
                  <div className="text-[11px] font-bold text-slate-400 mt-1">{label as string}</div>
                </div>
              ))}
            </div>
            <Card>
              <Title icon={<Gift size={18} className="text-trust-600" />}>찬스와 쿠폰은 에이스 홈에서</Title>
              <p className="text-sm text-slate-500 leading-relaxed">
                별은 수학 에이스와 함께 쓰는 지갑 하나로 합쳤어요. 찬스 가게, 쿠폰 사용 처리, 잘못 산 쿠폰 되돌리기, 별 장부는 에이스 홈의 부모님 모드에서 해요.
              </p>
              {coupons.length > 0 && <p className="text-sm font-bold text-amber-600">사용을 기다리는 쿠폰 {coupons.length}장</p>}
              <button className="btn-secondary w-full flex items-center justify-center gap-2" onClick={() => goHome()}>
                <Star size={16} className="text-amber-500 fill-amber-500" />에이스 홈 열기
              </button>
            </Card>
          </div>
        )}

        {/* ══════════ 학습 기록 ══════════ */}
        {tab === 'records' && (
          <div className="space-y-4 animate-slide-up">
            {selected ? (
              <div className="space-y-6">
                <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-trust-600 font-bold hover:underline">
                  <ChevronLeft size={20} />목록으로 돌아가기
                </button>
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <h3 className="text-xl font-black text-slate-900">{KIND_LABEL[selected.kind]}</h3>
                      <p className="text-sm text-slate-400">{selected.date} · {selected.groupNames.slice(0, 3).join(', ')}{selected.groupNames.length > 3 ? ' 외' : ''}</p>
                      <p className="text-xs text-slate-400 mt-1">번 별 {selected.stars}개 · 기본 힌트 {selected.hintsFree}번 · 별로 본 힌트 {selected.hintsPaid}번</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-3xl font-black text-trust-600">{selected.correct} / {selected.total}</div>
                      <div className="text-[10px] font-bold text-slate-400 tracking-widest">SCORE</div>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {selected.items.map((it, i) => (
                      <div key={i} className={`p-3 rounded-2xl border flex justify-between items-center gap-3 ${it.ok ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{i + 1}</span>
                          <span className="hanja text-2xl text-slate-800 w-8 text-center shrink-0">{it.c}</span>
                          <span className="min-w-0">
                            <span className="font-bold text-slate-700 block truncate">{it.ans}</span>
                            <span className="text-[11px] text-slate-400 block truncate">{it.q}{it.hint ? ' · 힌트 봄' : ''}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {!it.ok && <span className="text-sm font-black text-rose-600">답: {it.val || '-'}</span>}
                          {it.ok ? <CheckCircle2 size={20} className="text-emerald-500" /> : <XCircle size={20} className="text-rose-500" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900">기억 상자 (지금 고른 범위 {savedPool.length}자)</h3>
                    <span className="text-xs font-bold text-trust-600">오늘 복습 차례 {dueNow}자</span>
                  </div>
                  <div className="grid grid-cols-6 gap-2 text-center">
                    {[['새 글자', unseen, 'bg-slate-100 text-slate-500'], ['1칸', boxes[0], 'bg-slate-200 text-slate-600'], ['2칸', boxes[1], 'bg-slate-200 text-slate-600'],
                    ['3칸', boxes[2], 'bg-brand-100 text-brand-700'], ['4칸', boxes[3], 'bg-brand-100 text-brand-700'], ['5칸', boxes[4], 'bg-amber-100 text-amber-700']].map(([label, n, cls]) => (
                      <div key={label as string} className={`rounded-xl py-3 ${cls}`}>
                        <div className="text-xl font-black font-display">{n as number}</div>
                        <div className="text-[10px] font-bold">{label as string}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">맞히면 한 칸 올라가고 틀리면 1칸으로 돌아갑니다. 다시 나오는 간격은 1칸 매 판, 2칸 1일, 3칸 3일, 4칸 7일, 5칸 14일입니다.</p>
                </div>

                {(weak.length > 0 || pairs.length > 0) && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                    {weak.length > 0 && (
                      <div>
                        <h3 className="font-bold text-slate-900 mb-2">자주 틀린 글자</h3>
                        <div className="flex flex-wrap gap-2">
                          {weak.map(([c, v]) => (
                            <div key={c} className="flex items-center gap-2 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                              <span className="hanja text-2xl text-slate-800">{c}</span>
                              <span className="text-xs font-bold text-slate-600">{hunEum(c)}<span className="block text-[10px] text-rose-500">{v.wrong}번 틀림 · {toneOf(v) === 'grey' ? '익히는 중' : '회복함'}</span></span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {pairs.length > 0 && (
                      <div>
                        <h3 className="font-bold text-slate-900 mb-2">서로 헷갈린 글자</h3>
                        <div className="flex flex-wrap gap-2">
                          {pairs.map(([k, n]) => {
                            const [a, b] = k.split('>');
                            if (!HANJA[a] || !HANJA[b]) return null;
                            return (
                              <div key={k} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-slate-600">
                                <span className="hanja text-xl text-slate-800">{a}</span> {hunEum(a)} <span className="text-slate-300 mx-1">→</span>
                                <span className="hanja text-xl text-rose-500">{b}</span> {hunEum(b)} <span className="text-slate-400">· {n}번</span>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2">왼쪽이 정답, 오른쪽이 아이가 고른 글자입니다.</p>
                      </div>
                    )}
                  </div>
                )}

                {store.records.length === 0 ? (
                  <div className="text-center py-16">
                    <History size={48} className="mx-auto text-slate-200 mb-4" />
                    <p className="text-slate-400 font-medium">아직 학습 기록이 없습니다.</p>
                  </div>
                ) : store.records.map(r => (
                  <button key={r.ts} onClick={() => setSelected(r)}
                    className="w-full text-left bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center gap-4 group hover:border-trust-300 transition-all active:scale-[0.98]">
                    <div className="space-y-1 min-w-0">
                      <div className="font-bold text-slate-900">{KIND_LABEL[r.kind]} <span className="text-xs font-bold text-amber-500">★ +{r.stars}</span></div>
                      <div className="text-xs text-slate-400 truncate">{r.date} · {r.groupNames.slice(0, 2).join(', ')}{r.groupNames.length > 2 ? ' 외' : ''}</div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className="text-2xl font-black text-trust-600 font-display">{r.correct} / {r.total}</div>
                        <div className="text-[10px] font-bold text-slate-400 tracking-widest">SCORE</div>
                      </div>
                      <ChevronRight size={20} className="text-slate-300 group-hover:text-trust-500" />
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
