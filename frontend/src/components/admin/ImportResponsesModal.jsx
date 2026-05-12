import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../../api';

function extractErrorMessage(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  return fallback;
}

function ImportResponsesModal({
  show,
  onClose,
  surveyId,
  surveyQuestion,
  onImported,
}) {
  const [file, setFile] = useState(null);
  const [answerColumn, setAnswerColumn] = useState('answer_text');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!show) return;
    setFile(null);
    setAnswerColumn('answer_text');
    setIsUploading(false);
    setError('');
    setResult(null);
  }, [show]);

  useEffect(() => {
    if (!show) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !isUploading) onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [show, isUploading, onClose]);

  const canSubmit = useMemo(
    () => Boolean(file && surveyId && answerColumn.trim()) && !isUploading,
    [file, surveyId, answerColumn, isUploading]
  );

  if (!show) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError('');
    setResult(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('answer_column', answerColumn.trim());
      const response = await apiClient.post(
        `/surveys/${surveyId}/responses/import-csv`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setResult(response.data);
      onImported?.(response.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to import CSV responses.'));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <button
        type="button"
        className="absolute inset-0 bg-night-900/65 backdrop-blur-md"
        onClick={() => !isUploading && onClose?.()}
        aria-label="Close import responses modal"
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-card-lift ring-1 ring-slate-200 animate-scale-in">
        <div className="border-b border-slate-200 bg-gradient-to-r from-white via-brand-50/35 to-accent-50/30 px-5 py-4">
          <p className="text-base font-semibold text-slate-900">Import responses from CSV</p>
          <p className="mt-1 text-xs text-slate-600">
            Importing into: <span className="font-medium text-slate-800">"{surveyQuestion || 'Selected survey'}"</span>
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <label className="ff-label" htmlFor="csvFileInput">CSV file</label>
            <input
              id="csvFileInput"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setError('');
                setResult(null);
              }}
              className="ff-input"
              disabled={isUploading}
            />
          </div>

          <div>
            <label className="ff-label" htmlFor="answerColumnInput">Answer column</label>
            <input
              id="answerColumnInput"
              type="text"
              value={answerColumn}
              onChange={(event) => setAnswerColumn(event.target.value)}
              placeholder="answer_text"
              className="ff-input"
              disabled={isUploading}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              CSV should contain a header row and one column with answer text, for example:
              {' '}<span className="font-medium text-slate-700">answer_text</span>, dog, cat, rabbit.
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Imported {result.imported_count} responses. Skipped {result.skipped_empty_count} empty rows.
              {result.skipped_limit_count > 0 && ` Skipped ${result.skipped_limit_count} due to participant limit.`}
              <span className="mt-1 block text-emerald-700/90">
                Review responses, then run Process responses.
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="ff-btn-secondary"
              disabled={isUploading}
            >
              Cancel
            </button>
            <button type="submit" className="ff-btn-primary" disabled={!canSubmit}>
              {isUploading ? 'Importing…' : 'Import responses'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ImportResponsesModal;
