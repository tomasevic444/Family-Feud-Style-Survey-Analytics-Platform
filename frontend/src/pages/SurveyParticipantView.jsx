// src/pages/SurveyParticipantView.jsx
import React, { useState, useEffect } from 'react';
import apiClient from '../api';

function SurveyParticipantView({ surveyId }) {
  const [survey, setSurvey] = useState(null);
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [submittedCount, setSubmittedCount] = useState(0);

  useEffect(() => {
    if (!surveyId) {
      setError('No Survey ID provided.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage('');

    apiClient
      .get(`/surveys/${surveyId}`)
      .then((response) => {
        if (!response.data.is_active) {
          setError(`Survey "${response.data.question_text}" is not currently active.`);
          setSurvey(null);
        } else {
          setSurvey(response.data);
        }
      })
      .catch((err) => {
        console.error('Error fetching survey:', err);
        if (err.response && err.response.status === 404) {
          setError(`Survey with ID ${surveyId} not found.`);
        } else {
          setError('Failed to load the survey question. Please try again later.');
        }
        setSurvey(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [surveyId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!answer.trim()) {
      setError('Please enter an answer.');
      return;
    }
    if (!survey) {
      setError('Cannot submit, survey data not loaded correctly.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage('');

    const surveyKey = survey._id || survey.id;

    try {
      const response = await apiClient.post(`/surveys/${surveyKey}/responses/`, {
        answer_text: answer,
      });
      setSuccessMessage(`Thanks! Your answer "${response.data.answer_text}" was recorded.`);
      setAnswer('');
      setSubmittedCount((c) => c + 1);
    } catch (err) {
      console.error('Error submitting answer:', err);
      if (err.response && err.response.data && err.response.data.detail) {
        setError(`Submission failed: ${err.response.data.detail}`);
      } else {
        setError('Failed to submit answer. Please check your connection and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const FrameWrap = ({ children }) => (
    <div className="container max-w-2xl py-10 sm:py-16">{children}</div>
  );

  if (isLoading) {
    return (
      <FrameWrap>
        <div className="ff-card p-8">
          <div className="ff-skeleton mb-4 h-6 w-1/2" />
          <div className="ff-skeleton mb-2 h-10 w-full" />
          <div className="ff-skeleton h-10 w-full" />
        </div>
      </FrameWrap>
    );
  }

  if (error && !survey) {
    return (
      <FrameWrap>
        <div className="ff-card overflow-hidden">
          <div className="border-b border-rose-200 bg-rose-50 px-6 py-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-rose-600 ring-1 ring-rose-200">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4" />
                  <path d="M12 16h.01" />
                </svg>
              </span>
              <div>
                <p className="font-semibold text-rose-900">Survey unavailable</p>
                <p className="mt-0.5 text-sm text-rose-800">{error}</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-4 text-sm text-slate-600">
            Please contact the survey administrator if you believe this is a mistake.
          </div>
        </div>
      </FrameWrap>
    );
  }

  if (!survey) {
    return (
      <FrameWrap>
        <div className="ff-card p-6 text-center text-amber-800">
          Survey could not be loaded or is inactive.
        </div>
      </FrameWrap>
    );
  }

  return (
    <FrameWrap>
      <div className="ff-card overflow-hidden">
        <div className="bg-gradient-to-r from-brand-600 to-indigo-700 px-6 py-5 text-white">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-brand-100/90">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse-dot" />
            Live survey
          </div>
          <h2 className="mt-1 text-xl font-semibold leading-snug sm:text-2xl">
            {survey.question_text}
          </h2>
          <p className="mt-1 text-xs text-brand-100/80">
            Share one short, honest answer. Your response is anonymous.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6">
          <div>
            <label htmlFor="answerInput" className="ff-label">
              Your answer
            </label>
            <input
              id="answerInput"
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer here…"
              disabled={isSubmitting}
              className="ff-input text-base"
              autoFocus
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-slate-500">
              A few words is usually best — e.g. <span className="font-medium text-slate-700">“dog”</span> rather than a full sentence.
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <div className="flex items-start gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-0.5 h-4 w-4 text-emerald-600"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>{successMessage}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-slate-500">
              Limit: {survey.participant_limit} responses
              {submittedCount > 0 ? ` · You sent ${submittedCount}` : ''}
            </p>
            <button
              type="submit"
              disabled={isSubmitting || !survey}
              className="ff-btn-primary"
            >
              {isSubmitting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Submitting…
                </>
              ) : (
                <>
                  Submit answer
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </FrameWrap>
  );
}

export default SurveyParticipantView;
