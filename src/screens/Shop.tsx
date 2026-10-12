/**
 * 내 별 — 찬스를 바꾸고 쓰는 곳은 에이스 홈(허브)으로 옮김. 여기서는 보기만 함.
 * 별·쿠폰은 수학 에이스와 함께 쓰는 에이스 지갑(src/ace/wallet.ts)
 */
import React from 'react';
import { ChevronLeft, ChevronRight, Lock, Star, Ticket } from 'lucide-react';
import { BADGES, earnedStars, useStore } from '../engine/store';
import { couponState, coupons as aceCoupons, daysLeft, mathWishCoupons, spendHistory, useWallet } from '../ace/wallet';
import { goHome } from '../ace/links';
import { BadgeIcon } from '../components/ui';

export default function Shop({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const w = useWallet();
  const hanjaEarned = earnedStars(store);
  const active = aceCoupons().filter(c => couponState(c) === 'active');
  const wishes = mathWishCoupons();
  const recent = spendHistory(6);
  const name = store.config.childName?.trim();

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-lg landscape:max-w-5xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} aria-label="뒤로"
            className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 text-slate-500"><ChevronLeft size={22} /></button>
          <h2 className="text-2xl font-black text-slate-900 font-display">내 별</h2>
        </div>

        <div className="landscape:grid landscape:grid-cols-2 landscape:gap-6 space-y-5 landscape:space-y-0 landscape:items-start">
          <div className="space-y-5">
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5">
              <div className="text-xs font-bold text-slate-400">{name ? `${name}의 별` : '내 별'} · 수학과 한자를 합친 별</div>
              <div className="flex items-center gap-2 text-5xl font-black text-slate-900 font-display mt-1">
                <Star size={38} className="fill-amber-400 text-amber-400" />{w.balance}<span className="text-base text-slate-400 font-bold">개</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div className="bg-violet-50 rounded-2xl p-3">
                  <div className="text-lg font-black text-violet-600 font-display">{w.hanjaEarned}</div>
                  <div className="text-[11px] font-bold text-violet-700">한자에서 번 별</div>
                </div>
                <div className="bg-blue-50 rounded-2xl p-3">
                  <div className="text-lg font-black text-blue-600 font-display">{w.mathEarned}</div>
                  <div className="text-[11px] font-bold text-blue-700">수학에서 번 별</div>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3">
                  <div className="text-lg font-black text-slate-600 font-display">{w.spent}</div>
                  <div className="text-[11px] font-bold text-slate-500">쓴 별</div>
                </div>
              </div>
              {w.hallCount > 0 && <p className="text-xs font-black text-brand-700 mt-3">👑 명예의 전당 {w.hallCount}번 · 모은 별 {w.earned}개</p>}
            </div>

            <button onClick={() => goHome('shop')}
              className="w-full bg-gradient-to-br from-amber-400 to-orange-500 rounded-[1.5rem] p-5 text-left shadow-lg shadow-amber-200 flex items-center gap-4 active:scale-[0.98] transition-transform">
              <div className="text-4xl">🎁</div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-black text-white">에이스 홈에서 찬스 바꾸기</div>
                <div className="text-xs font-bold text-white/85">찬스 가게는 에이스 홈으로 옮겼어요</div>
              </div>
              <ChevronRight size={24} className="text-white/80" />
            </button>

            {/* 뱃지: 한자에서 번 별 기준 */}
            <div className="space-y-2">
              <h4 className="text-sm font-black text-slate-800">한자 뱃지 {BADGES.filter(b => hanjaEarned >= b.need).length}/{BADGES.length}</h4>
              <div className="flex justify-between gap-2 bg-white rounded-2xl border border-slate-100 p-4">
                {BADGES.map(b => {
                  const got = hanjaEarned >= b.need;
                  return (
                    <div key={b.id} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${got ? 'bg-brand-100 text-brand-600 shadow-sm' : 'bg-slate-100 text-slate-300'}`}>
                        {got ? <BadgeIcon name={b.iconName} size={20} /> : <Lock size={16} />}
                      </div>
                      <span className={`text-[10px] font-bold text-center break-keep leading-tight ${got ? 'text-slate-700' : 'text-slate-300'}`}>{b.name}</span>
                      <span className="text-[10px] font-bold text-slate-300">번 별 {b.need}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 font-medium">뱃지는 한자에서 번 별로 받아요. 별을 써도 사라지지 않아요.</p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5"><Ticket size={16} className="text-amber-500" />내 쿠폰 {active.length + wishes.length > 0 ? `${active.length + wishes.length}장` : ''}</h4>
                <button onClick={() => goHome('coupons')} className="text-xs font-bold text-brand-600 flex items-center">쿠폰함 열기<ChevronRight size={14} /></button>
              </div>
              {active.length + wishes.length === 0 ? (
                <p className="text-xs text-slate-400 font-medium bg-white rounded-2xl p-4 border border-slate-100">아직 쿠폰이 없어요. 별을 모아 에이스 홈에서 찬스로 바꿔 보세요!</p>
              ) : (
                <>
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
                  <p className="text-[11px] text-slate-400 font-medium">쿠폰은 에이스 홈 쿠폰함에서 부모님이 사용 처리해요.</p>
                </>
              )}
            </div>

            {recent.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-black text-slate-800">최근 내역</h4>
                <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50">
                  {recent.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className={`font-bold truncate ${r.refunded ? 'text-slate-300 line-through' : 'text-slate-600'}`}>{r.label}</span>
                      <span className={`font-black shrink-0 ml-3 ${r.refunded ? 'text-slate-300' : r.gift && r.amount > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{r.refunded ? '돌려받음' : r.gift ? (r.amount > 0 ? `+${r.amount}` : `−${-r.amount}`) : `−${r.amount}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
