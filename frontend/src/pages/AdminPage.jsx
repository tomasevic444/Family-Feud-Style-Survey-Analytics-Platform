// src/pages/AdminPage.jsx
import React, { useState } from 'react';
import SurveyList from '../components/admin/SurveyList';
import SurveyDetails from '../components/admin/SurveyDetails';

function AdminPage() {
  const [selectedSurveyId, setSelectedSurveyId] = useState(null);

  const handleSelectSurvey = (surveyId) => {
    setSelectedSurveyId(surveyId);
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-gray-800">Admin Dashboard</h1>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          <SurveyList onSelectSurvey={handleSelectSurvey} />
          {/* Placeholder for Create Survey Form later */}
          {/* <CreateSurveyForm /> */}
        </div>

        <div className="md:col-span-2">
          <SurveyDetails surveyId={selectedSurveyId} />
        </div>
      </div>
    </div>
  );
}

export default AdminPage;