// src/components/admin/MoveAnswerModal.jsx
import React, { useState } from 'react';

const ModalBackdrop = ({ onClick }) => (
  <div
    className="fixed inset-0 bg-black bg-opacity-50 z-40"
    onClick={onClick}
  ></div>
);

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

  if (!show) {
    return null;
  }

  const handleMoveClick = () => {
    let finalDestination;
    if (isCreatingNewGroup) {
      if (!newGroupName.trim()) {
        alert("New group name cannot be empty.");
        return;
      }
      finalDestination = newGroupName.trim();
    } else {
      if (!destination) {
        alert("Please select a destination group.");
        return;
      }
      finalDestination = destination;
    }
    // Call the parent component's move handler
    onMove(finalDestination);
  };

  const handleDestinationChange = (e) => {
    const value = e.target.value;
    setDestination(value);
    if (value === '__CREATE_NEW__') {
      setIsCreatingNewGroup(true);
    } else {
      setIsCreatingNewGroup(false);
    }
  };

  // Filter out the current group from the list of possible destinations
  const destinationOptions = existingGroupNames.filter(
    (name) => name !== currentGroupName
  );

  return (
    <>
      <ModalBackdrop onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg shadow-xl z-50 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Move Answer</h3>
        <p className="mb-2 text-sm">
          Moving answer: <strong className="font-mono bg-gray-100 p-1 rounded">{answerToMove}</strong>
        </p>
        <p className="mb-4 text-sm">
          From group: <strong className="font-mono bg-gray-100 p-1 rounded">{currentGroupName}</strong>
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="destinationGroup" className="block text-sm font-medium text-gray-700">
              To Group:
            </label>
            <select
              id="destinationGroup"
              value={destination}
              onChange={handleDestinationChange}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              <option value="">-- Select a destination --</option>
              {destinationOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value="__CREATE_NEW__">-- Create New Group --</option>
            </select>
          </div>

          {isCreatingNewGroup && (
            <div>
              <label htmlFor="newGroupName" className="block text-sm font-medium text-gray-700">
                New Group Name:
              </label>
              <input
                type="text"
                id="newGroupName"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Enter name for the new group"
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
            onClick={handleMoveClick}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
          >
            Confirm Move
          </button>
        </div>
      </div>
    </>
  );
}

export default MoveAnswerModal;