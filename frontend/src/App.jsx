// src/App.jsx
import React from 'react';
// import SurveyParticipantView from './components/SurveyParticipantView'; 
import AdminPage from './pages/AdminPage'; // Import the new AdminPage

function App() {
  return (
    <div className="bg-gray-100 min-h-screen">
      {/* <SurveyParticipantView /> */}
      <AdminPage />
    </div>
  );
}

export default App;