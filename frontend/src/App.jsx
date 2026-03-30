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

function App() {
  const participantSurveyId = getParticipantSurveyIdFromUrl();

  return (
    <div className="bg-gray-100 min-h-screen">
      {participantSurveyId ? (
        <SurveyParticipantView surveyId={participantSurveyId} />
      ) : (
        <AdminPage />
      )}
    </div>
  );
}

export default App;
