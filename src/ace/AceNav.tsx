/**
 * 에이스끼리 오가는 버튼 줄: 에이스 홈 + 다른 과목
 * ※ src/ace 폴더는 허브·수학·한자 세 저장소에 똑같이 들어 있음. 고치면 세 곳에 같이 복사.
 * 과목이 늘면 links.ts의 SUBJECTS에만 더하면 모든 앱에 버튼이 생김.
 */
import React from 'react';
import { Star } from 'lucide-react';
import { LINKS, SUBJECTS, SubjectId } from './links';

export function AceNav({ current }: { current: SubjectId }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <a href={LINKS.home} aria-label="에이스 홈"
        className="h-12 px-4 bg-white rounded-2xl flex items-center gap-1.5 shadow-sm border border-slate-100 text-sm font-black text-slate-600 active:scale-95 transition-transform">
        <Star size={16} className="text-amber-500 fill-amber-500" />에이스 홈
      </a>
      {SUBJECTS.filter(s => s.id !== current).map(s => (
        <a key={s.id} href={s.href} aria-label={s.name}
          className="h-12 px-4 bg-white rounded-2xl flex items-center gap-1.5 shadow-sm border border-slate-100 text-sm font-black active:scale-95 transition-transform"
          style={{ color: s.color }}>
          <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs ${s.id === 'hanja' ? 'hanja' : 'font-black'}`} style={{ background: s.color }}>{s.mark}</span>
          {s.name}
        </a>
      ))}
    </div>
  );
}
