/**
 * 과목 앱 아이 홈의 보상 부분 — 모든 에이스가 같은 모양으로 씀
 * ※ src/ace 폴더는 허브·수학·한자·영어·생각 다섯 저장소에 똑같이 들어 있음. 고치면 다섯 곳에 같이 복사.
 *
 *  <AceRewardCards>  아이 홈 오른쪽: ② 내 보상(과목 뱃지 + 가장 가까운 목표) ③ 찬스 바꾸기 ④ 명예의 전당
 *  <AceRewardsSheet> 별 잔액을 누르면 뜨는 "내 보상" 창: 별, 다음 목표, 쿠폰(보기만), 뱃지, 최근 내역
 *  aceGoals()        다음 목표 목록 (뱃지 · 찬스 · 명예의 전당, 가까운 순)
 *
 * 뱃지만 과목마다 다르게 넘겨줌. 별·쿠폰·명예의 전당은 에이스 지갑(wallet.ts)에서 가져옴.
 */
import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ChevronRight, Flame, Gem, Lock, Sprout, Star, Ticket, Trophy, X } from 'lucide-react';
import { Summary, couponState, coupons, daysLeft, mathWishCoupons, spendHistory, useWallet } from './wallet';
import { TIERS } from './chances';
import { SUBJECTS, SubjectId, goHome } from './links';

export interface AceBadge { id: string; need: number; iconName: string; name: string }

export interface RewardProps {
  subject: SubjectId;
  badges: AceBadge[];
  /** 받은 뱃지 id. 없으면 과목 번 별로 계산 */
  gotIds?: string[];
}

export interface Goal { key: string; emoji: string; label: string; at: number; cur: number }

const SUBJECT_SHORT: Record<SubjectId, string> = { math: '수학', hanja: '한자', english: '영어', thinking: '생각' };

function subjectEarned(w: Summary, s: SubjectId): number {
  return s === 'math' ? w.mathEarned : s === 'english' ? w.englishEarned : s === 'thinking' ? 0 : w.hanjaEarned;
}

/** 다음 목표: 뱃지(과목 번 별), 찬스(남은 별), 명예의 전당(합산 번 별) — 남은 별이 적은 순 */
export function aceGoals(w: Summary, subject: SubjectId, badges: AceBadge[]): Goal[] {
  const mine = subjectEarned(w, subject);
  const nextBadge = badges.find(b => mine < b.need) || null;
  const nextTier = TIERS.find(t => t.price > w.balance) || null;
  return [
    ...(nextBadge ? [{ key: 'badge', emoji: '🏅', label: `뱃지 ‘${nextBadge.name}’`, at: nextBadge.need, cur: mine }] : []),
    ...(nextTier ? [{ key: 'chance', emoji: '🎟️', label: nextTier.name, at: nextTier.price, cur: w.balance }] : []),
    { key: 'hall', emoji: '👑', label: '명예의 전당', at: (w.hallCount + 1) * 100, cur: w.earned },
  ].sort((a, b) => (a.at - a.cur) - (b.at - b.cur));
}

export function BadgeIcon({ name, size = 24, className = '' }: { name: string; size?: number; className?: string }) {
  const icons: Record<string, any> = { Sprout, Star, Flame, Gem, Trophy };
  const Icon = icons[name] || Star;
  return <Icon size={size} className={className} />;
}

function activeCouponCount(): number {
  return coupons().filter(c => couponState(c) === 'active').length + mathWishCoupons().length;
}

function GoalBar({ g }: { g: Goal }) {
  return (
    <div className="bg-slate-100 h-2.5 rounded-full overflow-hidden">
      <div className="bg-gradient-to-r from-amber-400 to-amber-500 h-full rounded-full" style={{ width: `${Math.min(100, (g.cur / g.at) * 100)}%` }} />
    </div>
  );
}

