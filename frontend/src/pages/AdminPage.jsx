// src/pages/AdminPage.jsx
import React, { useState, useCallback } from 'react';
import SurveyList from '../components/admin/SurveyList';
import SurveyDetails from '../components/admin/SurveyDetails';
import CreateSurveyForm from '../components/admin/CreateSurveyForm';

function AdminPage() {
  const [selectedSurveyId, setSelectedSurveyId] = useState(null);
  const [surveyListKey, setSurveyListKey] = useState(Date.now());

  const handleSelectSurvey = (surveyId) => {
    setSelectedSurveyId(surveyId);
  };

  // This function will be called by CreateSurveyForm after a new survey is made
  const handleSurveyCreated = useCallback(() => {
    console.log("AdminPage: New survey created, refreshing list.");
    setSurveyListKey(Date.now()); 
    setSelectedSurveyId(null); 
  }, []);


  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-gray-800">Admin Dashboard</h1>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-8"> 
          <CreateSurveyForm onSurveyCreated={handleSurveyCreated} />
          <SurveyList key={surveyListKey} onSelectSurvey={handleSelectSurvey} />      
        </div>

        <div className="md:col-span-2">
          <SurveyDetails surveyId={selectedSurveyId} />
        </div>
      </div>
    </div>
  );
}

export default AdminPage;