/**
 * 과목 앱 아이 홈 맨 위 버튼 줄: 부모님 + 에이스 홈 + 다른 과목
 * ※ src/ace 폴더는 허브·수학·한자 세 저장소에 똑같이 들어 있음. 고치면 세 곳에 같이 복사.
 * 과목이 늘면 links.ts의 SUBJECTS에만 더하면 모든 앱에 버튼이 생김.
 * 감싸는 줄 없이(contents) 버튼만 내놓으므로, 놓는 곳을 flex-wrap으로 두면 좁은 화면에서 자연스럽게 두 줄이 됨.
 */
import React from 'react';
import { Lock, Star } from 'lucide-react';
import { LINKS, SUBJECTS, SubjectId } from './links';

export function AceNav({ current, onParent }: { current: SubjectId; onParent?: () => void }) {
  return (
    <div className="contents">
      {onParent && (
        <button onClick={onParent} aria-label="부모님 모드"
          className="h-12 px-4 bg-white rounded-2xl flex items-center gap-1.5 shadow-sm border border-slate-100 text-sm font-bold text-slate-500 active:scale-95 transition-transform">
          <Lock size={16} className="text-slate-400" />부모님
        </button>
      )}
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
