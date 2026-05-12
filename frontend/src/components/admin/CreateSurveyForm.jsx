// src/components/admin/CreateSurveyForm.jsx
import React, { useState } from 'react';
import apiClient from '../../api';

function CreateSurveyForm({ onSurveyCreated, onCancel }) {
  const [questionText, setQuestionText] = useState('');
  const [participantLimit, setParticipantLimit] = useState(500);
  const [isActive, setIsActive] = useState(true);
  const [tags, setTags] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!questionText.trim()) {
      setError('Question text cannot be empty.');
      return;
    }
    const limitNum = parseInt(participantLimit, 10);
    if (Number.isNaN(limitNum) || limitNum <= 0) {
      setError('Participant limit must be greater than 0.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage('');

    const surveyData = {
      question_text: questionText,
      participant_limit: limitNum,
      is_active: isActive,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag),
    };

    try {
      const response = await apiClient.post('/surveys/', surveyData);
      setSuccessMessage(`Survey created successfully.`);
      setQuestionText('');
      setParticipantLimit(500);
      setIsActive(true);
      setTags('');
      if (onSurveyCreated) onSurveyCreated(response.data);
    } catch (err) {
      console.error('Error creating survey:', err);
      if (err.response && err.response.data && err.response.data.detail) {
        if (Array.isArray(err.response.data.detail)) {
          setError(
            err.response.data.detail
              .map((d) => `${d.loc.join('.')} – ${d.msg}`)
              .join('; ')
          );
        } else {
          setError(`Creation failed: ${err.response.data.detail}`);
        }
      } else {
        setError('Failed to create survey. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ff-card ff-card-topline overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-white via-brand-50/40 to-accent-50/30 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="ff-brand-mark mt-0.5 h-9 w-9">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="relative z-10 h-5 w-5"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Create new survey</h3>
            <p className="ff-section-subtitle">
              Define a question, set a participant limit, and choose whether it starts active.
            </p>
          </div>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="ff-btn-ghost px-2 py-1 text-xs"
            aria-label="Close form"
          >
            ✕
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
        <div>
          <label htmlFor="questionText" className="ff-label">
            Question text
          </label>
          <textarea
            id="questionText"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            rows="3"
            className="ff-input resize-y"
            placeholder="e.g. Name a popular pet"
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            Phrase the question clearly so participants give short, comparable answers.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="participantLimit" className="ff-label">
              Participant limit
            </label>
            <input
              type="number"
              id="participantLimit"
              value={participantLimit}
              onChange={(e) => setParticipantLimit(e.target.value)}
              min="1"
              className="ff-input"
              required
            />
          </div>
          <div>
            <label htmlFor="tags" className="ff-label">
              Tags
            </label>
            <input
              type="text"
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="ff-input"
              placeholder="e.g. fun, general, work"
            />
            <p className="mt-1 text-xs text-slate-500">Comma-separated.</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <label htmlFor="isActive" className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium text-slate-900">
                Activate immediately
              </span>
              <span className="block text-xs text-slate-500">
                Active surveys accept participant responses right away.
              </span>
            </span>
            <span className="relative inline-flex h-5 w-9 shrink-0">
              <input
                id="isActive"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="peer sr-only"
              />
              <span className="absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-brand-600" />
              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
            </span>
          </label>
        </div>

        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {successMessage}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="ff-btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="ff-btn-primary"
          >
            {isSubmitting ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                  <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Creating…
              </>
            ) : (
              'Create survey'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateSurveyForm;
