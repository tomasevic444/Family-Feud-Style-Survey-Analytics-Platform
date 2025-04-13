// src/App.jsx
import React from 'react';
import SurveyParticipantView from './components/SurveyParticipantView';
// Removed import './App.css' as it's empty

function App() {
  return (
    <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-100 min-h-screen py-10 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      {/* You could potentially add routing here later to dynamically
          pass surveyId based on the URL, but for now, we use the
          default ID set inside SurveyParticipantView */}
      <SurveyParticipantView />
    </div>
  );
}

export default App;