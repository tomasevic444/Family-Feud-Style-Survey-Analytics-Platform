// src/components/admin/SurveyDetails.jsx
import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api';
import SurveyResultsChart from './SurveyResultsChart';
import MoveAnswerModal from './MoveAnswerModal';
import MergeGroupsModal from './MergeGroupsModal';
import SemanticSpaceChart from './SemanticSpaceChart';

const POLL_MS = 2500;

function isActiveProcessing(status) {
  return status === 'queued' || status === 'processing';
}

function formatUtcLabel(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function SurveyDetails({ surveyId, onSurveyUpdate }) {
  const [survey, setSurvey] = useState(null);
  const [rawResponses, setRawResponses] = useState([]);
  const [groupedResults, setGroupedResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [error, setError] = useState(null);
  const [processingMessage, setProcessingMessage] = useState('');
  const [statusUpdateMessage, setStatusUpdateMessage] = useState('');

  const [editingGroupName, setEditingGroupName] = useState(null); 
  const [newGroupName, setNewGroupName] = useState('');
  const [isSavingGroupName, setIsSavingGroupName] = useState(false);
  const [groupNameEditError, setGroupNameEditError] = useState('');


  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [answerToMove, setAnswerToMove] = useState({ text: null, sourceGroup: null });
  const [isMovingAnswer, setIsMovingAnswer] = useState(false);

  const [selectedForMerge, setSelectedForMerge] = useState([]);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState(null);
  const [exportError, setExportError] = useState('');


  const fetchSurveyDetails = useCallback(async () => {
    if (!surveyId) {
        setSurvey(null);
        setRawResponses([]);
        setGroupedResults(null);
        setError(null);
        setProcessingMessage('');
        setStatusUpdateMessage('');
        setEditingGroupName(null); 
        setGroupNameEditError(''); 
        setIsMoveModalOpen(false);
        setSelectedForMerge([]);
        setIsMergeModalOpen(false);
        setMergeError(null);
        setExportError('');
        return;
    }
    setIsLoading(true);
    setError(null);
    setProcessingMessage('');
    setStatusUpdateMessage('');
    setEditingGroupName(null); 
    setGroupNameEditError(''); 
    setIsMoveModalOpen(false);
    setGroupedResults(null);
    setSelectedForMerge([]);
    setIsMergeModalOpen(false);
    setMergeError(null);
    setExportError('');


    try {
        const surveyRes = await apiClient.get(`/surveys/${surveyId}`);
        setSurvey(surveyRes.data);

        const rawRes = await apiClient.get(`/surveys/${surveyId}/responses/raw`);
        setRawResponses(rawRes.data);

        try {
            const groupedRes = await apiClient.get(`/surveys/${surveyId}/results`);
            const data = groupedRes.data;
            setGroupedResults(data);
            const st = data.status;
            if (isActiveProcessing(st)) {
                setProcessingMessage('Processing is in progress. Status updates automatically.');
            } else if (st === 'completed_no_data') {
                const msg = data.errors && data.errors.length ? data.errors.join(' ') : 'No answer texts to process.';
                setProcessingMessage(msg);
            } else if (st === 'completed' && (!data.grouped_answers || data.grouped_answers.length === 0)) {
                setProcessingMessage('Survey results processed but no groups found.');
            } else if (st === 'failed') {
                setProcessingMessage('');
            } else {
                setProcessingMessage('');
            }
        } catch (resultsError) {
            if (resultsError.response && resultsError.response.status === 404) {
                setGroupedResults(null);
                setProcessingMessage('No results yet. Run Process Responses to start.');
            } else {
                console.error("Error fetching grouped results:", resultsError);
                setError('Failed to fetch grouped results.');
                setGroupedResults(null);
            }
        }
    } catch (err) {
        console.error("Error fetching survey details:", err);
        setError(`Failed to load details for survey ${surveyId}.`);
        setSurvey(null);
        setRawResponses([]);
        setGroupedResults(null);
    } finally {
        setIsLoading(false);
    }
  }, [surveyId]);

  useEffect(() => {
    setSelectedForMerge([]);
    setIsMergeModalOpen(false);
    setMergeError(null);
  }, [surveyId]);

  useEffect(() => {
    const answers = groupedResults?.grouped_answers;
    if (!answers?.length) return;
    const names = new Set(answers.map((g) => g.canonical_name));
    setSelectedForMerge((prev) => {
      const next = prev.filter((n) => names.has(n));
      return next.length === prev.length ? prev : next;
    });
  }, [groupedResults?.grouped_answers]);

  useEffect(() => {
    fetchSurveyDetails();
  }, [fetchSurveyDetails]);

  useEffect(() => {
    if (!surveyId) return;
    const st = groupedResults?.status;
    if (!isActiveProcessing(st)) return;

    const tick = async () => {
      try {
        const groupedRes = await apiClient.get(`/surveys/${surveyId}/results`);
        const data = groupedRes.data;
        setGroupedResults(data);
        const next = data.status;
        if (!isActiveProcessing(next)) {
          try {
            const rawRes = await apiClient.get(`/surveys/${surveyId}/responses/raw`);
            setRawResponses(rawRes.data);
          } catch (e) {
            console.error('Error refreshing raw responses:', e);
          }
          if (next === 'failed') {
            setProcessingMessage('');
          } else if (next === 'completed_no_data') {
            setProcessingMessage(data.errors?.length ? data.errors.join(' ') : 'No answer texts to process.');
          } else {
            setProcessingMessage('');
          }
        }
      } catch (e) {
        console.error('Error polling results:', e);
      }
    };

    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [surveyId, groupedResults?.status]);

  const handleProcessSurvey = async () => {
    if (!surveyId) return;
    setProcessingMessage('Queuing processing…');
    setStatusUpdateMessage('');
    setError(null);
    setGroupNameEditError('');
    try {
      const response = await apiClient.post(`/surveys/${surveyId}/process`);
      setProcessingMessage(`Processing queued (task ${response.data.task_id}).`);
      const groupedRes = await apiClient.get(`/surveys/${surveyId}/results`);
      setGroupedResults(groupedRes.data);
      setProcessingMessage('Processing is in progress. Status updates automatically.');
    } catch (err) {
      console.error("Error triggering processing:", err);
      const detail = err.response?.data?.detail;
      setError(detail ? String(detail) : 'Failed to trigger processing.');
      setProcessingMessage('');
    }
  };

  const handleToggleActiveStatus = async () => {
    if (!survey) return;
    setIsUpdatingStatus(true);
    setStatusUpdateMessage('');
    setError(null);
    setGroupNameEditError('');

    const newStatus = !survey.is_active;
    try {
      const idToUse = survey._id || survey.id;
      const response = await apiClient.put(`/surveys/${idToUse}/`, {
        is_active: newStatus
      });
      setSurvey(response.data); 
      setStatusUpdateMessage(`Survey status updated to ${newStatus ? 'Active' : 'Inactive'}.`);
      if (onSurveyUpdate) {
        onSurveyUpdate(); 
      }
    } catch (err) {
      console.error("Error updating survey status:", err);
      setError("Failed to update survey status.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleEditGroupName = (currentName) => {
    setEditingGroupName(currentName);
    setNewGroupName(currentName); 
    setGroupNameEditError('');
    setError('');
    setProcessingMessage('');
    setStatusUpdateMessage('');
  };

  const handleCancelEditGroupName = () => {
    setEditingGroupName(null);
    setNewGroupName('');
    setGroupNameEditError('');
  };

  const handleSaveGroupName = async (currentName) => {
    if (!newGroupName.trim()) {
      setGroupNameEditError("New group name cannot be empty.");
      return;
    }
    if (newGroupName.trim() === currentName) {
      setEditingGroupName(null); 
      setNewGroupName('');
      return;
    }

    setIsSavingGroupName(true);
    setGroupNameEditError('');

    try {
      const encodedCurrentName = encodeURIComponent(currentName);
      const response = await apiClient.put(
        `/surveys/${surveyId}/results/groups/${encodedCurrentName}`,
        { new_canonical_name: newGroupName.trim() }
      );
      setGroupedResults(response.data); 
      setEditingGroupName(null); 
      setNewGroupName('');
    } catch (err) {
      console.error("Error updating group name:", err);
      if (err.response && err.response.data && err.response.data.detail) {
        setGroupNameEditError(`Save failed: ${err.response.data.detail}`);
      } else {
        setGroupNameEditError("Failed to save new group name.");
      }
    } finally {
      setIsSavingGroupName(false);
    }
  };

  const handleOpenMoveModal = (rawAnswer, sourceGroup) => {
    setAnswerToMove({ text: rawAnswer, sourceGroup: sourceGroup });
    setIsMoveModalOpen(true);
  };

  const handleCloseMoveModal = () => {
    setIsMoveModalOpen(false);
    setAnswerToMove({ text: null, sourceGroup: null });
  };

  const handleMoveAnswer = async (destinationGroupName) => {
    if (isMovingAnswer) return;
    setIsMovingAnswer(true);
    setError(null);

    const moveRequestData = {
      raw_answer_text: answerToMove.text,
      source_group_canonical_name: answerToMove.sourceGroup,
      destination_group_canonical_name: destinationGroupName,
    };

    try {
      const response = await apiClient.post(`/surveys/${surveyId}/results/move-answer`, moveRequestData);
      setGroupedResults(response.data);
      handleCloseMoveModal();
    } catch (err) {
      console.error("Error moving answer:", err);
      if (err.response && err.response.data && err.response.data.detail) {
        setError(`Move failed: ${err.response.data.detail}`);
      } else {
        setError("Failed to move answer.");
      }
    } finally {
      setIsMovingAnswer(false);
    }
  };

  const toggleMergeSelect = (canonicalName) => {
    setSelectedForMerge((prev) => {
      if (prev.includes(canonicalName)) {
        return prev.filter((n) => n !== canonicalName);
      }
      return [...prev, canonicalName];
    });
    setMergeError(null);
  };

  const handleOpenMergeModal = () => {
    if (selectedForMerge.length < 2) return;
    setMergeError(null);
    setIsMergeModalOpen(true);
  };

  const handleCloseMergeModal = () => {
    if (isMerging) return;
    setIsMergeModalOpen(false);
    setMergeError(null);
  };

  const handleConfirmMerge = async (destinationCanonicalName) => {
    if (!surveyId || selectedForMerge.length < 2) return;
    setIsMerging(true);
    setMergeError(null);
    try {
      const response = await apiClient.post(`/surveys/${surveyId}/results/merge-groups`, {
        source_group_names: [...selectedForMerge],
        destination_canonical_name: destinationCanonicalName,
      });
      setGroupedResults(response.data);
      setSelectedForMerge([]);
      setIsMergeModalOpen(false);
      setMergeError(null);
    } catch (err) {
      console.error('Error merging groups:', err);
      const detail = err.response?.data?.detail;
      setMergeError(detail ? String(detail) : 'Merge failed. Please try again.');
    } finally {
      setIsMerging(false);
    }
  };

  const canEditGroups =
    groupedResults &&
    groupedResults.status === 'completed' &&
    groupedResults.grouped_answers &&
    groupedResults.grouped_answers.length > 0;
  const processingHistory = groupedResults?.processing_history || [];
  const canExportGroupedResults =
    groupedResults &&
    groupedResults.grouped_answers &&
    groupedResults.grouped_answers.length > 0;

  const handleExportGroupedResultsCsv = () => {
    setExportError('');
    if (!canExportGroupedResults) {
      setExportError('No grouped results available to export yet.');
      return;
    }
    try {
      const surveyIdentifier = survey?._id || survey?.id || surveyId || '';
      const surveyQuestion = survey?.question_text || '';
      const processingStatus = groupedResults?.status || '';
      const processingTimestamp = groupedResults?.processing_time_utc || '';
      const rows = groupedResults.grouped_answers.map((group) =>
        [
          surveyIdentifier,
          surveyQuestion,
          processingStatus,
          processingTimestamp,
          group.canonical_name,
          group.count,
          (group.raw_answers || []).join(' | '),
        ]
          .map(csvEscape)
          .join(',')
      );

      const header = [
        'survey_id',
        'survey_question',
        'processing_status',
        'processing_time_utc',
        'group_canonical_name',
        'group_count',
        'raw_answers',
      ]
        .map(csvEscape)
        .join(',');

      const csvContent = [header, ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeSurveyId = String(surveyIdentifier || 'survey').replace(/[^a-zA-Z0-9_-]/g, '_');
      link.href = url;
      link.download = `grouped-results-${safeSurveyId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
      setExportError('Failed to export grouped results.');
    }
  };

  if (!surveyId) {
    return <div className="text-center text-gray-500 p-6 bg-white shadow-md rounded-lg">Select a survey to view its details.</div>;
  }

  if (isLoading) {
    return <div className="text-center p-10 bg-white shadow-md rounded-lg">Loading survey details...</div>;
  }
  
  if (error && !survey) {
      return <div className="text-center p-4 text-red-600 bg-red-100 border border-red-400 rounded-md shadow">{error}</div>;
  }
  
  if (!survey) {
    return <div className="text-center p-4 bg-white shadow-md rounded-lg">Survey data could not be loaded.</div>;
  }

  return (
    <>
      <MoveAnswerModal
        show={isMoveModalOpen}
        onClose={handleCloseMoveModal}
        onMove={handleMoveAnswer}
        answerToMove={answerToMove.text}
        currentGroupName={answerToMove.sourceGroup}
        existingGroupNames={
          groupedResults?.grouped_answers?.map(g => g.canonical_name) || []
        }
      />

      <MergeGroupsModal
        show={isMergeModalOpen}
        onClose={handleCloseMergeModal}
        onMerge={handleConfirmMerge}
        groupsToMerge={[...selectedForMerge].sort()}
        apiError={mergeError}
        isSubmitting={isMerging}
      />

      <div className="bg-white shadow-md rounded-lg p-6 space-y-8">
        <div className="pb-4 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">{survey.question_text}</h2>
            <div className="flex items-center space-x-4 mb-2">
                <p className="text-sm text-gray-600">
                    Status: <span className={`font-semibold ${survey.is_active ? 'text-green-600' : 'text-red-600'}`}>
                        {survey.is_active ? 'Active' : 'Inactive'}
                    </span>
                </p>
                <p className="text-sm text-gray-600">
                    Participant Limit: <span className="font-semibold">{survey.participant_limit}</span>
                </p>
            </div>
            <div className="flex flex-wrap gap-3 mt-4">
                <button
                    onClick={handleToggleActiveStatus}
                    disabled={isUpdatingStatus}
                    className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50
                                ${survey.is_active
                                    ? 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-400'
                                    : 'bg-green-500 hover:bg-green-600 text-white focus:ring-green-400'
                                }`}
                >
                    {isUpdatingStatus ? 'Updating...' : (survey.is_active ? 'Deactivate Survey' : 'Activate Survey')}
                </button>
                <button
                    onClick={handleProcessSurvey}
                    disabled={isActiveProcessing(groupedResults?.status)}
                    className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                    Process Responses
                </button>
            </div>

            {groupedResults && (
              <div className="mt-4 p-4 rounded-md border border-gray-200 bg-gray-50 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-600">Processing status:</span>
                  <span
                    className={`text-sm font-semibold px-2 py-0.5 rounded ${
                      groupedResults.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : groupedResults.status === 'completed_no_data'
                          ? 'bg-amber-100 text-amber-900'
                          : groupedResults.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : groupedResults.status === 'processing'
                              ? 'bg-indigo-100 text-indigo-800'
                              : groupedResults.status === 'queued'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    {groupedResults.status === 'processing' || groupedResults.status === 'queued'
                      ? `${groupedResults.status === 'queued' ? 'Queued' : 'Processing'}…`
                      : groupedResults.status === 'completed_no_data'
                        ? 'Completed (no data)'
                        : groupedResults.status === 'failed'
                          ? 'Failed'
                          : groupedResults.status === 'completed'
                            ? 'Completed'
                            : groupedResults.status}
                  </span>
                  {isActiveProcessing(groupedResults.status) && (
                    <span className="text-xs text-gray-500">Refreshing every few seconds.</span>
                  )}
                </div>
                {groupedResults.status === 'failed' && groupedResults.errors && groupedResults.errors.length > 0 && (
                  <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded p-2">
                    {groupedResults.errors.map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                )}
                {(groupedResults.input_answer_count != null ||
                  groupedResults.output_group_count != null ||
                  groupedResults.model_name ||
                  groupedResults.distance_threshold != null ||
                  groupedResults.preprocessing_descriptor) && (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700">
                    {groupedResults.processing_time_utc && (
                      <>
                        <dt className="text-gray-500">Last run (UTC display)</dt>
                        <dd>{formatUtcLabel(groupedResults.processing_time_utc)}</dd>
                      </>
                    )}
                    {groupedResults.input_answer_count != null && (
                      <>
                        <dt className="text-gray-500">Input answers</dt>
                        <dd>{groupedResults.input_answer_count}</dd>
                      </>
                    )}
                    {groupedResults.output_group_count != null && (
                      <>
                        <dt className="text-gray-500">Output groups</dt>
                        <dd>{groupedResults.output_group_count}</dd>
                      </>
                    )}
                    {groupedResults.model_name && (
                      <>
                        <dt className="text-gray-500">Model</dt>
                        <dd className="break-all">{groupedResults.model_name}</dd>
                      </>
                    )}
                    {groupedResults.distance_threshold != null && (
                      <>
                        <dt className="text-gray-500">Distance threshold</dt>
                        <dd>{groupedResults.distance_threshold}</dd>
                      </>
                    )}
                    {groupedResults.preprocessing_descriptor && (
                      <>
                        <dt className="text-gray-500">Preprocessing</dt>
                        <dd>{groupedResults.preprocessing_descriptor}</dd>
                      </>
                    )}
                  </dl>
                )}
              </div>
            )}

            {statusUpdateMessage && <p className="mt-3 text-sm text-green-700">{statusUpdateMessage}</p>}
            {processingMessage && <p className="mt-3 text-sm text-blue-700">{processingMessage}</p>}
            {error && !groupNameEditError && <p className="mt-3 text-sm text-red-700 bg-red-100 p-2 rounded">{error}</p>}
        </div>

        {groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length > 0 ? (
          <>
    <SurveyResultsChart data={groupedResults.grouped_answers} />
    
    <SemanticSpaceChart data={groupedResults.grouped_answers} /> 
  </>
  
        ) : groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length === 0 ? (
          <div className="chart-container p-4 border border-gray-300 rounded-lg shadow bg-white">
              <h4 className="text-md font-semibold text-gray-700 mb-3 text-center">Survey Response Distribution</h4>
              <p className="text-sm text-gray-500 p-4 text-center">No grouped data to display in chart.</p>
          </div>
        ) : null 
        }


        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-lg font-semibold text-gray-700">Grouped Results (Text)</h3>
            {(canEditGroups || canExportGroupedResults) && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportGroupedResultsCsv}
                  disabled={!canExportGroupedResults}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-slate-600 hover:bg-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-500 disabled:opacity-50"
                >
                  Export CSV
                </button>
                <span className="text-xs text-gray-500">
                  {selectedForMerge.length > 0 ? `${selectedForMerge.length} selected` : 'Select groups to merge'}
                </span>
                <button
                  type="button"
                  onClick={handleOpenMergeModal}
                  disabled={selectedForMerge.length < 2 || isMerging}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-teal-500 disabled:opacity-50"
                >
                  Merge selected
                </button>
              </div>
            )}
          </div>
          {exportError && <p className="mb-2 text-sm text-red-600 bg-red-100 p-2 rounded">{exportError}</p>}
          {groupNameEditError && <p className="mb-2 text-sm text-red-600 bg-red-100 p-2 rounded">{groupNameEditError}</p>}
          {groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto bg-gray-50 p-3 rounded border border-gray-200">
              {groupedResults.grouped_answers.map((group, index) => (
                <div key={group.canonical_name + index} className="bg-white p-3 rounded border border-gray-200 shadow-sm">
                  {editingGroupName === group.canonical_name ? (
                    // --- Editing State ---
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        autoFocus
                      />
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleSaveGroupName(group.canonical_name)}
                          disabled={isSavingGroupName}
                          className="px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50"
                        >
                          {isSavingGroupName ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancelEditGroupName}
                          className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // --- Display State ---
                    <div className="flex justify-between items-center gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {canEditGroups && (
                          <input
                            type="checkbox"
                            checked={selectedForMerge.includes(group.canonical_name)}
                            onChange={() => toggleMergeSelect(group.canonical_name)}
                            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 shrink-0"
                            aria-label={`Select group ${group.canonical_name} for merge`}
                          />
                        )}
                        <p className="font-semibold text-blue-700 truncate">
                          {group.canonical_name}{' '}
                          <span className="text-xs font-normal text-gray-600">({group.count} responses)</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEditGroupName(group.canonical_name)}
                        className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-md shrink-0"
                      >
                        Edit Name
                      </button>
                    </div>
                  )}
                  {group.raw_answers && group.raw_answers.length > 0 && (
                      <ul className="text-xs text-gray-600 pl-4 list-disc mt-1 space-y-1">
                      {group.raw_answers.map((ans, i) => (
                          <li key={i} className="flex justify-between items-center">
                            <span>{ans}</span>
                            <button
                                onClick={() => handleOpenMoveModal(ans, group.canonical_name)}
                                className="px-2 py-0.5 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-100 rounded-md"
                                title="Move this answer to another group"
                            >
                                Move
                            </button>
                          </li>
                      ))}
                      </ul>
                  )}
                </div>
              ))}
            </div>
          ) : groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length === 0 ? (
            <p className="text-gray-500 text-sm">No groups found in the processed results.</p>
          ) : (
            <p className="text-gray-500 text-sm">Results have not been processed or are unavailable.</p>
          )}
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Raw Responses ({rawResponses.length})</h3>
          {rawResponses.length > 0 ? (
            <ul className="max-h-60 overflow-y-auto bg-gray-50 p-3 rounded border border-gray-200 text-sm">
              {rawResponses.map(resp => (
                <li key={resp._id || resp.id} className="py-1 border-b border-gray-100 last:border-b-0">
                  {resp.answer_text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">No raw responses submitted yet.</p>
          )}
        </div>

        {processingHistory.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-3">Processing History</h3>
            <div className="space-y-2 bg-gray-50 border border-gray-200 rounded p-3 max-h-64 overflow-y-auto">
              {processingHistory.map((run) => (
                <div key={run.run_id} className="bg-white border border-gray-200 rounded p-2 text-xs text-gray-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {run.status === 'completed_no_data' ? 'completed (no data)' : run.status}
                    </span>
                    <span className="text-gray-500">{formatUtcLabel(run.run_timestamp_utc)}</span>
                  </div>
                  <div className="mt-1 text-gray-600">
                    in: {run.input_answer_count ?? '-'} | out: {run.output_group_count ?? '-'} | model:{' '}
                    {run.model_name || '-'} | threshold: {run.distance_threshold ?? '-'} | prep:{' '}
                    {run.preprocessing_descriptor || '-'}
                  </div>
                  {run.error_summary && <div className="mt-1 text-red-700">error: {run.error_summary}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default SurveyDetails;