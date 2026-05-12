import React, { useEffect } from 'react';

function formatUtcLabel(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function safeNumber(value, fallback = '—') {
  return value === null || value === undefined ? fallback : value;
}

function PipelineSummary({ run }) {
  if (!run) return null;
  const parts = [];
  if (run.clustering_method) parts.push(run.clustering_method);
  if (run.clustering_method === 'agglomerative_threshold' && run.distance_threshold != null) {
    parts.push(`threshold ${run.distance_threshold}`);
  }
  if (run.selected_k != null) parts.push(`selected K ${run.selected_k}`);
  if (run.clustering_method === 'kmeans_fixed_k' && run.fixed_k != null) {
    parts.push(`fixed K ${run.fixed_k}`);
  }
  if (run.clustering_method === 'kmeans_auto_k' && run.min_k != null && run.max_k != null) {
    parts.push(`K range ${run.min_k}-${run.max_k}`);
  }
  return <span>{parts.join(' · ') || '—'}</span>;
}

function DiffCell({ active, preview, label, format = (v) => v }) {
  const a = active === null || active === undefined ? '—' : format(active);
  const p = preview === null || preview === undefined ? '—' : format(preview);
  const same = String(active ?? '') === String(preview ?? '');
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
        <span className="text-slate-700">
          <span className="text-[10px] uppercase text-slate-400">Active </span>
          <span className="font-medium text-slate-900">{a}</span>
        </span>
        <span className={same ? 'text-slate-500' : 'text-brand-700'}>
          <span className="text-[10px] uppercase text-slate-400">Preview </span>
          <span className={same ? 'font-medium' : 'font-semibold'}>{p}</span>
        </span>
      </div>
    </div>
  );
}

function RunPreviewModal({
  show,
  onClose,
  snapshot,
  active,
  isLoading,
  error,
  onUseSettings,
  onActivate,
  canActivate,
  isActivating,
}) {
  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isActivating) onClose && onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, isActivating, onClose]);

  if (!show) return null;
  const groupSummary = snapshot?.group_summary || [];
  const groupedAnswers = snapshot?.grouped_answers || [];
  const similarGroupPairs = (snapshot?.similar_group_pairs || []).filter(
    (pair) => typeof pair?.similarity === 'number' && pair.similarity >= 0.75
  );
  const runMetaPairs = [
    ['Run label', snapshot?.run_label || '—'],
    ['Status', snapshot?.status || '—'],
    ['Run timestamp', formatUtcLabel(snapshot?.run_timestamp_utc)],
    ['Embedding model', snapshot?.embedding_model || snapshot?.model_name || '—'],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-preview-title"
    >
      <div className="absolute inset-0 bg-night-900/65 backdrop-blur-md" onClick={onClose} />

      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-card-lift ring-1 ring-slate-200 animate-scale-in">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-white via-brand-50/40 to-accent-50/30 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="ff-brand-mark mt-0.5 h-9 w-9">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="relative z-10 h-5 w-5"
                aria-hidden="true"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </span>
            <div>
              <h3 id="run-preview-title" className="text-base font-semibold text-slate-900">
                Run preview
              </h3>
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-700">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4" />
                  <path d="M12 16h.01" />
                </svg>
                Preview only — this is not the active result.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ff-btn-ghost px-2 py-1"
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {isLoading && (
            <div className="space-y-2">
              <div className="ff-skeleton h-5 w-1/2" />
              <div className="ff-skeleton h-20 w-full" />
              <div className="ff-skeleton h-20 w-full" />
            </div>
          )}
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              {error}
            </div>
          )}

          {!isLoading && snapshot && (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {runMetaPairs.map(([k, v]) => (
                  <div
                    key={k}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">{k}</div>
                    <div className="mt-0.5 text-sm text-slate-800">{v}</div>
                  </div>
                ))}
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Pipeline</div>
                  <div className="mt-0.5 text-sm text-slate-800">
                    <PipelineSummary run={snapshot} />
                  </div>
                </div>
              </div>

              {active && (
                <div>
                  <p className="ff-label">Difference vs active result</p>
                  <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <DiffCell
                      label="Output groups"
                      active={active.output_group_count}
                      preview={snapshot.output_group_count}
                    />
                    <DiffCell
                      label="Processed answers"
                      active={active.processed_answer_count}
                      preview={snapshot.processed_answer_count}
                    />
                    <DiffCell
                      label="Excluded answers"
                      active={active.excluded_answer_count}
                      preview={snapshot.excluded_answer_count}
                    />
                    <DiffCell
                      label="Method · model"
                      active={`${active.clustering_method ?? '—'} · ${active.embedding_model ?? active.model_name ?? '—'}`}
                      preview={`${snapshot.clustering_method ?? '—'} · ${snapshot.embedding_model ?? snapshot.model_name ?? '—'}`}
                    />
                  </div>
                </div>
              )}

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">
                    Group summary
                  </span>
                  <span className="ff-chip">{groupSummary.length}</span>
                </div>
                {groupSummary.length === 0 ? (
                  <p className="px-3 py-3 text-sm italic text-slate-500">
                    No groups in this snapshot.
                  </p>
                ) : (
                  <ul className="max-h-44 overflow-y-auto divide-y divide-slate-100">
                    {groupSummary.map((g) => (
                      <li
                        key={g.canonical_name}
                        className="flex items-center justify-between px-3 py-1.5 text-sm text-slate-800"
                      >
                        <span className="truncate">{g.canonical_name}</span>
                        <span className="tabular-nums text-slate-600">{safeNumber(g.count)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {groupedAnswers.length > 0 && (
                <details className="overflow-hidden rounded-lg border border-slate-200">
                  <summary className="cursor-pointer bg-slate-50 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">
                    Raw answers per group ({groupedAnswers.length})
                  </summary>
                  <ul className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                    {groupedAnswers.map((g) => (
                      <li key={g.canonical_name} className="px-3 py-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="truncate font-medium text-slate-800">
                            {g.canonical_name}
                          </span>
                          <span className="tabular-nums text-xs text-slate-500">
                            {safeNumber(g.count)}
                          </span>
                        </div>
                        {Array.isArray(g.raw_answers) && g.raw_answers.length > 0 && (
                          <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">
                            {g.raw_answers.map((ans, i) => (
                              <li key={`${g.canonical_name}-${i}`}>{ans}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {similarGroupPairs.length > 0 && (
                <div className="rounded-lg border border-brand-100 bg-brand-50/70 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-brand-900/80">
                    Potentially similar groups (≥ 75%)
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-brand-900/90">
                    {similarGroupPairs.map((pair, idx) => (
                      <li key={`${pair.source_group}-${pair.target_group}-${idx}`}>
                        <span className="font-medium">{pair.source_group}</span> ↔{' '}
                        <span className="font-medium">{pair.target_group}</span>{' '}
                        <span className="text-brand-800/80">
                          ({Math.round((pair.similarity || 0) * 100)}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={() => onUseSettings && onUseSettings(snapshot)}
            disabled={!snapshot}
            className="ff-btn-secondary"
          >
            Use settings
          </button>
          <button
            type="button"
            onClick={() => onActivate && onActivate(snapshot)}
            disabled={!canActivate || isActivating}
            title={
              canActivate
                ? 'Replace the currently displayed grouped result with this snapshot'
                : 'Only completed runs with grouped data can be set as active'
            }
            className="ff-btn-primary"
          >
            {isActivating ? 'Activating…' : 'Set as active result'}
          </button>
          <button type="button" onClick={onClose} className="ff-btn-ghost">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default RunPreviewModal;
