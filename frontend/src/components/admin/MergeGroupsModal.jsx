// src/components/admin/MergeGroupsModal.jsx
import React, { useState, useEffect } from 'react';

function MergeGroupsModal({
  show,
  onClose,
  onMerge,
  groupsToMerge,
  apiError = null,
  isSubmitting = false,
}) {
  const [mergedName, setMergedName] = useState('');
  const [validationError, setValidationError] = useState('');

  const mergeKey = groupsToMerge.join('\0');

  useEffect(() => {
    if (show && groupsToMerge.length >= 2) {
      setMergedName('');
      setValidationError('');
    }
  }, [show, mergeKey, groupsToMerge.length]);

  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, isSubmitting, onClose]);

  if (!show || groupsToMerge.length < 2) {
    return null;
  }

  const handleMergeClick = () => {
    const trimmed = mergedName.trim();
    if (!trimmed) {
      setValidationError('Enter a name for the merged group.');
      return;
    }
    if (groupsToMerge.includes(trimmed)) {
      setValidationError(
        'This name matches one of the groups you are merging. Choose a different name for the merged group.'
      );
      return;
    }
    setValidationError('');
    onMerge(trimmed);
  };

  const displayError = validationError || apiError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-modal-title"
    >
      <div
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
        onClick={isSubmitting ? undefined : onClose}
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-card-lift ring-1 ring-slate-200 animate-scale-in">
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              <path d="M9 12h6" />
            </svg>
          </span>
          <div className="flex-1">
            <h3 id="merge-modal-title" className="text-base font-semibold text-slate-900">
              Merge groups
            </h3>
            <p className="ff-section-subtitle">
              Combine multiple groups into a single label. This affects the active result only.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="ff-btn-ghost px-2 py-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="ff-label">Groups being merged</p>
            <ul className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              {groupsToMerge.map((name) => (
                <li key={name} className="flex items-center gap-2 text-sm text-slate-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  <span className="truncate">{name}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <label htmlFor="mergedGroupName" className="ff-label">
              Merged group name
            </label>
            <input
              type="text"
              id="mergedGroupName"
              value={mergedName}
              onChange={(e) => {
                setMergedName(e.target.value);
                setValidationError('');
              }}
              disabled={isSubmitting}
              className="ff-input"
              placeholder="e.g. Animals (combined)"
              autoFocus
            />
            <p className="mt-1 text-xs text-slate-500">
              Must be a new label, not identical to any of the groups above.
            </p>
            {displayError && (
              <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">
                {displayError}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="ff-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleMergeClick}
            disabled={isSubmitting}
            className="ff-btn-success"
          >
            {isSubmitting ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                  <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Merging…
              </>
            ) : (
              'Confirm merge'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MergeGroupsModal;
