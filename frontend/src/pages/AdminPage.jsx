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
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
            Survey workspace
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage surveys, run semantic clustering, and review grouped results.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className={showCreate ? 'ff-btn-secondary' : 'ff-btn-primary'}
          aria-expanded={showCreate}
        >
          {showCreate ? (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M6 18 18 6M6 6l12 12" />
              </svg>
              Close
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              New survey
            </>
          )}
        </button>
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

        <section className="lg:col-span-8 xl:col-span-9 min-w-0">
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
