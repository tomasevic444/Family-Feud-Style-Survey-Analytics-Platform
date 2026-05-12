// src/pages/AdminPage.jsx
import React, { useState, useCallback } from 'react';
import SurveyList from '../components/admin/SurveyList';
import SurveyDetails from '../components/admin/SurveyDetails';
import CreateSurveyForm from '../components/admin/CreateSurveyForm';

function AdminPage() {
  const [selectedSurveyId, setSelectedSurveyId] = useState(null);
  const [surveyListKey, setSurveyListKey] = useState(Date.now());
  const [showCreate, setShowCreate] = useState(false);

  const handleSelectSurvey = (surveyId) => {
    setSelectedSurveyId(surveyId);
  };

  const refreshSurveyList = useCallback(() => {
    setSurveyListKey(Date.now());
  }, []);

  const handleSurveyCreated = useCallback(
    (survey) => {
      refreshSurveyList();
      setShowCreate(false);
      if (survey && (survey._id || survey.id)) {
        setSelectedSurveyId(survey._id || survey.id);
      }
    },
    [refreshSurveyList]
  );

  return (
    <div className="container py-6 md:py-8">
      <div className="ff-hero-dark mb-6 px-6 py-7 sm:px-8 sm:py-8">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200/90">
              <span className="ff-live-dot" />
              AI Analytics Lab
            </p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight text-white sm:text-3xl">
              Survey workspace
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-slate-300/90">
              Manage surveys, run semantic clustering, and review grouped results
              with quality insights tuned for human review.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-inset ring-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-brand-300" aria-hidden="true">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                Semantic clustering
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-inset ring-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-accent-300" aria-hidden="true">
                  <path d="M3 3v18h18" />
                  <rect x="7" y="13" width="3" height="5" rx="1" />
                  <rect x="12" y="9" width="3" height="9" rx="1" />
                  <rect x="17" y="6" width="3" height="12" rx="1" />
                </svg>
                Quality insights
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-inset ring-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-emerald-300" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z" />
                  <path d="M12 8v4l3 2" />
                </svg>
                Versioned runs
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              aria-expanded={showCreate}
              className={
                showCreate
                  ? 'ff-btn-on-dark'
                  : 'ff-btn-primary shadow-glow'
              }
            >
              {showCreate ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M6 18 18 6M6 6l12 12" />
                  </svg>
                  Close
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  New survey
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {showCreate && (
        <div className="mb-6 animate-scale-in">
          <CreateSurveyForm
            onSurveyCreated={handleSurveyCreated}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <aside className="lg:col-span-4 xl:col-span-3">
          <div className="lg:sticky lg:top-20">
            <SurveyList
              key={surveyListKey}
              onSelectSurvey={handleSelectSurvey}
              selectedSurveyId={selectedSurveyId}
            />
          </div>
        </aside>

        <section className="min-w-0 lg:col-span-8 xl:col-span-9">
          <SurveyDetails
            surveyId={selectedSurveyId}
            onSurveyUpdate={refreshSurveyList}
          />
        </section>
      </div>
    </div>
  );
}

export default AdminPage;
