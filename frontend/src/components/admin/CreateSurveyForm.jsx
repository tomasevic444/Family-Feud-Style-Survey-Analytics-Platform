// src/components/admin/CreateSurveyForm.jsx
import React, { useState } from 'react';
import apiClient from '../../api';

function CreateSurveyForm({ onSurveyCreated }) {
  const [questionText, setQuestionText] = useState('');
  const [participantLimit, setParticipantLimit] = useState(500);
  const [isActive, setIsActive] = useState(false);
  const [tags, setTags] = useState(''); // Comma-separated string for simplicity
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!questionText.trim()) {
      setError("Question text cannot be empty.");
      return;
    }
    if (participantLimit <= 0) {
        setError("Participant limit must be greater than 0.");
        return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage('');

    const surveyData = {
      question_text: questionText,
      participant_limit: parseInt(participantLimit, 10),
      is_active: isActive,
      tags: tags.split(',').map(tag => tag.trim()).filter(tag => tag), // Convert to array, trim, filter empty
    };

    try {
      const response = await apiClient.post('/surveys/', surveyData);
      setSuccessMessage(`Survey "${response.data.question_text}" created successfully!`);
      // Reset form
      setQuestionText('');
      setParticipantLimit(500);
      setIsActive(false);
      setTags('');
      if (onSurveyCreated) {
        onSurveyCreated(response.data); // Notify parent to refresh list or similar
      }
    } catch (err) {
      console.error("Error creating survey:", err);
      if (err.response && err.response.data && err.response.data.detail) {
        if (Array.isArray(err.response.data.detail)) { // Handle Pydantic validation errors
            setError(err.response.data.detail.map(d => `${d.loc.join('.')} - ${d.msg}`).join('; '));
        } else {
            setError(`Creation failed: ${err.response.data.detail}`);
        }
      } else {
        setError("Failed to create survey. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white shadow-md rounded-lg p-6 mt-8">
      <h3 className="text-lg font-semibold text-gray-700 mb-4">Create New Survey</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="questionText" className="block text-sm font-medium text-gray-700">
            Question Text
          </label>
          <textarea
            id="questionText"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            rows="3"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            required
          />
        </div>

        <div>
          <label htmlFor="participantLimit" className="block text-sm font-medium text-gray-700">
            Participant Limit
          </label>
          <input
            type="number"
            id="participantLimit"
            value={participantLimit}
            onChange={(e) => setParticipantLimit(e.target.value)}
            min="1"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            required
          />
        </div>

        <div>
          <label htmlFor="tags" className="block text-sm font-medium text-gray-700">
            Tags (comma-separated)
          </label>
          <input
            type="text"
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="e.g., fun, general, work"
          />
        </div>

        <div className="flex items-center">
          <input
            id="isActive"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
          />
          <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
            Activate immediately
          </label>
        </div>

        {error && <div className="p-3 bg-red-100 text-red-700 border border-red-300 rounded text-sm">{error}</div>}
        {successMessage && <div className="p-3 bg-green-100 text-green-700 border border-green-300 rounded text-sm">{successMessage}</div>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isSubmitting ? 'Creating...' : 'Create Survey'}
        </button>
      </form>
    </div>
  );
}

export default CreateSurveyForm;