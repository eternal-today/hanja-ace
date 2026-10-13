/**
 * 필순 그림 — 획 하나를 진하게, 나머지는 옅게 그림.
 * 획 데이터는 필순 문제가 처음 나올 때 한 번만 내려받음 (앱 첫 화면을 무겁게 하지 않으려고).
 */
import { useEffect, useState } from 'react';

let cache: Record<string, string[]> | null = null;
let loading: Promise<Record<string, string[]>> | null = null;
export function loadStrokes() {
  return (loading ||= import('../data/strokeData')
    .then(m => (cache = m.default))
    .catch(e => { loading = null; throw e; }));   // 실패하면 다음에 다시 시도
}

function useStrokes(c: string): string[] | null {
  const [paths, setPaths] = useState<string[] | null>(() => cache?.[c] || null);
  useEffect(() => {
    if (cache) { setPaths(cache[c] || null); return; }
    let alive = true;
    loadStrokes().then(d => { if (alive) setPaths(d[c] || null); }).catch(() => {});
    return () => { alive = false; };
  }, [c]);
  return paths;
}

/**
 * hi: 진하게 보여 줄 획 (0부터). upto: 이 획까지만 그림 (필순 따라 보기용, 없으면 전부)
 */
export function StrokeChar({ c, hi, upto, className = '' }: { c: string; hi: number; upto?: number; className?: string }) {
  const paths = useStrokes(c);
  if (!paths) return <div className={`${className} flex items-center justify-center hanja text-slate-200`}>{c}</div>;
  return (
    <svg viewBox="0 0 1024 1024" className={className} role="img" aria-label={`${c} 필순`}>
      <rect x="8" y="8" width="1008" height="1008" rx="40" fill="none" stroke="#e2e8f0" strokeWidth="12" />
      <path d="M512 30V994M30 512H994" stroke="#f1f5f9" strokeWidth="8" strokeDasharray="24 20" />
      <g transform="translate(0, 900) scale(1, -1)">
        {paths.map((d, i) => (upto !== undefined && i > upto ? null : (
          <path key={i} d={d} fill={i === hi ? '#0f172a' : upto !== undefined ? '#94a3b8' : '#cbd5e1'} />
        )))}
      </g>
    </svg>
  );
}

/** 정답을 본 뒤: 첫 획부터 차례로 쌓아 보여 줌 */
export function StrokeSteps({ c, mark }: { c: string; mark: number }) {
  const paths = useStrokes(c);
  if (!paths) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {paths.map((_, i) => (
        <div key={i} className={`flex flex-col items-center rounded-lg ${i === mark ? 'bg-amber-100 ring-2 ring-amber-400' : ''}`}>
          <StrokeChar c={c} hi={i} upto={i} className="w-10 h-10" />
          <span className={`text-[10px] font-black ${i === mark ? 'text-amber-700' : 'text-slate-400'}`}>{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

