// src/components/admin/SurveyList.jsx
import React, { useState, useEffect, useMemo } from 'react';
import apiClient from '../../api';

function getId(survey) {
  return survey?._id || survey?.id;
}

function SurveyList({ onSelectSurvey, selectedSurveyId }) {
  const [surveys, setSurveys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    apiClient
      .get('/surveys/?limit=100')
      .then((response) => {
        if (cancelled) return;
        setSurveys(Array.isArray(response.data) ? response.data : []);
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Error fetching surveys:', err);
        setError('Failed to load surveys.');
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return surveys.filter((s) => {
      if (filter === 'active' && !s.is_active) return false;
      if (filter === 'inactive' && s.is_active) return false;
      if (!q) return true;
      const text = `${s.question_text || ''} ${(s.tags || []).join(' ')}`.toLowerCase();
      return text.includes(q);
    });
  }, [surveys, search, filter]);

  const activeCount = useMemo(
    () => surveys.filter((s) => s.is_active).length,
    [surveys]
  );

  return (
    <div className="ff-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-white via-brand-50/50 to-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white shadow-glow">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
          </span>
          <div>
            <h2 className="ff-section-title leading-tight">Surveys</h2>
            <p className="ff-section-subtitle">
              {isLoading
                ? 'Loading…'
                : `${surveys.length} total · ${activeCount} active`}
            </p>
          </div>
        </div>
        <span
          className="inline-flex items-center justify-center rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-100"
          title="Total surveys"
        >
          {surveys.length}
        </span>
      </div>

      <div className="space-y-2 border-b border-slate-200 px-4 py-3">
        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search surveys…"
            className="ff-input pl-8"
            aria-label="Search surveys"
          />
        </div>
        <div className="flex gap-1.5" role="tablist" aria-label="Filter surveys">
          {[
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Active' },
            { id: 'inactive', label: 'Inactive' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={filter === opt.id}
              onClick={() => setFilter(opt.id)}
              className={
                filter === opt.id
                  ? 'rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white'
                  : 'rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        {isLoading ? (
          <ul className="space-y-2 p-3">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="ff-skeleton h-16" />
            ))}
          </ul>
        ) : error ? (
          <div className="p-4">
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M9 13h6M9 17h4" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-700">
              {surveys.length === 0 ? 'No surveys yet' : 'No surveys match your filters'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {surveys.length === 0
                ? 'Click “New survey” to create your first one.'
                : 'Try a different search term or filter.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5 p-2">
            {filtered.map((survey) => {
              const id = getId(survey);
              const isSelected = id && id === selectedSurveyId;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onSelectSurvey(id)}
                    aria-current={isSelected ? 'true' : undefined}
                    className={
                      'group relative block w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left transition ' +
                      (isSelected
                        ? 'border-brand-300/70 bg-gradient-to-br from-brand-50 via-white to-accent-50/40 shadow-glow ring-1 ring-brand-200/70'
                        : 'border-transparent hover:border-slate-200 hover:bg-slate-50')
                    }
                  >
                    {isSelected && (
                      <span
                        className="pointer-events-none absolute inset-y-1 left-0 w-0.5 rounded-r bg-gradient-to-b from-brand-500 to-accent-500"
                        aria-hidden="true"
                      />
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <p
                        className={
                          'line-clamp-2 text-sm font-medium ' +
                          (isSelected ? 'text-brand-900' : 'text-slate-800 group-hover:text-slate-900')
                        }
                      >
                        {survey.question_text || 'Untitled survey'}
                      </p>
                      <span
                        className={
                          'mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ' +
                          (survey.is_active
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-slate-100 text-slate-600 ring-slate-200')
                        }
                      >
                        <span
                          className={
                            'h-1.5 w-1.5 rounded-full ' +
                            (survey.is_active ? 'bg-emerald-500' : 'bg-slate-400')
                          }
                        />
                        {survey.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="ff-chip">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-3 w-3"
                          aria-hidden="true"
                        >
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        Limit {survey.participant_limit ?? '—'}
                      </span>
                      {Array.isArray(survey.tags) && survey.tags.length > 0 && (
                        <span className="ff-chip">#{survey.tags[0]}{survey.tags.length > 1 ? ` +${survey.tags.length - 1}` : ''}</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SurveyList;
