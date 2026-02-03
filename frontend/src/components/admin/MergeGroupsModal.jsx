// src/components/admin/MergeGroupsModal.jsx
import React, { useState } from 'react';

// Re-using the backdrop from MoveAnswerModal or define here
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
}) {
  const [destinationName, setDestinationName] = useState(groupsToMerge[0] || '');
  const [isUsingCustomName, setIsUsingCustomName] = useState(false);
  const [customName, setCustomName] = useState('');

  if (!show || groupsToMerge.length < 2) {
    return null;
  }

  const handleMergeClick = () => {
    let finalName;
    if (isUsingCustomName) {
      if (!customName.trim()) {
        alert("Custom group name cannot be empty.");
        return;
      }
      finalName = customName.trim();
    } else {
      if (!destinationName) {
        alert("Please select a destination name.");
        return;
      }
      finalName = destinationName;
    }
    onMerge(finalName);
  };

  const handleDestinationChange = (e) => {
    const value = e.target.value;
    setDestinationName(value);
    if (value === '__USE_CUSTOM__') {
      setIsUsingCustomName(true);
    } else {
      setIsUsingCustomName(false);
    }
  };

  return (
    <>
      <ModalBackdrop onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg shadow-xl z-50 w-full max-w-lg">
        <h3 className="text-lg font-semibold mb-2">Merge Groups</h3>
        <p className="text-sm text-gray-600 mb-4">You are about to merge the following groups:</p>
        <ul className="list-disc pl-5 mb-4 text-sm bg-gray-50 p-3 rounded">
            {groupsToMerge.map(name => <li key={name}>{name}</li>)}
        </ul>

        <div className="space-y-4">
          <div>
            <label htmlFor="destinationName" className="block text-sm font-medium text-gray-700">
              New Group Name:
            </label>
            <select
              id="destinationName"
              value={destinationName}
              onChange={handleDestinationChange}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              {groupsToMerge.map((name) => (
                <option key={name} value={name}>
                  Keep name: "{name}"
                </option>
              ))}
              <option value="__USE_CUSTOM__">-- Enter a custom name --</option>
            </select>
          </div>

          {isUsingCustomName && (
            <div>
              <label htmlFor="customName" className="block text-sm font-medium text-gray-700">
                Custom Name:
              </label>
              <input
                type="text"
                id="customName"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Enter new name for the merged group"
              />
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleMergeClick}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md"
          >
            Confirm Merge
          </button>
        </div>
      </div>
    </>
  );
}

export default MergeGroupsModal;