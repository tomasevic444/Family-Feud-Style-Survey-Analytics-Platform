// src/components/admin/SurveyList.jsx
import React, { useState, useEffect } from 'react';
import apiClient from '../../api';

function SurveyList({ onSelectSurvey }) {
  const [surveys, setSurveys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiClient.get('/surveys/?limit=100') // Fetch up to 100 surveys
      .then(response => {
        setSurveys(response.data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Error fetching surveys:", err);
        setError("Failed to load surveys.");
        setIsLoading(false);
      });
  }, []);

  if (isLoading) return <p className="text-center p-4">Loading surveys...</p>;
  if (error) return <p className="text-center p-4 text-red-600 bg-red-100">{error}</p>;

  return (
    <div className="bg-white shadow-md rounded-lg p-6 mb-8">
      <h2 className="text-xl font-semibold text-gray-700 mb-4">Surveys</h2>
      {surveys.length === 0 ? (
        <p className="text-gray-500">No surveys found.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {surveys.map(survey => (
  <li key={survey._id } className="py-3"> {}
    <button
      onClick={() => {
        const idToPass = survey._id ; 
        onSelectSurvey(idToPass);
      }}
                className="w-full text-left px-2 py-1 hover:bg-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <p className="text-md font-medium text-blue-600 hover:text-blue-800">{survey.question_text}</p>
                <p className="text-xs text-gray-500">
                  Status: {survey.is_active ? 'Active' : 'Inactive'} | Limit: {survey.participant_limit}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SurveyList;