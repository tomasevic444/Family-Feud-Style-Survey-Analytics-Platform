import React, { useEffect } from 'react';

const BADGE_TONES = {
  recommended: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  default: 'bg-brand-50 text-brand-800 ring-brand-200',
  experimental: 'bg-amber-50 text-amber-900 ring-amber-200',
  heavy: 'bg-rose-50 text-rose-800 ring-rose-200',
  noisy: 'bg-sky-50 text-sky-800 ring-sky-200',
  multilingual: 'bg-violet-50 text-violet-800 ring-violet-200',
};

export const ADVISOR_PRESETS = [
  {
    id: 'fast_baseline',
    title: 'Fast baseline',
    badge: { label: 'Recommended', tone: 'recommended' },
    description: 'Best for quick, stable processing and local demos.',
    tradeoff: 'Tradeoff: requires threshold tuning when answers are very diverse.',
    summary: 'MiniLM · agglomerative · threshold 1.0',
    applyMode: 'replace',
    settings: {
      embedding_model: 'sentence-transformers/all-MiniLM-L6-v2',
      clustering_method: 'agglomerative_threshold',
      distance_threshold: 1.0,
      use_excluded_words: false,
      excluded_words: '',
    },
  },
  {
    id: 'auto_category_discovery',
    title: 'Auto category discovery',
    badge: { label: 'Recommended', tone: 'recommended' },
    description: 'Best when you do not know how many answer groups exist.',
    tradeoff: 'Tradeoff: can take longer on larger surveys because multiple K values are evaluated.',
    summary: 'MiniLM · KMeans auto-K · K 2–40',
    applyMode: 'replace',
    settings: {
      embedding_model: 'sentence-transformers/all-MiniLM-L6-v2',
      clustering_method: 'kmeans_auto_k',
      min_k: 2,
      max_k: 40,
      use_excluded_words: false,
      excluded_words: '',
    },
  },
  {
    id: 'known_category_count',
    title: 'Known category count',
    badge: { label: 'Recommended', tone: 'recommended' },
    description: 'Best when you already expect approximately how many categories should exist.',
    tradeoff: 'Tradeoff: wrong K can force over-splitting or over-merging.',
    summary: 'MiniLM · KMeans fixed-K · K 5',
    applyMode: 'replace',
    settings: {
      embedding_model: 'sentence-transformers/all-MiniLM-L6-v2',
      clustering_method: 'kmeans_fixed_k',
      fixed_k: 5,
      use_excluded_words: false,
      excluded_words: '',
    },
  },
  {
    id: 'noisy_answers_cleanup',
    title: 'Noisy answers cleanup',
    badge: { label: 'Noisy data', tone: 'noisy' },
    description: 'Best when responses contain placeholders or low-value answers.',
    tradeoff: 'Tradeoff: simple phrase matching can exclude meaningful answers if configured too broadly.',
    summary: 'Keeps current model/method · excluded words enabled',
    applyMode: 'patch',
    settings: {
      use_excluded_words: true,
      excluded_words: 'idk, no answer, nothing, n/a, -',
    },
    requiresValidModel: 'sentence-transformers/all-MiniLM-L6-v2',
    requiresValidMethodFallback: 'agglomerative_threshold',
  },
  {
    id: 'serbian_english_experimental',
    title: 'Serbian-English experimental',
    badge: { label: 'Experimental · Multilingual', tone: 'multilingual' },
    description: 'Experimental option for mixed Serbian-English answers.',
    tradeoff: 'Tradeoff: slower model load/runtime and not clearly better overall.',
    summary: 'BGE-M3 · KMeans auto-K · K 2–40',
    applyMode: 'replace',
    settings: {
      embedding_model: 'BAAI/bge-m3',
      clustering_method: 'kmeans_auto_k',
      min_k: 2,
      max_k: 40,
      use_excluded_words: false,
      excluded_words: '',
    },
  },
  {
    id: 'heavy_experimental',
    title: 'Heavy experimental',
    badge: { label: 'Heavy experimental', tone: 'heavy' },
    description: 'Heavy experimental model for advanced testing.',
    tradeoff: 'Tradeoff: high load time and no overall advantage in current benchmarks.',
    summary: 'E5-large-instruct · KMeans auto-K · K 2–40',
    applyMode: 'replace',
    settings: {
      embedding_model: 'intfloat/multilingual-e5-large-instruct',
      clustering_method: 'kmeans_auto_k',
      min_k: 2,
      max_k: 40,
      use_excluded_words: false,
      excluded_words: '',
    },
  },
];

const SUPPORTED_MODELS = new Set([
  'sentence-transformers/all-MiniLM-L6-v2',
  'BAAI/bge-m3',
  'intfloat/multilingual-e5-large-instruct',
]);
const SUPPORTED_METHODS = new Set([
  'agglomerative_threshold',
  'kmeans_auto_k',
  'kmeans_fixed_k',
]);

export function buildAdvisorConfigPatch(preset, currentConfig) {
  if (!preset) return {};
  if (preset.applyMode === 'patch') {
    const patch = { ...preset.settings };
    if (
      preset.requiresValidModel &&
      currentConfig &&
      !SUPPORTED_MODELS.has(currentConfig.embedding_model)
    ) {
      patch.embedding_model = preset.requiresValidModel;
    }
    if (
      preset.requiresValidMethodFallback &&
      currentConfig &&
      !SUPPORTED_METHODS.has(currentConfig.clustering_method)
    ) {
      patch.clustering_method = preset.requiresValidMethodFallback;
    }
    return patch;
  }
  return { ...preset.settings };
}

function Badge({ tone = 'default', children }) {
  const cls = BADGE_TONES[tone] || BADGE_TONES.default;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${cls}`}
    >
      {children}
    </span>
  );
}

function PresetCard({ preset, onApply }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-soft hover:shadow-card transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-900">{preset.title}</h4>
          {preset.badge && <Badge tone={preset.badge.tone}>{preset.badge.label}</Badge>}
        </div>
      </div>
      <p className="text-xs text-slate-700">{preset.description}</p>
      <p className="text-[11px] text-slate-500">{preset.tradeoff}</p>
      <div className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700">
        {preset.summary}
      </div>
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={() => onApply?.(preset)}
          className="ff-btn-secondary px-3 py-1 text-xs"
        >
          Apply settings
        </button>
      </div>
    </div>
  );
}

function ProcessingAdvisorModal({ show, onClose, onApplyPreset }) {
  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="advisor-title"
    >
      <div
        className="absolute inset-0 bg-night-900/65 backdrop-blur-md"
        onClick={onClose}
      />

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
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <div>
              <h3 id="advisor-title" className="text-base font-semibold text-slate-900">
                Processing advisor
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">
                Suggested presets derived from internal benchmark results. Apply one to pre-fill the
                form — review the settings before processing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ff-btn-ghost px-2 py-1"
            aria-label="Close advisor"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {ADVISOR_PRESETS.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                onApply={(p) => onApplyPreset?.(p)}
              />
            ))}
          </div>
          <p className="mt-4 text-[11px] text-slate-500">
            These suggestions are diagnostic guidance, not absolute rules. Review groups after each
            run and adjust as needed.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} className="ff-btn-ghost">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProcessingAdvisorModal;
