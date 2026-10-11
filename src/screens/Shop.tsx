import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ChevronLeft, Lock, Star } from 'lucide-react';
import { Chance } from '../types';
import { BADGES, actions, activeCoupons, balanceOf, earnedStars, spentStars, useStore } from '../engine/store';
import { BadgeIcon, askPin, fireConfetti, toast } from '../components/ui';

export default function Shop({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const { config } = store;
  const balance = balanceOf(store);
  const earned = earnedStars(store);
  const spent = spentStars(store);
  const coupons = activeCoupons(store);
  const [buying, setBuying] = useState<Chance | null>(null);
  const name = config.childName?.trim();

  const menu = config.chances.filter(c => c.on);
  const tiers = [...new Set(menu.map(c => c.price))].sort((a, b) => a - b);
  const tierName = (i: number) => (tiers.length === 3 ? ['작은 찬스', '중간 찬스', '큰 찬스'][i] : '찬스');
  const recent = [...store.spends].reverse().slice(0, 6);

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-lg landscape:max-w-5xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} aria-label="뒤로"
            className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 text-slate-500"><ChevronLeft size={22} /></button>
          <h2 className="text-2xl font-black text-slate-900 font-display">찬스 가게</h2>
        </div>

        <div className="landscape:grid landscape:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] landscape:gap-6 space-y-5 landscape:space-y-0 landscape:items-start">
          <div className="space-y-5">
            {/* 별 장부 */}
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5">
              <div className="text-xs font-bold text-slate-400">{name ? `${name}의 별` : '내 별'}</div>
              <div className="flex items-center gap-2 text-5xl font-black text-slate-900 font-display mt-1">
                <Star size={38} className="fill-amber-400 text-amber-400" />{balance}<span className="text-base text-slate-400 font-bold">개</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="bg-emerald-50 rounded-2xl p-3 text-center">
                  <div className="text-lg font-black text-emerald-600 font-display">{earned}</div>
                  <div className="text-[11px] font-bold text-emerald-700">지금까지 번 별</div>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3 text-center">
                  <div className="text-lg font-black text-slate-600 font-display">{spent}</div>
                  <div className="text-[11px] font-bold text-slate-500">쓴 별</div>
                </div>
              </div>
              <p className="text-xs text-slate-400 font-medium mt-3">5문제 맞힐 때마다 별 1개를 받아요. 힌트를 더 보거나 찬스로 바꾸면 줄어들어요.</p>
            </div>

            {/* 내 쿠폰 */}
            <div className="space-y-2">
              <h4 className="text-sm font-black text-slate-800">내 찬스 쿠폰 {coupons.length > 0 ? `${coupons.length}장` : ''}</h4>
              {coupons.length === 0 ? (
                <p className="text-xs text-slate-400 font-medium bg-white rounded-2xl p-4 border border-slate-100">아직 쿠폰이 없어요. 별을 모아 찬스로 바꿔 보세요!</p>
              ) : coupons.map(c => (
                <div key={c.id} className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-dashed border-amber-300 rounded-2xl p-4 flex items-center gap-3">
                  <div className="text-3xl">{c.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-amber-800">{c.name}</div>
                    <div className="text-[11px] font-bold text-amber-600">{c.desc}</div>
                  </div>
                  <button onClick={() => askPin('쿠폰 사용은 부모님이 PIN으로 확인해요', () => { actions.useCoupon(c.id); toast(`${c.name}를 사용했어요! 🎉`); })}
                    className="shrink-0 bg-amber-500 text-white text-xs font-black px-3 py-2.5 rounded-xl active:scale-90 transition-transform flex items-center gap-1">
                    <Lock size={12} />사용하기
                  </button>
                </div>
              ))}
            </div>

            {/* 뱃지 */}
            <div className="space-y-2">
              <h4 className="text-sm font-black text-slate-800">뱃지 {BADGES.filter(b => earned >= b.need).length}/{BADGES.length}</h4>
              <div className="flex justify-between gap-2 bg-white rounded-2xl border border-slate-100 p-4">
                {BADGES.map(b => {
                  const got = earned >= b.need;
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
              <p className="text-[11px] text-slate-400 font-medium">뱃지는 지금까지 번 별로 받아요. 별을 써도 사라지지 않아요.</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* 찬스 메뉴 */}
            {tiers.map((price, ti) => (
              <div key={price} className="space-y-2">
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  {tierName(ti)}
                  <span className="flex items-center gap-0.5 text-xs font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full"><Star size={11} className="fill-amber-500 text-amber-500" />{price}</span>
                </h4>
                <div className="grid sm:grid-cols-2 gap-2">
                  {menu.filter(c => c.price === price).map(c => {
                    const ok = balance >= c.price;
                    return (
                      <button key={c.id} onClick={() => (ok ? setBuying(c) : toast(`별 ${c.price - balance}개를 더 모으면 바꿀 수 있어요`))}
                        className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all active:scale-[0.97] ${ok ? 'bg-white border-amber-300 shadow-sm' : 'bg-white/60 border-slate-100'}`}>
                        <div className={`text-3xl ${ok ? '' : 'grayscale opacity-60'}`}>{c.emoji}</div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-black text-sm ${ok ? 'text-slate-800' : 'text-slate-500'}`}>{c.name}</div>
                          <div className="text-[11px] font-bold text-slate-400 break-keep">{c.desc}</div>
                        </div>
                        {ok
                          ? <span className="shrink-0 text-xs font-black text-white bg-amber-500 px-2.5 py-1.5 rounded-lg">바꾸기</span>
                          : <span className="shrink-0 text-[11px] font-black text-slate-400">{c.price - balance}개 더</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {menu.length === 0 && <p className="text-sm text-slate-400 font-medium">부모님이 아직 찬스 메뉴를 열지 않았어요.</p>}

            {recent.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-black text-slate-800">최근에 쓴 별</h4>
                <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50">
                  {recent.map((s, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="font-bold text-slate-600 truncate">{s.kind === 'hint' ? `💡 힌트 (${s.note})` : `🎟️ ${s.note}`}</span>
                      <span className="font-black text-slate-500 shrink-0 ml-3">−{s.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {buying && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setBuying(null)}>
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8, opacity: 0 }} onClick={e => e.stopPropagation()}
              className="bg-white rounded-[2rem] p-7 max-w-xs w-full text-center shadow-2xl space-y-4">
              <div className="text-6xl">{buying.emoji}</div>
              <h3 className="text-xl font-black text-slate-900 font-display">{buying.name}</h3>
              <p className="text-sm font-bold text-slate-500 break-keep">{buying.desc}</p>
              <p className="text-sm font-black text-amber-600">별 {buying.price}개를 쓰면 {balance - buying.price}개가 남아요</p>
              <div className="flex gap-2">
                <button className="btn-secondary flex-1 py-3" onClick={() => setBuying(null)}>더 모을래</button>
                <button className="btn-primary flex-1 py-3 flex items-center justify-center gap-1" onClick={() => {
                  const ch = buying; setBuying(null);
                  if (actions.buyChance(ch)) { fireConfetti('big'); toast(`${ch.name} 쿠폰을 받았어요! 🎟️`); }
                  else toast('별이 모자라요.');
                }}><CheckCircle2 size={18} />바꿀래</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
