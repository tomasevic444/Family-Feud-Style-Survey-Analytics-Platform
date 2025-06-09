// src/components/admin/SurveyDetails.jsx
import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api';
import SurveyResultsChart from './SurveyResultsChart'; // <-- Import the chart component

function SurveyDetails({ surveyId, onSurveyUpdate }) {
  const [survey, setSurvey] = useState(null);
  const [rawResponses, setRawResponses] = useState([]);
  const [groupedResults, setGroupedResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [error, setError] = useState(null);
  const [processingMessage, setProcessingMessage] = useState('');
  const [statusUpdateMessage, setStatusUpdateMessage] = useState('');

  const fetchSurveyDetails = useCallback(async () => {
    if (!surveyId) {
        setSurvey(null);
        setRawResponses([]);
        setGroupedResults(null);
        setError(null);
        setProcessingMessage('');
        setStatusUpdateMessage('');
        return;
    }
    setIsLoading(true);
    setError(null);
    setProcessingMessage('');
    setStatusUpdateMessage('');
    setGroupedResults(null); // Reset grouped results before fetching

    try {
      // Fetch survey details
      const surveyRes = await apiClient.get(`/surveys/${surveyId}`);
      setSurvey(surveyRes.data);

      // Fetch raw responses
      const rawRes = await apiClient.get(`/surveys/${surveyId}/responses/raw`);
      setRawResponses(rawRes.data);

      try {
        const groupedRes = await apiClient.get(`/surveys/${surveyId}/results`);
        if (groupedRes.data && groupedRes.data.grouped_answers) {
          setGroupedResults(groupedRes.data);
        } else {
          setGroupedResults({ grouped_answers: [] }); // Set empty if no groups
          setProcessingMessage('Survey results processed but no groups found.');
        }
      } catch (resultsError) {
        if (resultsError.response && resultsError.response.status === 404) {
          setGroupedResults(null); 
          setProcessingMessage('Survey results not processed yet or no results found.');
        } else {
          console.error("Error fetching grouped results:", resultsError);
          setError('Failed to fetch grouped results.');
          setGroupedResults(null);
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
  }, [surveyId]); // Dependency: only re-run if surveyId changes

  useEffect(() => {
    fetchSurveyDetails();
  }, [fetchSurveyDetails]); // fetchSurveyDetails is memoized by useCallback

  const handleProcessSurvey = async () => {
    if (!surveyId) return;
    setProcessingMessage('Processing request sent...');
    setStatusUpdateMessage(''); // Clear other messages
    setError(null);
    try {
      const response = await apiClient.post(`/surveys/${surveyId}/process`);
      setProcessingMessage(`Processing queued (Task ID: ${response.data.task_id}). Refresh after a few moments to see updated results.`);
    } catch (err) {
      console.error("Error triggering processing:", err);
      setError("Failed to trigger processing.");
      setProcessingMessage('');
    }
  };

  const handleToggleActiveStatus = async () => {
    if (!survey)  {
      console.error("SurveyDetails: handleToggleActiveStatus called but survey is null!");
      return;}
       console.log("SurveyDetails: Toggling status for survey object:", survey); // <-- ADD THIS
  console.log("SurveyDetails: Survey ID being used:", survey.id); // <-- ADD THIS
    setIsUpdatingStatus(true);
    setStatusUpdateMessage('');
    setError(null);

    const newStatus = !survey.is_active;
    try {
      const response = await apiClient.put(`/surveys/${survey._id}/`, {
        is_active: newStatus
      });
      setSurvey(response.data); // Update local survey state
      setStatusUpdateMessage(`Survey status updated to ${newStatus ? 'Active' : 'Inactive'}.`);
      if (onSurveyUpdate) {
        onSurveyUpdate(); // Notify parent (AdminPage) to refresh the survey list
      }
    } catch (err) {
      console.error("Error updating survey status:", err);
      setError("Failed to update survey status.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  if (!surveyId) {
    return <div className="text-center text-gray-500 p-6 bg-white shadow-md rounded-lg">Select a survey to view its details.</div>;
  }

  if (isLoading) return <div className="text-center p-10 bg-white shadow-md rounded-lg">Loading survey details...</div>;
  if (error && !survey) {
      return <div className="text-center p-4 text-red-600 bg-red-100 border border-red-400 rounded-md shadow">{error}</div>;
  }
  
  if (!survey) return <div className="text-center p-4 bg-white shadow-md rounded-lg">Survey data not found.</div>;

  return (
    <div className="bg-white shadow-md rounded-lg p-6 space-y-8">
      <div className="pb-4 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">{survey.question_text}</h2>
        <div className="flex items-center space-x-4 mb-2">
            <p className="text-sm text-gray-600">
            Status: <span className={`font-semibold ${survey.is_active ? 'text-green-600' : 'text-red-600'}`}>
                {survey.is_active ? 'Active' : 'Inactive'}
          </span>
            </p>
            <p className="text-sm text-gray-600">
            Participant Limit: <span className="font-semibold">{survey.participant_limit}</span>
            </p>
        </div>

        <div className="flex flex-wrap gap-3 mt-4"> 
            <button
                onClick={handleToggleActiveStatus}
                disabled={isUpdatingStatus}
                className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50
                            ${survey.is_active
                                ? 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-400'
                                : 'bg-green-500 hover:bg-green-600 text-white focus:ring-green-400'
                            }`}
            >
                {isUpdatingStatus ? 'Updating...' : (survey.is_active ? 'Deactivate Survey' : 'Activate Survey')}
            </button>

            <button
                onClick={handleProcessSurvey}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
                Process Responses
            </button>
        </div>
        {statusUpdateMessage && <p className="mt-3 text-sm text-green-700">{statusUpdateMessage}</p>}
        {processingMessage && <p className="mt-3 text-sm text-blue-700">{processingMessage}</p>}
        {error && !statusUpdateMessage && !processingMessage && <p className="mt-3 text-sm text-red-700 bg-red-100 p-2 rounded">{error}</p>}
      </div>

      {/* Chart Section - Render if groupedResults and grouped_answers exist */}
      {groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length > 0 ? (
        <SurveyResultsChart data={groupedResults.grouped_answers} />
      ) : groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length === 0 ? (
        <div className="chart-container p-4 border border-gray-300 rounded-lg shadow bg-white">
            <h4 className="text-md font-semibold text-gray-700 mb-3 text-center">Survey Response Distribution</h4>
            <p className="text-sm text-gray-500 p-4 text-center">No grouped data to display in chart (results processed but no groups formed).</p>
        </div>
      ) : null /* Don't render chart section if groupedResults is null (e.g., not processed) */
      }


      {/* Grouped Results Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-700 mb-3">Grouped Results (Text)</h3>
        {groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length > 0 ? (
          <div className="space-y-3 max-h-80 overflow-y-auto bg-gray-50 p-3 rounded border border-gray-200">
            {groupedResults.grouped_answers.map((group, index) => (
              <div key={group.canonical_name + index} className="bg-white p-3 rounded border border-gray-200 shadow-sm"> 
                <p className="font-semibold text-blue-700">
                  {group.canonical_name} <span className="text-xs font-normal text-gray-600">({group.count} responses)</span>
                </p>
                {group.raw_answers && group.raw_answers.length > 0 && (
                    <ul className="text-xs text-gray-600 pl-4 list-disc">
                    {group.raw_answers.map((ans, i) => (
                        <li key={i}>{ans}</li>
                    ))}
                    </ul>
                )}
              </div>
            ))}
          </div>
        ) : groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length === 0 ? (
          <p className="text-gray-500 text-sm">No groups found in the processed results.</p>
        ) : (
          <p className="text-gray-500 text-sm">Results have not been processed or are unavailable.</p>
        )}
      </div>

       {/* Raw Responses Section */}
      <div className="mt-6">
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
    </div>
  );
}

export default SurveyDetails;