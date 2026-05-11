// src/App.jsx
import React from 'react';
import AdminPage from './pages/AdminPage';
import SurveyParticipantView from './pages/SurveyParticipantView';

function getParticipantSurveyIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'participant' && params.get('surveyId')) {
    return params.get('surveyId');
  }
  return null;
}

function BrandMark({ size = 28 }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-indigo-700 text-white shadow-sm"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: size * 0.6, height: size * 0.6 }}
      >
        <path d="M3 3v18h18" />
        <path d="M7 14l3-3 3 3 5-6" />
      </svg>
    </span>
  );
}

function AppHeader({ mode = 'admin' }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="container flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">
              Family Feud Analytics
            </p>
            <p className="text-[11px] text-slate-500">
              Semantic survey clustering platform
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {mode === 'admin' ? (
            <span className="ff-chip">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
              Admin workspace
            </span>
          ) : (
            <span className="ff-chip">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse-dot" />
              Participant view
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function App() {
  const participantSurveyId = getParticipantSurveyIdFromUrl();

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader mode={participantSurveyId ? 'participant' : 'admin'} />

      <main className="flex-1">
        {participantSurveyId ? (
          <SurveyParticipantView surveyId={participantSurveyId} />
        ) : (
          <AdminPage />
        )}
      </main>

      <footer className="mt-12 border-t border-slate-200 bg-white/60">
        <div className="container py-4 text-center text-[11px] text-slate-500">
          Family Feud Survey Analytics · diploma project
        </div>
      </footer>
    </div>
  );
}

export default App;
