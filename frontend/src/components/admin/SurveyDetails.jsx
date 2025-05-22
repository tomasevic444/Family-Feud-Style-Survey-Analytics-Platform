// src/components/admin/SurveyDetails.jsx
import React, { useState, useEffect } from 'react';
import apiClient from '../../api';

function SurveyDetails({ surveyId }) {
  const [survey, setSurvey] = useState(null);
  const [rawResponses, setRawResponses] = useState([]);
  const [groupedResults, setGroupedResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processingMessage, setProcessingMessage] = useState('');

  useEffect(() => {
    if (!surveyId) {
      setSurvey(null);
      setRawResponses([]);
      setGroupedResults(null);
      return;
    }

    const fetchDetails = async () => {
      setIsLoading(true);
      setError(null);
      setProcessingMessage('');

      try {
        // Fetch survey details
        const surveyRes = await apiClient.get(`/surveys/${surveyId}`);
        setSurvey(surveyRes.data);

        // Fetch raw responses
        const rawRes = await apiClient.get(`/surveys/${surveyId}/responses/raw`);
        setRawResponses(rawRes.data);

        try {
          const groupedRes = await apiClient.get(`/surveys/${surveyId}/results`);
          setGroupedResults(groupedRes.data);
        } catch (resultsError) {
          if (resultsError.response && resultsError.response.status === 404) {
            setGroupedResults(null); 
            setProcessingMessage('Survey results not processed yet or no results found.');
          } else {
            console.error("Error fetching grouped results:", resultsError);
            setError('Failed to fetch grouped results.');
          }
        }
      } catch (err) {
        console.error("Error fetching survey details:", err);
        setError(`Failed to load details for survey ${surveyId}.`);
        setSurvey(null);
        setRawResponses([]);
        setGroupedResults(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [surveyId]);

  const handleProcessSurvey = async () => {
    if (!surveyId) return;
    setProcessingMessage('Processing request sent...');
    setError(null);
    try {
      const response = await apiClient.post(`/surveys/${surveyId}/process`);
      setProcessingMessage(`Processing queued (Task ID: ${response.data.task_id}). Refresh in a bit to see results.`);
      // Note: To see updated results, the user would need to refresh or we'd implement polling/websockets
    } catch (err) {
      console.error("Error triggering processing:", err);
      setError("Failed to trigger processing.");
      setProcessingMessage('');
    }
  };


  if (!surveyId) {
    return <div className="text-center text-gray-500 p-6">Select a survey to view its details.</div>;
  }

  if (isLoading) return <p className="text-center p-4">Loading survey details...</p>;
  if (error) return <p className="text-center p-4 text-red-600 bg-red-100">{error}</p>;
  if (!survey) return <p className="text-center p-4">Survey data not found.</p>;

  return (
    <div className="bg-white shadow-md rounded-lg p-6">
      <div className="mb-6 pb-4 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">{survey.question_text}</h2>
        <p className="text-sm text-gray-600">
          Status: <span className={`font-semibold ${survey.is_active ? 'text-green-600' : 'text-red-600'}`}>
            {survey.is_active ? 'Active' : 'Inactive'}
          </span> |
          Participant Limit: <span className="font-semibold">{survey.participant_limit}</span>
        </p>
        <button
            onClick={handleProcessSurvey}
            className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:shadow-outline transition duration-150 ease-in-out disabled:opacity-50"
        >
            Process Responses
        </button>
        {processingMessage && <p className="mt-2 text-sm text-blue-600">{processingMessage}</p>}
      </div>

      {/* Raw Responses Section */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-3">Raw Responses ({rawResponses.length})</h3>
        {rawResponses.length > 0 ? (
          <ul className="max-h-60 overflow-y-auto bg-gray-50 p-3 rounded border border-gray-200 text-sm">
            {rawResponses.map(resp => (
              <li key={resp.id} className="py-1 border-b border-gray-100 last:border-b-0">
                {resp.answer_text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-sm">No raw responses submitted yet.</p>
        )}
      </div>

      {/* Grouped Results Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-700 mb-3">Grouped Results</h3>
        {groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length > 0 ? (
          <div className="space-y-3">
            {groupedResults.grouped_answers.map((group, index) => (
              <div key={index} className="bg-gray-50 p-3 rounded border border-gray-200">
                <p className="font-semibold text-blue-700">
                  {group.canonical_name} <span className="text-xs font-normal text-gray-600">({group.count} responses)</span>
                </p>
                <ul className="text-xs text-gray-600 pl-4 list-disc">
                  {group.raw_answers.map((ans, i) => (
                    <li key={i}>{ans}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : groupedResults ? (
          <p className="text-gray-500 text-sm">No groups found in the processed results.</p>
        ) : (
          <p className="text-gray-500 text-sm">Results have not been processed or are unavailable.</p>
        )}
      </div>
    </div>
  );
}

export default SurveyDetails;