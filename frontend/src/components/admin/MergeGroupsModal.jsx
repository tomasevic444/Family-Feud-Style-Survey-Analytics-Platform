// src/components/admin/MergeGroupsModal.jsx
import React, { useState, useEffect } from 'react';

const ModalBackdrop = ({ onClick }) => (
  <div
    className="fixed inset-0 bg-black bg-opacity-50 z-40"
    onClick={onClick}
  ></div>
);

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
    <>
      <ModalBackdrop onClick={isSubmitting ? undefined : onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg shadow-xl z-50 w-full max-w-lg">
        <h3 className="text-lg font-semibold mb-2">Merge Groups</h3>
        <p className="text-sm text-gray-600 mb-4">You are about to merge the following groups:</p>
        <ul className="list-disc pl-5 mb-4 text-sm bg-gray-50 p-3 rounded">
          {groupsToMerge.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>

        <div className="space-y-4">
          <div>
            <label htmlFor="mergedGroupName" className="block text-sm font-medium text-gray-700">
              Merged group name
            </label>
            <p className="text-xs text-gray-500 mt-1 mb-1">
              Must be a new label (not identical to any of the groups listed above).
            </p>
            <input
              type="text"
              id="mergedGroupName"
              value={mergedName}
              onChange={(e) => {
                setMergedName(e.target.value);
                setValidationError('');
              }}
              disabled={isSubmitting}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
              placeholder="e.g. Animals (combined)"
            />
            {displayError && (
              <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">{displayError}</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleMergeClick}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50"
          >
            {isSubmitting ? 'Merging…' : 'Confirm Merge'}
          </button>
        </div>
      </div>
    </>
  );
}

export default MergeGroupsModal;
