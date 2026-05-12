// src/components/admin/MoveAnswerModal.jsx
import React, { useEffect, useState } from 'react';

function MoveAnswerModal({
  show,
  onClose,
  onMove,
  answerToMove,
  currentGroupName,
  existingGroupNames,
}) {
  const [destination, setDestination] = useState('');
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (show) {
      setDestination('');
      setIsCreatingNewGroup(false);
      setNewGroupName('');
      setValidationError('');
    }
  }, [show, answerToMove, currentGroupName]);

  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, onClose]);

  if (!show) {
    return null;
  }

  const handleMoveClick = () => {
    let finalDestination;
    if (isCreatingNewGroup) {
      if (!newGroupName.trim()) {
        setValidationError('New group name cannot be empty.');
        return;
      }
      finalDestination = newGroupName.trim();
    } else {
      if (!destination) {
        setValidationError('Please select a destination group.');
        return;
      }
      finalDestination = destination;
    }
    setValidationError('');
    onMove(finalDestination);
  };

  const handleDestinationChange = (e) => {
    const value = e.target.value;
    setDestination(value);
    setValidationError('');
    setIsCreatingNewGroup(value === '__CREATE_NEW__');
  };

  const destinationOptions = (existingGroupNames || []).filter(
    (name) => name !== currentGroupName
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-modal-title"
    >
      <div className="absolute inset-0 bg-night-900/65 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-card-lift ring-1 ring-slate-200 animate-scale-in">
        <div className="flex items-start gap-3 border-b border-slate-200 bg-gradient-to-r from-white via-brand-50/40 to-white px-5 py-4">
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
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </span>
          <div className="flex-1">
            <h3 id="move-modal-title" className="text-base font-semibold text-slate-900">
              Move answer
            </h3>
            <p className="ff-section-subtitle">
              Move a single answer into a different group, or create a new group.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ff-btn-ghost px-2 py-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Answer</p>
            <p className="mt-0.5 break-words font-medium text-slate-900">{answerToMove}</p>
            <div className="mt-2 flex items-center gap-1 text-xs text-slate-600">
              <span className="text-slate-500">From group:</span>
              <span className="font-medium text-slate-800">{currentGroupName}</span>
            </div>
          </div>

          <div>
            <label htmlFor="destinationGroup" className="ff-label">
              Destination group
            </label>
            <select
              id="destinationGroup"
              value={destination}
              onChange={handleDestinationChange}
              className="ff-input"
            >
              <option value="">— Select a destination —</option>
              {destinationOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value="__CREATE_NEW__">＋ Create new group…</option>
            </select>
          </div>

          {isCreatingNewGroup && (
            <div className="animate-fade-in">
              <label htmlFor="newGroupName" className="ff-label">
                New group name
              </label>
              <input
                type="text"
                id="newGroupName"
                value={newGroupName}
                onChange={(e) => {
                  setNewGroupName(e.target.value);
                  setValidationError('');
                }}
                className="ff-input"
                placeholder="Enter name for the new group"
              />
            </div>
          )}

          {validationError && (
            <p className="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">
              {validationError}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} className="ff-btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={handleMoveClick} className="ff-btn-primary">
            Confirm move
          </button>
        </div>
      </div>
    </div>
  );
}

export default MoveAnswerModal;
