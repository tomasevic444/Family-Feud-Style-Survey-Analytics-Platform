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

function BrandMark({ size = 30 }) {
  return (
    <span
      className="ff-brand-mark"
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
        style={{ width: size * 0.55, height: size * 0.55, position: 'relative', zIndex: 1 }}
      >
        <path d="M3 3v18h18" />
        <path d="M7 14l3-3 3 3 5-6" />
      </svg>
    </span>
  );
}

function AppHeader({ mode = 'admin' }) {
  return (
    <header className="ff-topbar sticky top-0 z-30">
      <div className="container relative z-10 flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">
              Family Feud Analytics
            </p>
            <p className="text-[11px] text-slate-400">
              AI Analytics Lab · Semantic survey clustering
            </p>
          </div>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          {mode === 'admin' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-inset ring-white/10 backdrop-blur">
              <span className="ff-live-dot" />
              Admin workspace
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-inset ring-white/10 backdrop-blur">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]" />
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
    <div className="flex min-h-screen flex-col">
      <AppHeader mode={participantSurveyId ? 'participant' : 'admin'} />

      <main className="flex-1">
        {participantSurveyId ? (
          <SurveyParticipantView surveyId={participantSurveyId} />
        ) : (
          <AdminPage />
        )}
      </main>

      <footer className="border-t border-slate-200/70 bg-white/40 backdrop-blur">
        <div className="container flex flex-col items-center justify-between gap-1 py-4 text-[11px] text-slate-500 sm:flex-row">
          <span>
            Family Feud Survey Analytics · diploma project
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <span className="inline-block h-1 w-1 rounded-full bg-brand-400" />
            Powered by semantic embeddings
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
