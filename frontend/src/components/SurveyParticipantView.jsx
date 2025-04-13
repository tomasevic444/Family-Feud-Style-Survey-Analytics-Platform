// src/components/SurveyParticipantView.jsx
import React, { useState, useEffect } from 'react';
import apiClient from '../api'; // Import the api client

const DEFAULT_SURVEY_ID = "67f65f51c41570ff09c257c9";


function SurveyParticipantView({ surveyId = DEFAULT_SURVEY_ID }) {
  const [survey, setSurvey] = useState(null);
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch Survey Question
  useEffect(() => {
    if (!surveyId) {
      setError("No Survey ID provided.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null); // Clear previous errors
    setSuccessMessage(''); // Clear previous success messages

    apiClient.get(`/surveys/${surveyId}`)
      .then(response => {
        if (!response.data.is_active) {
            setError(`Survey "${response.data.question_text}" is not currently active.`);
            setSurvey(null);
        } else {
            setSurvey(response.data);
        }
      })
      .catch(err => {
        console.error("Error fetching survey:", err);
        if (err.response && err.response.status === 404) {
          setError(`Survey with ID ${surveyId} not found.`);
        } else {
          setError("Failed to load the survey question. Please try again later.");
        }
        setSurvey(null); // Ensure survey is null on error
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [surveyId]); // Re-run effect if surveyId changes

  // Handle Answer Submission
  const handleSubmit = async (e) => {
    e.preventDefault(); // Prevent default form submission
    if (!answer.trim()) {
      setError("Please enter an answer.");
      return;
    }
    if (!survey) {
        setError("Cannot submit, survey data not loaded correctly.");
        return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage('');

    try {
      const response = await apiClient.post(`/surveys/${survey.id}/responses/`, {
        answer_text: answer,
      });
      setSuccessMessage(`Answer "${response.data.answer_text}" submitted successfully!`);
      setAnswer(''); // Clear the input field
    } catch (err) {
      console.error("Error submitting answer:", err);
      if (err.response && err.response.data && err.response.data.detail) {
         // Display specific error from backend if available
        setError(`Submission failed: ${err.response.data.detail}`);
      } else {
        setError("Failed to submit answer. Please check your connection and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Rendering Logic ---
  if (isLoading) {
    return <div className="text-center p-10">Loading survey...</div>;
  }

  // Display error if survey couldn't be loaded or isn't active
  if (error && !survey) {
    return <div className="text-center p-10 text-red-600 bg-red-100 border border-red-400 rounded-md shadow">{error}</div>;
  }

  // If survey loaded but became inactive (e.g., fetched then admin changed it - unlikely here but good practice)
  if (!survey) {
     return <div className="text-center p-10 text-orange-600 bg-orange-100 border border-orange-400 rounded-md shadow">Survey could not be loaded or is inactive.</div>;
  }


  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg border border-gray-200">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6 text-center">
        {survey.question_text}
      </h2>

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="answerInput" className="block text-gray-700 text-sm font-bold mb-2 sr-only">
            Your Answer
          </label>
          <input
            id="answerInput"
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer here..."
            disabled={isSubmitting}
            className="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
          />
        </div>

        {/* Display submission error messages */}
        {error && <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded text-sm">{error}</div>}

        {/* Display success messages */}
        {successMessage && <div className="mb-4 p-3 bg-green-100 text-green-700 border border-green-300 rounded text-sm">{successMessage}</div>}


        <div className="flex items-center justify-center">
          <button
            type="submit"
            disabled={isSubmitting || !survey} // Also disable if survey somehow isn't loaded
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-md focus:outline-none focus:shadow-outline transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Answer'}
          </button>
        </div>
      </form>
      <p className="text-center text-xs text-gray-500 mt-4">Limit: {survey.participant_limit} responses</p>
    </div>
  );
}

export default SurveyParticipantView;