/** 아이 홈 오른쪽 아래 카드 세 개 (과목 학습 카드 바로 아래에 둠) */
export function AceRewardCards({ subject, badges, gotIds, onOpen }: RewardProps & { onOpen: () => void }) {
  const w = useWallet();
  const mine = subjectEarned(w, subject);
  const got = gotIds || badges.filter(b => mine >= b.need).map(b => b.id);
  const goal = aceGoals(w, subject, badges)[0];
  const couponCount = activeCouponCount();

  return (
    <>
      {/* ② 내 보상 */}
      <button onClick={onOpen}
        className="w-full bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5 space-y-4 active:scale-[0.98] transition-transform text-left">
        <div className="flex items-center justify-between">
          <span className="font-black text-slate-800">내 보상</span>
          <span className="text-xs font-bold text-brand-500 flex items-center">자세히 보기<ChevronRight size={14} /></span>
        </div>
        <div className="flex justify-between gap-2">
          {badges.map(b => {
            const on = got.includes(b.id);
            return (
              <div key={b.id} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${on ? 'bg-brand-100 text-brand-600 shadow-sm' : 'bg-slate-100 text-slate-300'}`}>
                  {on ? <BadgeIcon name={b.iconName} size={20} /> : <Lock size={16} />}
                </div>
                <span className={`text-[10px] font-bold ${on ? 'text-slate-600' : 'text-slate-300'}`}>⭐{b.need}</span>
              </div>
            );
          })}
        </div>
        <div>
          <div className="flex justify-between text-xs font-bold mb-1.5">
            <span className="text-slate-500">{goal.emoji} {goal.label}까지</span>
            <span className="text-amber-600">별 {goal.at - goal.cur}개 남았어요</span>
          </div>
          <GoalBar g={goal} />
        </div>
      </button>

      {/* ③ 찬스 바꾸기 → 에이스 홈 가게 */}
      <motion.button whileTap={{ scale: 0.97 }} onClick={() => goHome('shop')}
        className="w-full bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-dashed border-amber-300 rounded-2xl p-4">
        <div className="flex items-center justify-center gap-2 text-amber-600 font-black text-sm mb-1">🎁 에이스 홈에서 찬스 바꾸기</div>
        <p className="text-center text-[11px] text-amber-500">{couponCount > 0 ? `내 쿠폰 ${couponCount}장 · ` : ''}모든 과목 별을 함께 써요</p>
      </motion.button>

      {/* ④ 명예의 전당 (한 번이라도 들어갔을 때) */}
      {w.hallCount > 0 && (
        <motion.button whileTap={{ scale: 0.97 }} onClick={onOpen}
          className="w-full bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl p-4 text-center text-white shadow-lg">
          <div className="text-2xl mb-1">👑</div>
          <div className="font-black">명예의 전당{w.hallCount > 1 ? ` ${w.hallCount}번` : ''}</div>
          <div className="text-xs opacity-90">모든 과목에서 모은 별 {w.earned}개!</div>
        </motion.button>
      )}
    </>
  );
}

/** "내 보상" 창 — 두 과목 모두 같은 모양 */
export function AceRewardsSheet({ open, onClose, childName, subject, badges, gotIds }: RewardProps & { open: boolean; onClose: () => void; childName?: string }) {
  const w = useWallet();
  const mine = subjectEarned(w, subject);
  const got = gotIds || badges.filter(b => mine >= b.need).map(b => b.id);
  const goals = aceGoals(w, subject, badges);
  const active = coupons().filter(c => couponState(c) === 'active');
  const wishes = mathWishCoupons();
  const recent = open ? spendHistory(6) : [];
  const name = childName?.trim();
  const short = SUBJECT_SHORT[subject];

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6 print:hidden" onClick={onClose}>
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: 'spring', damping: 22 }}
            onClick={e => e.stopPropagation()}
            className="bg-white w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-t-[2rem] sm:rounded-[2rem] p-6 space-y-6 shadow-2xl">

            {/* 별 */}
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-bold text-slate-400">{name ? `${name}의 보상` : '내 보상'}</div>
                <div className="flex items-center gap-2 text-4xl font-black text-slate-900 font-display mt-1">
                  <Star size={32} className="fill-amber-400 text-amber-400" />{w.balance}<span className="text-base text-slate-400 font-bold">개</span>
                </div>
                <p className="text-xs text-slate-400 font-medium mt-1">5문제 맞힐 때마다 별 1개 · 모든 과목 별을 함께 써요</p>
              </div>
              <button onClick={onClose} aria-label="닫기"
                className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center active:scale-90"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center -mt-2">
              {SUBJECTS.filter(s => !s.noStars).map(s => (
                <div key={s.id} className="bg-slate-50 rounded-2xl p-3">
                  <div className="text-lg font-black font-display" style={{ color: s.color }}>{subjectEarned(w, s.id)}</div>
                  <div className="text-[11px] font-bold text-slate-500">{SUBJECT_SHORT[s.id]}에서 번 별</div>
                </div>
              ))}
              <div className="bg-slate-50 rounded-2xl p-3">
                <div className="text-lg font-black text-slate-600 font-display">{w.spent}</div>
                <div className="text-[11px] font-bold text-slate-500">쓴 별</div>
              </div>
            </div>
            {w.gifted !== 0 && <p className="text-[11px] text-slate-400 font-medium -mt-4">부모님이 준 별 {w.gifted > 0 ? '+' : ''}{w.gifted}개가 더해져 있어요.</p>}

            {/* 다음 목표 */}
            <div className="space-y-3">
              <h4 className="text-sm font-black text-slate-800">다음 목표</h4>
              {goals.map(g => (
                <div key={g.key}>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-slate-600">{g.emoji} {g.label} <span className="text-slate-300">· 별 {g.at}개</span></span>
                    <span className="text-amber-600">{g.at - g.cur}개 남음</span>
                  </div>
                  <GoalBar g={g} />
                </div>
              ))}
            </div>

            {/* 쿠폰 (보기만, 사용 처리는 에이스 홈에서 부모님이) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5"><Ticket size={16} className="text-amber-500" />내 쿠폰 {active.length + wishes.length > 0 ? `${active.length + wishes.length}장` : ''}</h4>
                {active.length + wishes.length > 0 && (
                  <button onClick={() => goHome('coupons')} className="text-xs font-bold text-brand-600 flex items-center">쿠폰함 열기<ChevronRight size={14} /></button>
                )}
              </div>
              {active.map(c => {
                const left = daysLeft(c);
                return (
                  <div key={c.id} className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-dashed border-amber-300 rounded-2xl p-4 flex items-center gap-3">
                    <div className="text-3xl">{c.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-amber-800">{c.name}</div>
                      <div className="text-[11px] font-bold text-amber-600">{c.desc}{left !== null ? ` · ${left}일 남음` : ''}</div>
                    </div>
                  </div>
                );
              })}
              {wishes.map(v => (
                <div key={`w${v}`} className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-dashed border-amber-300 rounded-2xl p-4 flex items-center gap-3">
                  <div className="text-3xl">🎁</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-amber-800">소원 쿠폰</div>
                    <div className="text-[11px] font-bold text-amber-600">수학 별 {v}개 달성 기념</div>
                  </div>
                </div>
              ))}
              {active.length + wishes.length > 0
                ? <p className="text-[11px] text-slate-400 font-medium">쿠폰은 엄마 아빠에게 보여 주세요. 에이스 홈에서 부모님이 사용 처리해요.</p>
                : <p className="text-xs text-slate-400 font-medium bg-slate-50 rounded-2xl p-4">아직 쿠폰이 없어요. 별을 모아 찬스로 바꿔 보세요!</p>}
              <button onClick={() => goHome('shop')}
                className="w-full bg-gradient-to-br from-amber-400 to-orange-500 text-white font-black rounded-2xl py-3.5 active:scale-[0.98] transition-transform">
                🎁 에이스 홈에서 찬스 바꾸기
              </button>
            </div>

            {/* 뱃지 (이 과목에서 번 별 기준) */}
            <div className="space-y-3">
              <h4 className="text-sm font-black text-slate-800">{short} 뱃지 {got.length}/{badges.length}</h4>
              <div className="grid gap-2">
                {badges.map(b => {
                  const on = got.includes(b.id);
                  return (
                    <div key={b.id} className={`flex items-center gap-3 p-3 rounded-2xl border ${on ? 'bg-brand-50 border-brand-100' : 'bg-slate-50 border-slate-100'}`}>
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-brand-100 text-brand-600' : 'bg-slate-100 text-slate-300'}`}>
                        {on ? <BadgeIcon name={b.iconName} size={20} /> : <Lock size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-black text-sm ${on ? 'text-slate-800' : 'text-slate-400'}`}>{b.name}</div>
                        <div className="text-[11px] font-bold text-slate-400">{short} 별 {b.need}개 모으기</div>
                      </div>
                      {on
                        ? <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
                        : <span className="text-[11px] font-black text-amber-600 shrink-0">{Math.max(0, b.need - mine)}개 남음</span>}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 font-medium">뱃지는 {short}에서 번 별로 받아요. 별을 써도 사라지지 않아요.</p>
            </div>

            {/* 최근 내역 */}
            {recent.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-black text-slate-800">최근 쓴 별</h4>
                <div className="bg-slate-50 rounded-2xl divide-y divide-white">
                  {recent.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className={`font-bold truncate ${r.refunded ? 'text-slate-300 line-through' : 'text-slate-600'}`}>{r.label}</span>
                      <span className={`font-black shrink-0 ml-3 ${r.refunded ? 'text-slate-300' : r.gift && r.amount > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{r.refunded ? '돌려받음' : r.gift ? (r.amount > 0 ? `+${r.amount}` : `−${-r.amount}`) : `−${r.amount}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {w.hallCount > 0 && (
              <div className="bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl p-5 text-center text-white">
                <div className="text-3xl mb-1">👑</div>
                <div className="font-black">명예의 전당 {w.hallCount}번</div>
                <div className="text-xs opacity-90 mt-1">모든 과목에서 별 {w.earned}개를 모았어요!</div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
