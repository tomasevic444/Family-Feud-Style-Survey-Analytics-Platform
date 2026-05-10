// src/components/admin/SurveyDetails.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

function statusLabel(status) {
  if (status === 'processing' || status === 'queued') {
    return status === 'queued' ? 'Queued' : 'Processing';
  }
  if (status === 'completed_no_data') return 'Completed (no data)';
  if (status === 'failed') return 'Failed';
  if (status === 'completed') return 'Completed';
  return status || 'Unknown';
}

function StatusBadge({ status, className = '', uppercase = true }) {
  const ring =
    status === 'completed'
      ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
      : status === 'completed_no_data'
        ? 'bg-amber-50 text-amber-900 ring-amber-200'
        : status === 'failed'
          ? 'bg-red-50 text-red-800 ring-red-200'
          : status === 'processing'
            ? 'bg-indigo-50 text-indigo-800 ring-indigo-200'
            : status === 'queued'
              ? 'bg-sky-50 text-sky-800 ring-sky-200'
              : 'bg-gray-100 text-gray-800 ring-gray-200';
  const isLive = status === 'processing' || status === 'queued';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${ring} ${
        uppercase ? 'uppercase tracking-wide' : 'font-medium normal-case tracking-normal'
      } ${className}`}
    >
      {statusLabel(status)}
      {isLive ? '…' : ''}
    </span>
  );
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

const DEFAULT_PROCESSING_CONFIG = {
  run_label: '',
  clustering_method: 'agglomerative_threshold',
  distance_threshold: 1.0,
  min_k: 2,
  max_k: 40,
  fixed_k: 8,
  embedding_model: 'sentence-transformers/all-MiniLM-L6-v2',
  excluded_words: '',
  use_excluded_words: false,
};

function formatPipelineRun(run) {
  const parts = [];
  parts.push(run.clustering_method || 'agglomerative_threshold');
  if (run.distance_threshold != null && run.clustering_method === 'agglomerative_threshold') {
    parts.push(`threshold ${run.distance_threshold}`);
  }
  if (run.selected_k != null) parts.push(`selected K ${run.selected_k}`);
  if (run.fixed_k != null && run.clustering_method === 'kmeans_fixed_k') parts.push(`fixed K ${run.fixed_k}`);
  if (run.min_k != null && run.max_k != null && run.clustering_method === 'kmeans_auto_k') {
    parts.push(`K range ${run.min_k}-${run.max_k}`);
  }
  return parts.join(' · ');
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
  const [participantLinkCopied, setParticipantLinkCopied] = useState(false);
  const [processingConfig, setProcessingConfig] = useState(DEFAULT_PROCESSING_CONFIG);

  const participantSurveyUrl = useMemo(() => {
    if (!surveyId || typeof window === 'undefined') return '';
    try {
      const u = new URL(`${window.location.origin}${window.location.pathname}`);
      u.searchParams.set('mode', 'participant');
      u.searchParams.set('surveyId', surveyId);
      return u.toString();
    } catch {
      return `?mode=participant&surveyId=${encodeURIComponent(surveyId)}`;
    }
  }, [surveyId]);

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
        setProcessingConfig(DEFAULT_PROCESSING_CONFIG);
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
    setProcessingConfig(DEFAULT_PROCESSING_CONFIG);


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
                setProcessingMessage('');
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
      const excludedWords = String(processingConfig.excluded_words || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const requestBody = {
        run_label: processingConfig.run_label || null,
        clustering_method: processingConfig.clustering_method,
        distance_threshold: Number(processingConfig.distance_threshold),
        min_k: Number(processingConfig.min_k),
        max_k: Number(processingConfig.max_k),
        fixed_k:
          processingConfig.clustering_method === 'kmeans_fixed_k'
            ? Number(processingConfig.fixed_k)
            : null,
        embedding_model: processingConfig.embedding_model,
        excluded_words: excludedWords,
        use_excluded_words: Boolean(processingConfig.use_excluded_words),
      };
      const response = await apiClient.post(`/surveys/${surveyId}/process`, requestBody);
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
  const similarGroupPairs = groupedResults?.similar_group_pairs || [];
  const reviewHintPairs = similarGroupPairs.filter(
    (pair) => typeof pair?.similarity === 'number' && pair.similarity >= 0.75
  );
  const nonDefaultModel =
    processingConfig.embedding_model !== 'sentence-transformers/all-MiniLM-L6-v2';

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

  const handleCopyParticipantLink = async () => {
    if (!participantSurveyUrl) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(participantSurveyUrl);
      setParticipantLinkCopied(true);
      window.setTimeout(() => setParticipantLinkCopied(false), 2000);
    } catch {
      setError('Could not copy the participant link. Select the URL and copy manually.');
    }
  };

  if (!surveyId) {
    return <div className="text-center text-gray-500 p-6 bg-white shadow-md rounded-lg">Select a survey to view its details.</div>;
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-100 bg-white p-10 text-center shadow-md">
        <p className="font-medium text-gray-700">Loading survey details…</p>
        <p className="mt-2 text-xs text-gray-400">Fetching question, responses, and grouped results</p>
      </div>
    );
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
            <div className="mt-4 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={handleToggleActiveStatus}
                    disabled={isUpdatingStatus}
                    className={`rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50
                                ${survey.is_active
                                    ? 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-400'
                                    : 'bg-green-500 text-white hover:bg-green-600 focus:ring-green-400'
                                }`}
                >
                    {isUpdatingStatus ? 'Updating...' : (survey.is_active ? 'Deactivate Survey' : 'Activate Survey')}
                </button>
                <button
                    type="button"
                    onClick={handleProcessSurvey}
                    disabled={isActiveProcessing(groupedResults?.status)}
                    title={
                      isActiveProcessing(groupedResults?.status)
                        ? 'Wait until the current run finishes'
                        : 'Queue NLP grouping for current responses'
                    }
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                >
                    {isActiveProcessing(groupedResults?.status) ? 'Processing…' : 'Process responses'}
                </button>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <h3 className="text-sm font-semibold text-slate-900">Processing Settings</h3>
              <p className="mt-1 text-xs text-slate-600">Applies to the next processing run only.</p>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-700">
                  Run label
                  <input
                    type="text"
                    value={processingConfig.run_label}
                    onChange={(e) =>
                      setProcessingConfig((prev) => ({ ...prev, run_label: e.target.value }))
                    }
                    placeholder="MiniLM baseline, KMeans experiment, ..."
                    className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs text-slate-700">
                  Clustering method
                  <select
                    value={processingConfig.clustering_method}
                    onChange={(e) =>
                      setProcessingConfig((prev) => ({ ...prev, clustering_method: e.target.value }))
                    }
                    className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="agglomerative_threshold">Agglomerative threshold</option>
                    <option value="kmeans_auto_k">KMeans auto-K</option>
                    <option value="kmeans_fixed_k">KMeans fixed-K</option>
                  </select>
                </label>
                {processingConfig.clustering_method === 'agglomerative_threshold' && (
                  <label className="text-xs text-slate-700">
                    Distance threshold
                    <input
                      type="number"
                      step="0.05"
                      value={processingConfig.distance_threshold}
                      onChange={(e) =>
                        setProcessingConfig((prev) => ({ ...prev, distance_threshold: e.target.value }))
                      }
                      className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <span className="mt-1 block text-[11px] text-slate-500">
                      Lower values create more specific groups. Higher values merge more aggressively.
                    </span>
                  </label>
                )}
                {processingConfig.clustering_method === 'kmeans_auto_k' && (
                  <>
                    <label className="text-xs text-slate-700">
                      Minimum clusters
                      <input
                        type="number"
                        min="2"
                        value={processingConfig.min_k}
                        onChange={(e) => setProcessingConfig((prev) => ({ ...prev, min_k: e.target.value }))}
                        className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="text-xs text-slate-700">
                      Maximum clusters
                      <input
                        type="number"
                        min="2"
                        value={processingConfig.max_k}
                        onChange={(e) => setProcessingConfig((prev) => ({ ...prev, max_k: e.target.value }))}
                        className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <span className="mt-1 block text-[11px] text-slate-500">
                        Tests multiple K values and chooses one using clustering quality metrics.
                      </span>
                    </label>
                  </>
                )}
                {processingConfig.clustering_method === 'kmeans_fixed_k' && (
                  <label className="text-xs text-slate-700">
                    Specific cluster count
                    <input
                      type="number"
                      min="2"
                      value={processingConfig.fixed_k}
                      onChange={(e) => setProcessingConfig((prev) => ({ ...prev, fixed_k: e.target.value }))}
                      className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <span className="mt-1 block text-[11px] text-slate-500">
                      Use when you already know approximately how many answer categories should exist.
                    </span>
                  </label>
                )}
                <label className="text-xs text-slate-700">
                  Embedding model
                  <select
                    value={processingConfig.embedding_model}
                    onChange={(e) =>
                      setProcessingConfig((prev) => ({ ...prev, embedding_model: e.target.value }))
                    }
                    className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="sentence-transformers/all-MiniLM-L6-v2">all-MiniLM-L6-v2 — recommended / fast</option>
                    <option value="BAAI/bge-m3">BAAI/bge-m3 — experimental / slower</option>
                    <option value="intfloat/multilingual-e5-large-instruct">multilingual-e5-large-instruct — heavy experimental</option>
                  </select>
                </label>
                <label className="text-xs text-slate-700 md:col-span-2">
                  Excluded words
                  <textarea
                    value={processingConfig.excluded_words}
                    onChange={(e) =>
                      setProcessingConfig((prev) => ({ ...prev, excluded_words: e.target.value }))
                    }
                    placeholder="idk, no answer, nothing, n/a"
                    rows={2}
                    className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={processingConfig.use_excluded_words}
                      onChange={(e) =>
                        setProcessingConfig((prev) => ({ ...prev, use_excluded_words: e.target.checked }))
                      }
                    />
                    Use excluded words for this run
                  </label>
                </label>
              </div>
              {nonDefaultModel && (
                <p className="mt-2 text-xs text-amber-700">
                  Large models may be slower and may download on first use.
                </p>
              )}
            </div>

            {participantSurveyUrl && (
              <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-900/90">Participant link</p>
                <p className="mt-0.5 text-xs text-indigo-900/70">
                  Opens answer submission in participant mode (<code className="rounded bg-white/80 px-1 text-[11px]">?mode=participant</code>).
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 max-w-full flex-1 truncate rounded-md bg-white px-2 py-1.5 text-left text-[11px] text-gray-800 ring-1 ring-indigo-100">
                    {participantSurveyUrl}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyParticipantLink}
                    className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                  >
                    {participantLinkCopied ? 'Copied!' : 'Copy link'}
                  </button>
                  <a
                    href={participantSurveyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs font-medium text-indigo-800 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-950"
                  >
                    Open
                  </a>
                </div>
              </div>
            )}

            {groupedResults ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-gray-200 bg-gradient-to-br from-slate-50/90 to-white p-4 shadow-sm">
                  <div className="border-b border-gray-100 pb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Latest processing run</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={groupedResults.status} />
                      {isActiveProcessing(groupedResults.status) && (
                        <span className="text-xs text-gray-500">Auto-refresh on</span>
                      )}
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <dt className="text-xs font-medium text-gray-500">Input answers</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
                        {groupedResults.input_answer_count != null ? groupedResults.input_answer_count : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500">Output groups</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
                        {groupedResults.output_group_count != null ? groupedResults.output_group_count : '—'}
                      </dd>
                    </div>
                    <div className="col-span-2 sm:col-span-2">
                      <dt className="text-xs font-medium text-gray-500">Last processing time</dt>
                      <dd className="mt-0.5 text-sm font-medium text-gray-900">
                        {groupedResults.processing_time_utc ? formatUtcLabel(groupedResults.processing_time_utc) : '—'}
                      </dd>
                    </div>
                  </dl>
                  {(groupedResults.model_name ||
                    groupedResults.distance_threshold != null ||
                    groupedResults.preprocessing_descriptor) && (
                    <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
                      <span className="font-medium text-gray-700">Pipeline</span> · {groupedResults.embedding_model || groupedResults.model_name || '—'} ·
                      {formatPipelineRun(groupedResults)} · {groupedResults.preprocessing_descriptor || '—'} · {groupedResults.embedding_descriptor || '—'}
                    </p>
                  )}
                  {groupedResults.excluded_answer_count != null && (
                    <p className="mt-2 text-xs text-gray-600">
                      Excluded answers: {groupedResults.excluded_answer_count} · Processed: {groupedResults.processed_answer_count ?? '—'}
                    </p>
                  )}
                  {groupedResults.silhouette != null && (
                    <p className="mt-1 text-xs text-gray-600">
                      KMeans metrics · silhouette {groupedResults.silhouette} · CH {groupedResults.calinski_harabasz ?? '—'} · DB {groupedResults.davies_bouldin ?? '—'}
                    </p>
                  )}
                </div>
                {groupedResults.status === 'failed' && groupedResults.errors && groupedResults.errors.length > 0 && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    <p className="font-semibold">Processing failed</p>
                    {groupedResults.errors.map((line, i) => (
                      <p key={i} className="mt-1">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm">
                <p className="font-medium text-gray-800">No grouped results yet</p>
                <p className="mt-1 text-xs text-gray-600">
                  After responses come in, use <span className="font-semibold text-gray-800">Process responses</span> to
                  run grouping. Status and counts will appear in the summary above.
                </p>
              </div>
            )}

            {statusUpdateMessage && <p className="mt-3 text-sm text-green-700">{statusUpdateMessage}</p>}
            {processingMessage && <p className="mt-3 text-sm text-blue-800">{processingMessage}</p>}
            {error && !groupNameEditError && <p className="mt-3 text-sm text-red-800 bg-red-50 border border-red-100 rounded-md p-2">{error}</p>}
        </div>

        {groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length > 0 ? (
          <>
    <SurveyResultsChart data={groupedResults.grouped_answers} />
    
    <SemanticSpaceChart data={groupedResults.grouped_answers} /> 
  </>
  
        ) : groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length === 0 ? (
          <div className="chart-container rounded-lg border border-gray-200 bg-white p-4 shadow">
              <h4 className="text-md mb-2 text-center font-semibold text-gray-700">Survey response distribution</h4>
              <p className="text-center text-sm text-gray-500">
                Nothing to plot yet — the last run produced no clusters. Check the summary above or try again with more
                answers.
              </p>
          </div>
        ) : null 
        }


        <div>
          <div className="mb-3 flex flex-col gap-3 border-b border-gray-100 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Grouped results</h3>
              <p className="text-xs text-gray-500">Text view · export · merge</p>
            </div>
            {(canEditGroups || canExportGroupedResults || groupedResults) && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportGroupedResultsCsv}
                  disabled={!canExportGroupedResults}
                  title={
                    canExportGroupedResults
                      ? 'Download grouped answers as CSV'
                      : 'Run processing and wait for at least one group before exporting'
                  }
                  className="rounded-md bg-slate-700 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Export CSV
                </button>
                {canEditGroups && (
                  <>
                    <span className="hidden text-gray-300 sm:inline">|</span>
                    <span className="text-xs text-gray-500">
                      {selectedForMerge.length > 0 ? `${selectedForMerge.length} selected` : 'Select 2+ groups'}
                    </span>
                    <button
                      type="button"
                      onClick={handleOpenMergeModal}
                      disabled={selectedForMerge.length < 2 || isMerging}
                      title={selectedForMerge.length < 2 ? 'Select at least two groups with the checkboxes' : 'Merge into one group'}
                      className="rounded-md bg-teal-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Merge selected
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length > 0 && (
            <div className="mb-3 rounded-md border border-indigo-100 bg-indigo-50/50 p-3">
              <h4 className="text-sm font-semibold text-indigo-900">Potentially similar groups</h4>
              <p className="mt-1 text-[11px] text-indigo-900/70">
                Review-only hints based on embedding similarity.
              </p>
              {reviewHintPairs.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-indigo-900/90">
                  {reviewHintPairs.map((pair, idx) => (
                    <li key={`${pair.source_group}-${pair.target_group}-${idx}`}>
                      <span className="font-medium">{pair.source_group}</span> ↔{' '}
                      <span className="font-medium">{pair.target_group}</span>{' '}
                      <span className="text-indigo-800/80">({Math.round((pair.similarity || 0) * 100)}%)</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-indigo-900/75">
                  No strong cross-group similarity hints (75%+ similarity) in this run.
                </p>
              )}
              <p className="mt-2 text-[11px] text-indigo-900/70">
                These are not automatic merge recommendations. Review before merging.
              </p>
            </div>
          )}
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
                            <span>
                              {ans}
                              {(() => {
                                const simEntry = group.response_similarities?.find((item) => item.answer === ans);
                                if (!simEntry || typeof simEntry.similarity !== 'number') return null;
                                return (
                                  <span className="ml-2 text-[11px] text-gray-500">
                                    ({Math.round(simEntry.similarity * 100)}% match)
                                  </span>
                                );
                              })()}
                            </span>
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
            <div className="rounded-md border border-amber-100 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
              <span className="font-medium">No groups in this run.</span>{' '}
              <span className="text-amber-900/90">
                See the latest processing status above — you may need more or more varied answers.
              </span>
            </div>
          ) : !groupedResults ? (
            <p className="text-sm italic text-gray-500">
              Grouped answers will list here after the first successful processing run.
            </p>
          ) : (
            <p className="text-sm text-gray-500">Unable to load grouped results.</p>
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
                    <StatusBadge status={run.status} uppercase={false} />
                    <span className="text-gray-500">{formatUtcLabel(run.run_timestamp_utc)}</span>
                  </div>
                  <div className="mt-1 text-gray-600">
                    in: {run.input_answer_count ?? '-'} | processed: {run.processed_answer_count ?? '-'} | excluded: {run.excluded_answer_count ?? '-'} | out: {run.output_group_count ?? '-'}
                  </div>
                  <div className="mt-1 text-gray-600">
                    label: {run.run_label || '-'} | model: {run.embedding_model || run.model_name || '-'} | {formatPipelineRun(run)} | prep: {run.preprocessing_descriptor || '-'} | emb: {run.embedding_descriptor || '-'}
                  </div>
                  {(run.silhouette != null || run.calinski_harabasz != null || run.davies_bouldin != null) && (
                    <div className="mt-1 text-gray-600">
                      metrics: silhouette {run.silhouette ?? '-'} | CH {run.calinski_harabasz ?? '-'} | DB {run.davies_bouldin ?? '-'}
                    </div>
                  )}
                  {run.excluded_words_used && run.excluded_words_used.length > 0 && (
                    <div className="mt-1 text-gray-600">
                      excluded words: {run.excluded_words_used.join(', ')}
                    </div>
                  )}
                  {run.fixed_k != null && (
                    <div className="mt-1 text-gray-600">
                      fixed_k: {run.fixed_k}
                    </div>
                  )}
                  {run.min_k != null && run.max_k != null && (
                    <div className="mt-1 text-gray-600">
                      k range: {run.min_k} - {run.max_k}
                    </div>
                  )}
                  {run.selected_k != null && (
                    <div className="mt-1 text-gray-600">
                      selected_k: {run.selected_k}
                    </div>
                  )}
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