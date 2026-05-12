import React, { useMemo } from 'react';

function fmt(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits);
}

function normalizeBar(score, maxScore) {
  if (typeof score !== 'number' || Number.isNaN(score) || maxScore <= 0) return 0;
  return Math.max(0, Math.min(100, (score / maxScore) * 100));
}

function KMeansDiagnosticsPanel({
  diagnostics = [],
  selectedK = null,
  minK = null,
  maxK = null,
  missingNote = false,
  compact = false,
}) {
  const rows = useMemo(
    () => [...(Array.isArray(diagnostics) ? diagnostics : [])].sort((a, b) => (a?.k ?? 0) - (b?.k ?? 0)),
    [diagnostics]
  );
  const maxCombinedScore = useMemo(() => {
    const vals = rows
      .map((r) => (typeof r?.combined_score === 'number' ? r.combined_score : null))
      .filter((v) => v !== null);
    if (!vals.length) return 1;
    return Math.max(...vals);
  }, [rows]);

  if (!rows.length) {
    if (!missingNote) return null;
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
        K-selection diagnostics are available only for newer KMeans auto-K runs.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-accent-100 bg-gradient-to-br from-white via-accent-50/35 to-brand-50/25 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-800">
        KMeans diagnostics
      </p>
      <p className="text-xs text-slate-600">
        KMeans auto-K tested multiple cluster counts and selected the best-scoring option.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
        <span className="ff-chip-accent">
          Selected K: <span className="font-semibold tabular-nums">{selectedK ?? '—'}</span>
        </span>
        <span className="ff-chip">
          Tested range:{' '}
          <span className="font-semibold tabular-nums">
            {minK ?? rows[0]?.k ?? '—'}-{maxK ?? rows[rows.length - 1]?.k ?? '—'}
          </span>
        </span>
      </div>
      <div className={`space-y-1.5 ${compact ? 'max-h-56 overflow-y-auto pr-1' : ''}`}>
        {rows.map((row) => {
          const isSelected = Boolean(row?.is_selected) || (selectedK != null && row?.k === selectedK);
          const barWidth = normalizeBar(row?.combined_score, maxCombinedScore);
          return (
            <div
              key={String(row?.k)}
              className={
                'rounded-lg border px-2.5 py-2 text-xs ' +
                (isSelected
                  ? 'border-emerald-200 bg-emerald-50/70 ring-1 ring-emerald-200'
                  : 'border-slate-200 bg-white/85')
              }
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-900">K={row?.k ?? '—'}</span>
                  {isSelected && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                      selected
                    </span>
                  )}
                </div>
                <span className="tabular-nums text-slate-700">score {fmt(row?.combined_score)}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className={
                    'h-full rounded-full ' +
                    (isSelected
                      ? 'bg-gradient-to-r from-emerald-500 to-accent-500'
                      : 'bg-gradient-to-r from-brand-500 to-accent-400')
                  }
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-2 text-[11px] text-slate-600">
                <span>score {fmt(row?.combined_score)}</span>
                <span>sil {fmt(row?.silhouette)}</span>
                <span>CH {fmt(row?.calinski_harabasz, 2)}</span>
                <span>DB {fmt(row?.davies_bouldin, 2)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default KMeansDiagnosticsPanel;
