// src/components/admin/SurveyDetails.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import apiClient from '../../api';
import SurveyResultsChart from './SurveyResultsChart';
import MoveAnswerModal from './MoveAnswerModal';
import MergeGroupsModal from './MergeGroupsModal';
import SemanticSpaceChart from './SemanticSpaceChart';
import RunPreviewModal from './RunPreviewModal';
import KMeansDiagnosticsPanel from './KMeansDiagnosticsPanel';
import ImportResponsesModal from './ImportResponsesModal';

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

function formatPercent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function shortRunId(runId) {
  if (!runId) return '';
  const s = String(runId);
  return s.length <= 8 ? s : s.slice(0, 8);
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

  const [processingRuns, setProcessingRuns] = useState([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [runsError, setRunsError] = useState('');
  const [previewRun, setPreviewRun] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activatingRunId, setActivatingRunId] = useState(null);
  const [runsActionMessage, setRunsActionMessage] = useState('');
  const [useSettingsRunId, setUseSettingsRunId] = useState(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importMessage, setImportMessage] = useState('');

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

  const fetchProcessingRuns = useCallback(async () => {
    if (!surveyId) return;
    setIsLoadingRuns(true);
    setRunsError('');
    try {
      const res = await apiClient.get(`/surveys/${surveyId}/processing-runs`);
      setProcessingRuns(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error loading processing runs:', err);
      setRunsError('Failed to load processing runs.');
      setProcessingRuns([]);
    } finally {
      setIsLoadingRuns(false);
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
        setProcessingRuns([]);
        setRunsError('');
        setIsPreviewOpen(false);
        setPreviewRun(null);
        setPreviewError('');
        setRunsActionMessage('');
        setUseSettingsRunId(null);
        setIsImportModalOpen(false);
        setImportMessage('');
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
    setProcessingRuns([]);
    setRunsError('');
    setIsPreviewOpen(false);
    setPreviewRun(null);
    setPreviewError('');
    setRunsActionMessage('');
    setUseSettingsRunId(null);
    setIsImportModalOpen(false);
    setImportMessage('');


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
    void fetchProcessingRuns();
  }, [surveyId, fetchProcessingRuns]);

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
          void fetchProcessingRuns();
        }
      } catch (e) {
        console.error('Error polling results:', e);
      }
    };

    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [surveyId, groupedResults?.status, fetchProcessingRuns]);

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
  const similarGroupPairs = useMemo(
    () => groupedResults?.similar_group_pairs || [],
    [groupedResults?.similar_group_pairs],
  );
  const reviewHintPairs = useMemo(
    () => similarGroupPairs.filter(
      (pair) => typeof pair?.similarity === 'number' && pair.similarity >= 0.75
    ),
    [similarGroupPairs],
  );
  const activeRunContext = useMemo(() => {
    const activeRun =
      processingRuns.find((run) => run.is_active) ||
      processingRuns.find((run) => run.run_id && run.run_id === groupedResults?.active_run_id) ||
      null;
    return {
      label: activeRun?.run_label || groupedResults?.run_label || '',
      runId: groupedResults?.active_run_id || activeRun?.run_id || '',
      clusteringMethod: groupedResults?.clustering_method || activeRun?.clustering_method || '',
      embeddingModel: groupedResults?.embedding_model || groupedResults?.model_name || activeRun?.embedding_model || activeRun?.model_name || '',
    };
  }, [processingRuns, groupedResults]);
  const activeKDiagnostics = groupedResults?.k_selection_diagnostics || [];
  const qualityInsights = useMemo(() => {
    const groups = groupedResults?.grouped_answers || [];
    const totalGroups = groups.length;
    const totalGroupedAnswers = groups.reduce((sum, group) => {
      if (typeof group.count === 'number') return sum + group.count;
      return sum + (Array.isArray(group.raw_answers) ? group.raw_answers.length : 0);
    }, 0);
    const largestGroup = groups.reduce((best, group) => {
      const count = typeof group.count === 'number' ? group.count : (group.raw_answers || []).length;
      if (!best || count > best.count) return { canonical_name: group.canonical_name, count };
      return best;
    }, null);
    const smallestGroup = groups.reduce((best, group) => {
      const count = typeof group.count === 'number' ? group.count : (group.raw_answers || []).length;
      if (!best || count < best.count) return { canonical_name: group.canonical_name, count };
      return best;
    }, null);
    const averageGroupSize = totalGroups > 0 ? totalGroupedAnswers / totalGroups : null;

    const weakClusters = [];
    const lowConfidenceAnswers = [];
    let hasSimilarityData = false;

    groups.forEach((group) => {
      const sims = (group.response_similarities || []).filter(
        (item) => typeof item?.similarity === 'number',
      );
      if (sims.length === 0) return;
      hasSimilarityData = true;
      const averageSimilarity =
        sims.reduce((sum, item) => sum + item.similarity, 0) / sims.length;
      if (averageSimilarity < 0.7) {
        weakClusters.push({
          canonical_name: group.canonical_name,
          count: typeof group.count === 'number' ? group.count : (group.raw_answers || []).length,
          averageSimilarity,
          reason: 'Low average response-to-cluster similarity',
        });
      }
      sims.forEach((item) => {
        if (item.similarity < 0.65) {
          lowConfidenceAnswers.push({
            answer: item.answer,
            canonical_name: group.canonical_name,
            similarity: item.similarity,
          });
        }
      });
    });

    lowConfidenceAnswers.sort((a, b) => a.similarity - b.similarity);
    weakClusters.sort((a, b) => a.averageSimilarity - b.averageSimilarity);

    return {
      totalGroups,
      totalGroupedAnswers,
      largestGroup,
      smallestGroup,
      averageGroupSize,
      hasSimilarityData,
      weakClusters,
      lowConfidenceAnswers: lowConfidenceAnswers.slice(0, 5),
      potentialReviewItemsCount:
        weakClusters.length + Math.min(lowConfidenceAnswers.length, 5) + reviewHintPairs.length,
    };
  }, [groupedResults?.grouped_answers, reviewHintPairs]);
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

  const handlePreviewRun = useCallback(
    async (run) => {
      if (!surveyId || !run?.run_id) return;
      setRunsActionMessage('');
      setPreviewError('');
      setIsPreviewOpen(true);
      setPreviewRun(null);
      setIsLoadingPreview(true);
      try {
        const res = await apiClient.get(
          `/surveys/${surveyId}/processing-runs/${run.run_id}`,
        );
        setPreviewRun(res.data);
      } catch (err) {
        console.error('Error loading run snapshot:', err);
        const detail = err.response?.data?.detail;
        setPreviewError(detail ? String(detail) : 'Failed to load run snapshot.');
      } finally {
        setIsLoadingPreview(false);
      }
    },
    [surveyId],
  );

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewRun(null);
    setPreviewError('');
  };

  const handleUseSettingsFromRun = useCallback((run) => {
    if (!run) return;
    const cfg = run.processing_config || {};
    const clusteringMethod =
      cfg.clustering_method || run.clustering_method || 'agglomerative_threshold';
    const excludedWordsList = Array.isArray(cfg.excluded_words)
      ? cfg.excluded_words
      : Array.isArray(run.excluded_words_used)
        ? run.excluded_words_used
        : [];
    const useExcluded =
      typeof cfg.use_excluded_words === 'boolean'
        ? cfg.use_excluded_words
        : typeof run.use_excluded_words === 'boolean'
          ? run.use_excluded_words
          : excludedWordsList.length > 0;
    setProcessingConfig({
      run_label: cfg.run_label ?? run.run_label ?? '',
      clustering_method: clusteringMethod,
      distance_threshold:
        cfg.distance_threshold ?? run.distance_threshold ?? DEFAULT_PROCESSING_CONFIG.distance_threshold,
      min_k: cfg.min_k ?? run.min_k ?? DEFAULT_PROCESSING_CONFIG.min_k,
      max_k: cfg.max_k ?? run.max_k ?? DEFAULT_PROCESSING_CONFIG.max_k,
      fixed_k:
        cfg.fixed_k ?? run.fixed_k ?? DEFAULT_PROCESSING_CONFIG.fixed_k,
      embedding_model:
        cfg.embedding_model ?? run.embedding_model ?? DEFAULT_PROCESSING_CONFIG.embedding_model,
      excluded_words: excludedWordsList.join(', '),
      use_excluded_words: Boolean(useExcluded),
    });
    setRunsActionMessage(
      'Settings loaded. Review them and click Process responses to run again.',
    );
    setUseSettingsRunId(run.run_id || null);
    setIsPreviewOpen(false);
  }, []);

  const handleActivateRun = useCallback(
    async (run) => {
      if (!surveyId || !run?.run_id) return;
      const groupCount =
        run.output_group_count ??
        (Array.isArray(run.group_summary) ? run.group_summary.length : 0);
      const confirmed = window.confirm(
        `This will replace the currently displayed grouped result with the selected run output (${groupCount} group${groupCount === 1 ? '' : 's'}). It will not delete other runs.\n\nContinue?`,
      );
      if (!confirmed) return;
      setActivatingRunId(run.run_id);
      setRunsActionMessage('');
      setError(null);
      try {
        await apiClient.post(
          `/surveys/${surveyId}/processing-runs/${run.run_id}/activate`,
        );
        const refreshed = await apiClient.get(`/surveys/${surveyId}/results`);
        setGroupedResults(refreshed.data);
        await fetchProcessingRuns();
        setRunsActionMessage(
          `Activated run "${run.run_label || run.run_id}" as the current grouped result.`,
        );
        setIsPreviewOpen(false);
      } catch (err) {
        console.error('Error activating run:', err);
        const detail = err.response?.data?.detail;
        setError(detail ? String(detail) : 'Failed to activate this run.');
      } finally {
        setActivatingRunId(null);
      }
    },
    [surveyId, fetchProcessingRuns],
  );

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

  const handleImportedResponses = async (summary) => {
    const message = `Imported ${summary?.imported_count ?? 0} responses. Skipped ${summary?.skipped_empty_count ?? 0} empty rows.`;
    setImportMessage(message);
    setError(null);
    setIsImportModalOpen(false);
    try {
      const rawRes = await apiClient.get(`/surveys/${surveyId}/responses/raw`);
      setRawResponses(rawRes.data);
    } catch (e) {
      console.error('Error refreshing raw responses after import:', e);
    }
  };

  if (!surveyId) {
    return (
      <div className="ff-card flex min-h-[40vh] flex-col items-center justify-center p-10 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path d="M3 3v18h18" />
            <path d="M7 14l3-3 3 3 5-6" />
          </svg>
        </div>
        <p className="text-base font-semibold text-slate-900">Select a survey</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          Choose a survey from the list on the left to see its responses, grouped results, and processing runs.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="ff-card p-6 space-y-4">
        <div className="ff-skeleton h-6 w-2/3" />
        <div className="ff-skeleton h-4 w-1/3" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="ff-skeleton h-16" />
          <div className="ff-skeleton h-16" />
          <div className="ff-skeleton h-16" />
          <div className="ff-skeleton h-16" />
        </div>
        <div className="ff-skeleton h-40 w-full" />
      </div>
    );
  }

  if (error && !survey) {
    return (
      <div className="ff-card overflow-hidden">
        <div className="border-b border-rose-200 bg-rose-50 px-6 py-4 text-rose-900">
          <p className="font-semibold">Survey unavailable</p>
        </div>
        <div className="px-6 py-4 text-sm text-slate-700">{error}</div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="ff-card p-6 text-center text-slate-600">Survey data could not be loaded.</div>
    );
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

      <RunPreviewModal
        show={isPreviewOpen}
        onClose={handleClosePreview}
        snapshot={previewRun}
        active={groupedResults}
        isLoading={isLoadingPreview}
        error={previewError}
        onUseSettings={handleUseSettingsFromRun}
        onActivate={handleActivateRun}
        canActivate={Boolean(
          previewRun &&
            previewRun.status === 'completed' &&
            Array.isArray(previewRun.grouped_answers) &&
            previewRun.grouped_answers.length > 0 &&
            !previewRun.is_active,
        )}
        isActivating={activatingRunId === previewRun?.run_id}
      />
      <ImportResponsesModal
        show={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        surveyId={surveyId}
        surveyQuestion={survey?.question_text}
        onImported={handleImportedResponses}
      />

      <div className="space-y-6">
        <div className="ff-card ff-card-topline overflow-hidden">
          <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-brand-50/70 via-white to-accent-50/50 px-6 py-5">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full bg-brand-400/15 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-16 left-32 h-40 w-40 rounded-full bg-accent-400/10 blur-3xl"
            />
            <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700/90">
                  <span className="h-1 w-1 rounded-full bg-brand-500" />
                  Survey question
                </p>
                <h2 className="mt-1 text-xl font-semibold leading-snug text-slate-900 sm:text-2xl">
                  {survey.question_text}
                </h2>
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={
                      'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide ring-1 ring-inset ' +
                      (survey.is_active
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : 'bg-slate-100 text-slate-600 ring-slate-200')
                    }
                  >
                    {survey.is_active ? <span className="ff-live-dot" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />}
                    {survey.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="ff-chip">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                    </svg>
                    Limit {survey.participant_limit}
                  </span>
                  {Array.isArray(survey.tags) && survey.tags.slice(0, 3).map((t) => (
                    <span key={t} className="ff-chip-brand">#{t}</span>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleActiveStatus}
                  disabled={isUpdatingStatus}
                  className={survey.is_active ? 'ff-btn-secondary' : 'ff-btn-success'}
                >
                  {isUpdatingStatus ? 'Updating…' : (survey.is_active ? 'Deactivate' : 'Activate')}
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
                  className="ff-btn-primary"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  {isActiveProcessing(groupedResults?.status) ? 'Processing…' : 'Process responses'}
                </button>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50/70 shadow-card">
              <div className="flex items-start gap-3 border-b border-slate-200 px-4 py-3">
                <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.34.65.7 1.34 1 2v.09A2 2 0 0 1 21 13h-.09c-.66 0-1.33.07-2 .4z" />
                  </svg>
                </span>
                <div>
                  <h3 className="ff-section-title">Processing settings</h3>
                  <p className="ff-section-subtitle">Applies to the next processing run only.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-2">
                <label className="block">
                  <span className="ff-label">Run label</span>
                  <input
                    type="text"
                    value={processingConfig.run_label}
                    onChange={(e) =>
                      setProcessingConfig((prev) => ({ ...prev, run_label: e.target.value }))
                    }
                    placeholder="MiniLM baseline, KMeans experiment, …"
                    className="ff-input"
                  />
                </label>
                <label className="block">
                  <span className="ff-label">Clustering method</span>
                  <select
                    value={processingConfig.clustering_method}
                    onChange={(e) =>
                      setProcessingConfig((prev) => ({ ...prev, clustering_method: e.target.value }))
                    }
                    className="ff-input"
                  >
                    <option value="agglomerative_threshold">Agglomerative threshold</option>
                    <option value="kmeans_auto_k">KMeans auto-K</option>
                    <option value="kmeans_fixed_k">KMeans fixed-K</option>
                  </select>
                </label>
                {processingConfig.clustering_method === 'agglomerative_threshold' && (
                  <label className="block md:col-span-2">
                    <span className="ff-label">Distance threshold</span>
                    <input
                      type="number"
                      step="0.05"
                      value={processingConfig.distance_threshold}
                      onChange={(e) =>
                        setProcessingConfig((prev) => ({ ...prev, distance_threshold: e.target.value }))
                      }
                      className="ff-input"
                    />
                    <span className="mt-1 block text-[11px] text-slate-500">
                      Lower values create more specific groups. Higher values merge more aggressively.
                    </span>
                  </label>
                )}
                {processingConfig.clustering_method === 'kmeans_auto_k' && (
                  <>
                    <label className="block">
                      <span className="ff-label">Minimum clusters</span>
                      <input
                        type="number"
                        min="2"
                        value={processingConfig.min_k}
                        onChange={(e) => setProcessingConfig((prev) => ({ ...prev, min_k: e.target.value }))}
                        className="ff-input"
                      />
                    </label>
                    <label className="block">
                      <span className="ff-label">Maximum clusters</span>
                      <input
                        type="number"
                        min="2"
                        value={processingConfig.max_k}
                        onChange={(e) => setProcessingConfig((prev) => ({ ...prev, max_k: e.target.value }))}
                        className="ff-input"
                      />
                      <span className="mt-1 block text-[11px] text-slate-500">
                        Tests multiple K values and chooses one using clustering quality metrics.
                      </span>
                    </label>
                  </>
                )}
                {processingConfig.clustering_method === 'kmeans_fixed_k' && (
                  <label className="block md:col-span-2">
                    <span className="ff-label">Specific cluster count</span>
                    <input
                      type="number"
                      min="2"
                      value={processingConfig.fixed_k}
                      onChange={(e) => setProcessingConfig((prev) => ({ ...prev, fixed_k: e.target.value }))}
                      className="ff-input"
                    />
                    <span className="mt-1 block text-[11px] text-slate-500">
                      Use when you already know approximately how many answer categories should exist.
                    </span>
                  </label>
                )}
                <label className="block md:col-span-2">
                  <span className="ff-label">Embedding model</span>
                  <select
                    value={processingConfig.embedding_model}
                    onChange={(e) =>
                      setProcessingConfig((prev) => ({ ...prev, embedding_model: e.target.value }))
                    }
                    className="ff-input"
                  >
                    <option value="sentence-transformers/all-MiniLM-L6-v2">all-MiniLM-L6-v2 — recommended / fast</option>
                    <option value="BAAI/bge-m3">BAAI/bge-m3 — experimental / slower</option>
                    <option value="intfloat/multilingual-e5-large-instruct">multilingual-e5-large-instruct — heavy experimental</option>
                  </select>
                  {nonDefaultModel && (
                    <span className="mt-1 block text-[11px] text-amber-700">
                      Large models may be slower and may download on first use.
                    </span>
                  )}
                </label>
                <div className="md:col-span-2">
                  <label className="block">
                    <span className="ff-label">Excluded words</span>
                    <textarea
                      value={processingConfig.excluded_words}
                      onChange={(e) =>
                        setProcessingConfig((prev) => ({ ...prev, excluded_words: e.target.value }))
                      }
                      placeholder="idk, no answer, nothing, n/a"
                      rows={2}
                      className="ff-input resize-y"
                    />
                  </label>
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={processingConfig.use_excluded_words}
                      onChange={(e) =>
                        setProcessingConfig((prev) => ({ ...prev, use_excluded_words: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Use excluded words for this run
                  </label>
                </div>
              </div>
            </div>

            {participantSurveyUrl && (
              <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/80 to-indigo-50/40 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-700 shadow-sm ring-1 ring-inset ring-brand-100">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-900">Participant link</p>
                    <p className="mt-0.5 text-xs text-brand-900/70">
                      Share this URL to collect responses. Opens in participant mode.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 max-w-full flex-1 truncate rounded-md bg-white px-2 py-1.5 text-left text-[11px] text-slate-800 ring-1 ring-inset ring-brand-100">
                    {participantSurveyUrl}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyParticipantLink}
                    className="ff-btn-primary px-3 py-1.5 text-xs"
                  >
                    {participantLinkCopied ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        Copy link
                      </>
                    )}
                  </button>
                  <a
                    href={participantSurveyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ff-btn-secondary px-3 py-1.5 text-xs"
                  >
                    Open
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </div>
              </div>
            )}

            {groupedResults ? (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-2xl border border-brand-200/70 bg-gradient-to-br from-white via-white to-brand-50/60 shadow-glow">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand-500 to-accent-500"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-brand-400/15 blur-3xl"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-accent-400/10 blur-3xl"
                  />
                  <div className="relative z-10 flex flex-wrap items-start justify-between gap-3 border-b border-brand-100/60 px-4 py-3">
                    <div>
                      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700/90">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                        Latest processing run
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <StatusBadge status={groupedResults.status} />
                        {isActiveProcessing(groupedResults.status) && (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse-dot" />
                            Auto-refresh on
                          </span>
                        )}
                      </div>
                    </div>
                    {(activeRunContext.label || activeRunContext.runId || activeRunContext.clusteringMethod) && (
                      <div className="text-right text-xs text-slate-600">
                        <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                          <span className="ff-live-dot" />
                          Active result
                        </p>
                        <p className="mt-0.5 font-medium text-slate-800">
                          {activeRunContext.label || 'Latest result'}
                        </p>
                        <p className="text-slate-500">
                          {activeRunContext.runId && <span className="font-mono">{shortRunId(activeRunContext.runId)}</span>}
                          {activeRunContext.clusteringMethod && <> · {activeRunContext.clusteringMethod}</>}
                        </p>
                      </div>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-4">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-slate-500">Input answers</dt>
                      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                        {groupedResults.input_answer_count != null ? groupedResults.input_answer_count : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-slate-500">Output groups</dt>
                      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                        {groupedResults.output_group_count != null ? groupedResults.output_group_count : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-slate-500">Processed</dt>
                      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                        {groupedResults.processed_answer_count ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-slate-500">Excluded</dt>
                      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                        {groupedResults.excluded_answer_count ?? '—'}
                      </dd>
                    </div>
                  </dl>
                  <div className="space-y-1 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
                    <p>
                      <span className="text-slate-400">Last run</span>{' '}
                      <span className="font-medium text-slate-700">
                        {groupedResults.processing_time_utc ? formatUtcLabel(groupedResults.processing_time_utc) : '—'}
                      </span>
                    </p>
                    {(groupedResults.model_name ||
                      groupedResults.distance_threshold != null ||
                      groupedResults.preprocessing_descriptor) && (
                      <p>
                        <span className="text-slate-400">Pipeline</span>{' '}
                        <span className="text-slate-700">{groupedResults.embedding_model || groupedResults.model_name || '—'}</span>
                        {' · '}
                        <span className="text-slate-700">{formatPipelineRun(groupedResults)}</span>
                      </p>
                    )}
                    {groupedResults.silhouette != null && (
                      <p>
                        <span className="text-slate-400">KMeans</span> silhouette {groupedResults.silhouette} · CH {groupedResults.calinski_harabasz ?? '—'} · DB {groupedResults.davies_bouldin ?? '—'}
                      </p>
                    )}
                  </div>
                  {groupedResults.clustering_method === 'kmeans_auto_k' && (
                    <div className="border-t border-slate-100 px-4 py-3">
                      <KMeansDiagnosticsPanel
                        diagnostics={activeKDiagnostics}
                        selectedK={groupedResults.selected_k}
                        minK={groupedResults.min_k}
                        maxK={groupedResults.max_k}
                        missingNote={activeKDiagnostics.length === 0}
                        compact
                      />
                    </div>
                  )}
                </div>
                {groupedResults.status === 'failed' && groupedResults.errors && groupedResults.errors.length > 0 && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                    <p className="font-semibold">Processing failed</p>
                    {groupedResults.errors.map((line, i) => (
                      <p key={i} className="mt-1 text-rose-800">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-6 text-center">
                <p className="text-sm font-medium text-slate-800">No grouped results yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  After responses come in, click <span className="font-semibold text-slate-700">Process responses</span> to
                  run grouping. Status and counts will appear here.
                </p>
              </div>
            )}

            {statusUpdateMessage && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{statusUpdateMessage}</div>
            )}
            {processingMessage && (
              <div className="rounded-md border border-brand-100 bg-brand-50/70 px-3 py-2 text-sm text-brand-900">{processingMessage}</div>
            )}
            {runsActionMessage && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {runsActionMessage}
              </div>
            )}
            {error && !groupNameEditError && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
            )}
          </div>
        </div>

        <div className="ff-card ff-card-topline overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-white via-brand-50/40 to-white px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="ff-brand-mark mt-0.5 h-9 w-9">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10 h-5 w-5" aria-hidden="true">
                  <path d="M12 8v4l3 2" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              </span>
              <div>
                <h3 className="ff-section-title">Processing runs</h3>
                <p className="ff-section-subtitle">
                  Stored snapshots from every processing run. Preview, reuse settings, or set as active.
                </p>
              </div>
            </div>
            <span className="ff-chip-brand self-start sm:self-auto">
              {isLoadingRuns ? 'Loading…' : `${processingRuns.length} run${processingRuns.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="px-5 py-4">
          {runsError && (
            <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md p-2">{runsError}</p>
          )}
          {!isLoadingRuns && processingRuns.length === 0 && !runsError && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-500">
              No processing runs yet. Click <span className="font-medium text-slate-700">Process responses</span> to create your first one.
            </div>
          )}
          {processingRuns.length > 0 && (
            <ul className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {processingRuns.map((run) => {
                const groupCount =
                  run.output_group_count ??
                  (Array.isArray(run.group_summary) ? run.group_summary.length : 0);
                const canActivate =
                  run.status === 'completed' && !run.is_active && groupCount > 0;
                const activateTitle = run.is_active
                  ? 'This run is already active'
                  : run.status !== 'completed'
                    ? 'Only completed runs can be set as active'
                    : groupCount === 0
                      ? 'This run has no grouped data'
                      : 'Replace the current grouped result with this run output';
                return (
                  <li
                    key={run.run_id}
                    className={
                      'relative overflow-hidden rounded-xl border p-3 transition hover:shadow-card-lift ' +
                      (run.is_active
                        ? 'border-emerald-300 bg-gradient-to-br from-emerald-50/80 via-white to-accent-50/40 shadow-glow-emerald ring-1 ring-emerald-200'
                        : 'border-slate-200 bg-white')
                    }
                  >
                    {run.is_active && (
                      <span
                        className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-500 to-accent-500"
                        aria-hidden="true"
                      />
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <StatusBadge status={run.status} uppercase={false} />
                        {run.is_active && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                            Active
                          </span>
                        )}
                        {run.run_label && (
                          <span className="truncate text-sm font-medium text-slate-900">
                            {run.run_label}
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-slate-400">{shortRunId(run.run_id)}</span>
                      </div>
                      <span className="text-xs text-slate-500">
                        {formatUtcLabel(run.run_timestamp_utc)}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
                      <div>
                        <span className="text-slate-400">Method</span>{' '}
                        <span className="text-slate-800">{run.clustering_method || '—'}</span>
                      </div>
                      <div className="truncate">
                        <span className="text-slate-400">Model</span>{' '}
                        <span className="text-slate-800">
                          {run.embedding_model || run.model_name || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Groups</span>{' '}
                        <span className="font-semibold text-slate-900 tabular-nums">{groupCount || 0}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Processed</span>{' '}
                        <span className="text-slate-800 tabular-nums">
                          {run.processed_answer_count ?? '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Excluded</span>{' '}
                        <span className="text-slate-800 tabular-nums">
                          {run.excluded_answer_count ?? '—'}
                        </span>
                      </div>
                      {run.clustering_method === 'agglomerative_threshold' && (
                        <div>
                          <span className="text-slate-400">Threshold</span>{' '}
                          <span className="text-slate-800 tabular-nums">
                            {run.distance_threshold ?? '—'}
                          </span>
                        </div>
                      )}
                      {run.clustering_method === 'kmeans_auto_k' && (
                        <>
                          <div>
                            <span className="text-slate-400">K range</span>{' '}
                            <span className="text-slate-800 tabular-nums">
                              {run.min_k ?? '—'}–{run.max_k ?? '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Selected K</span>{' '}
                            <span className="font-semibold text-slate-900 tabular-nums">
                              {run.selected_k ?? '—'}
                            </span>
                          </div>
                        </>
                      )}
                      {run.clustering_method === 'kmeans_fixed_k' && (
                        <div>
                          <span className="text-slate-400">Fixed K</span>{' '}
                          <span className="font-semibold text-slate-900 tabular-nums">
                            {run.fixed_k ?? '—'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePreviewRun(run)}
                        className="ff-btn-secondary px-3 py-1.5 text-xs"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUseSettingsFromRun(run)}
                        className="ff-btn-ghost px-3 py-1.5 text-xs"
                      >
                        Use settings
                      </button>
                      <button
                        type="button"
                        onClick={() => handleActivateRun(run)}
                        disabled={!canActivate || activatingRunId === run.run_id}
                        title={activateTitle}
                        className="ff-btn-primary px-3 py-1.5 text-xs"
                      >
                        {activatingRunId === run.run_id ? 'Activating…' : 'Set as active'}
                      </button>
                      {useSettingsRunId === run.run_id && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                          Settings loaded
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          </div>
        </div>

        <div className="ff-card ff-card-accent ff-card-topline overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-white via-accent-50/40 to-white px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-700 ring-1 ring-inset ring-accent-100 shadow-glow-cyan">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                  <path d="M3 3v18h18" />
                  <path d="M7 14l3-3 3 3 5-6" />
                  <path d="M21 9V3h-6" />
                </svg>
              </span>
              <div>
                <h3 className="ff-section-title">Cluster quality insights</h3>
                <p className="ff-section-subtitle">
                  Review signals for the active grouped result — hints only, not automatic merge recommendations.
                </p>
              </div>
            </div>
            {groupedResults?.manual_edits_applied && (
              <span className="inline-flex items-center gap-1 self-start rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Manual edits applied
              </span>
            )}
          </div>
          <div className="px-5 py-4">

          {!groupedResults ? (
            <p className="text-sm italic text-slate-500">
              No active grouped result yet. Process responses to see quality insights.
            </p>
          ) : qualityInsights.totalGroups === 0 ? (
            <p className="text-sm italic text-slate-500">
              No clusters are available in the active result.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <div className="ff-panel-violet rounded-xl p-3">
                  <p className="text-[11px] uppercase tracking-wide text-brand-800/80">Total groups</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                    {qualityInsights.totalGroups}
                  </p>
                </div>
                <div className="ff-panel-violet rounded-xl p-3">
                  <p className="text-[11px] uppercase tracking-wide text-brand-800/80">Grouped answers</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                    {qualityInsights.totalGroupedAnswers}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/60 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Largest group</p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                    {qualityInsights.largestGroup
                      ? `${qualityInsights.largestGroup.canonical_name} (${qualityInsights.largestGroup.count})`
                      : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/60 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Smallest group</p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                    {qualityInsights.smallestGroup
                      ? `${qualityInsights.smallestGroup.canonical_name} (${qualityInsights.smallestGroup.count})`
                      : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/60 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Avg group size</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                    {qualityInsights.averageGroupSize != null
                      ? qualityInsights.averageGroupSize.toFixed(1)
                      : '—'}
                  </p>
                </div>
                <div
                  className={
                    'rounded-xl p-3 ' +
                    (qualityInsights.potentialReviewItemsCount > 0
                      ? 'ff-panel-amber'
                      : 'ff-panel-emerald')
                  }
                >
                  <p className={`text-[11px] uppercase tracking-wide ${
                    qualityInsights.potentialReviewItemsCount > 0 ? 'text-amber-800/85' : 'text-emerald-800/85'
                  }`}>
                    Review items
                  </p>
                  <p className={`mt-1 text-2xl font-semibold tabular-nums ${
                    qualityInsights.potentialReviewItemsCount > 0 ? 'text-amber-700' : 'text-emerald-700'
                  }`}>
                    {qualityInsights.potentialReviewItemsCount}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-card">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <path d="M12 9v4" />
                          <path d="M12 17h.01" />
                        </svg>
                      </span>
                      Weak clusters
                    </h4>
                    <span className="text-xs tabular-nums text-slate-500">
                      {qualityInsights.weakClusters.length}
                    </span>
                  </div>
                  {!qualityInsights.hasSimilarityData ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Response similarity data is not available for this run.
                    </p>
                  ) : qualityInsights.weakClusters.length === 0 ? (
                    <p className="mt-2 text-xs text-emerald-700">
                      No clusters need review based on average response-to-cluster similarity.
                    </p>
                  ) : (
                    <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs">
                      {qualityInsights.weakClusters.map((group) => (
                        <li key={group.canonical_name} className="rounded border border-amber-100 bg-amber-50 px-2 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-amber-950 truncate">{group.canonical_name}</span>
                            <span className="rounded-full bg-amber-200 px-1.5 py-0.5 font-semibold text-amber-950">
                              Needs review
                            </span>
                          </div>
                          <div className="mt-1 text-amber-900">
                            Avg match {formatPercent(group.averageSimilarity)} · {group.count} answers
                          </div>
                          <div className="text-amber-900/80">{group.reason}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-card">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                          <circle cx="11" cy="11" r="7" />
                          <path d="m21 21-4.3-4.3" />
                        </svg>
                      </span>
                      Low-confidence answers
                    </h4>
                    <span className="text-xs tabular-nums text-slate-500">
                      {qualityInsights.lowConfidenceAnswers.length}
                    </span>
                  </div>
                  {!qualityInsights.hasSimilarityData ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Response similarity data is not available for this run.
                    </p>
                  ) : qualityInsights.lowConfidenceAnswers.length === 0 ? (
                    <p className="mt-2 text-xs text-emerald-700">
                      No low-confidence answers detected for this run.
                    </p>
                  ) : (
                    <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs">
                      {qualityInsights.lowConfidenceAnswers.map((item, idx) => (
                        <li key={`${item.canonical_name}-${item.answer}-${idx}`} className="rounded-lg border border-amber-100 bg-amber-50/60 px-2 py-1.5">
                          <div className="font-medium text-slate-900">{item.answer || '—'}</div>
                          <div className="mt-0.5 flex items-center justify-between text-slate-600">
                            <span>Group: {item.canonical_name || '—'}</span>
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold tabular-nums text-amber-800">
                              {formatPercent(item.similarity)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-accent-100 bg-gradient-to-br from-white to-accent-50/30 p-3 shadow-card">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-accent-100 text-accent-700">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                          <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                          <path d="M3 12h18" />
                          <path d="M12 3a14 14 0 0 1 0 18" />
                          <path d="M12 3a14 14 0 0 0 0 18" />
                        </svg>
                      </span>
                      Similar group hints
                    </h4>
                    <span className="text-xs tabular-nums text-slate-500">{reviewHintPairs.length}</span>
                  </div>
                  {reviewHintPairs.length > 0 ? (
                    <>
                      <p className="mt-2 text-xs text-accent-900/75">
                        {reviewHintPairs.length} similar group pair{reviewHintPairs.length === 1 ? '' : 's'} may need review.
                      </p>
                      <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs text-accent-900/90">
                        {reviewHintPairs.slice(0, 5).map((pair, idx) => (
                          <li key={`${pair.source_group}-${pair.target_group}-${idx}`} className="rounded-lg border border-accent-100 bg-white/80 px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate">
                                <span className="font-medium">{pair.source_group}</span>{' '}
                                <span className="text-accent-700">↔</span>{' '}
                                <span className="font-medium">{pair.target_group}</span>
                              </span>
                              <span className="rounded-full bg-accent-100 px-1.5 py-0.5 font-semibold tabular-nums text-accent-800">
                                {formatPercent(pair.similarity)}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                      {reviewHintPairs.length > 5 && (
                        <p className="mt-1 text-[11px] text-accent-900/70">
                          +{reviewHintPairs.length - 5} more similar pair{reviewHintPairs.length - 5 === 1 ? '' : 's'}.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-emerald-700">
                      No strong similar-group hints (75%+ similarity) in this run.
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-slate-500">
                    These are review hints, not automatic merge recommendations.
                  </p>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        {groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SurveyResultsChart data={groupedResults.grouped_answers} />
            <SemanticSpaceChart data={groupedResults.grouped_answers} />
          </div>
        ) : groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length === 0 ? (
          <div className="ff-card p-6 text-center">
            <h4 className="ff-section-title">Response distribution</h4>
            <p className="mt-1 text-sm text-slate-500">
              Nothing to plot yet — the last run produced no clusters. Try again with more answers.
            </p>
          </div>
        ) : null}


        <div className="ff-card ff-card-topline overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-white via-emerald-50/40 to-white px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100 shadow-glow-emerald">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M6 12h12" />
                  <path d="M9 18h6" />
                </svg>
              </span>
              <div>
                <h3 className="ff-section-title">Grouped results</h3>
                <p className="ff-section-subtitle">Text view · export · merge</p>
              </div>
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
                  className="ff-btn-secondary"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export CSV
                </button>
                {canEditGroups && (
                  <>
                    <span className="hidden h-5 w-px bg-slate-200 sm:inline-block" />
                    <span className="text-xs text-slate-500">
                      {selectedForMerge.length > 0 ? `${selectedForMerge.length} selected` : 'Select 2+ groups'}
                    </span>
                    <button
                      type="button"
                      onClick={handleOpenMergeModal}
                      disabled={selectedForMerge.length < 2 || isMerging}
                      title={selectedForMerge.length < 2 ? 'Select at least two groups with the checkboxes' : 'Merge into one group'}
                      className="ff-btn-success"
                    >
                      Merge selected
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="px-5 py-4">
          {exportError && <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">{exportError}</p>}
          {groupNameEditError && <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">{groupNameEditError}</p>}
          {groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length > 0 ? (
            <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              {groupedResults.grouped_answers.map((group, index) => (
                <div key={group.canonical_name + index} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-card-lift">
                  {editingGroupName === group.canonical_name ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        className="ff-input"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveGroupName(group.canonical_name)}
                          disabled={isSavingGroupName}
                          className="ff-btn-success px-3 py-1 text-xs"
                        >
                          {isSavingGroupName ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancelEditGroupName}
                          className="ff-btn-secondary px-3 py-1 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {canEditGroups && (
                          <input
                            type="checkbox"
                            checked={selectedForMerge.includes(group.canonical_name)}
                            onChange={() => toggleMergeSelect(group.canonical_name)}
                            className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            aria-label={`Select group ${group.canonical_name} for merge`}
                          />
                        )}
                        <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                          {group.canonical_name}
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-50 to-accent-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-100 tabular-nums">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5" aria-hidden="true">
                              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                            </svg>
                            {group.count}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEditGroupName(group.canonical_name)}
                        className="ff-btn-ghost shrink-0 px-2 py-1 text-xs"
                        title="Rename this group"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Rename
                      </button>
                    </div>
                  )}
                  {group.raw_answers && group.raw_answers.length > 0 && (
                    <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100 bg-slate-50/60">
                      {group.raw_answers.map((ans, i) => {
                        const simEntry = group.response_similarities?.find((item) => item.answer === ans);
                        const sim = simEntry && typeof simEntry.similarity === 'number' ? simEntry.similarity : null;
                        const simPct = sim != null ? Math.round(sim * 100) : null;
                        const lowConfidence = sim != null && sim < 0.65;
                        return (
                          <li key={i} className="group/answer flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-slate-800">{ans}</span>
                              {simPct != null && (
                                <span
                                  className={
                                    'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ring-1 ring-inset ' +
                                    (lowConfidence
                                      ? 'bg-amber-50 text-amber-700 ring-amber-200'
                                      : 'bg-accent-50 text-accent-800 ring-accent-100')
                                  }
                                  title={lowConfidence ? 'Low-confidence answer' : 'Match score'}
                                >
                                  {simPct}%
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => handleOpenMoveModal(ans, group.canonical_name)}
                              className="shrink-0 rounded-md px-2 py-0.5 text-[11px] text-slate-500 hover:bg-brand-50 hover:text-brand-700"
                              title="Move this answer to another group"
                            >
                              Move
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : groupedResults && groupedResults.grouped_answers && groupedResults.grouped_answers.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
              <span className="font-medium">No groups in this run.</span>{' '}
              <span className="text-amber-800">
                See the latest processing status above — you may need more or more varied answers.
              </span>
            </div>
          ) : !groupedResults ? (
            <p className="text-sm italic text-slate-500">
              Grouped answers will list here after the first successful processing run.
            </p>
          ) : (
            <p className="text-sm text-slate-500">Unable to load grouped results.</p>
          )}
          </div>
        </div>

        <div className="ff-card ff-card-topline overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-white via-slate-50/60 to-white px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-slate-100 ring-1 ring-inset ring-slate-700 shadow-on-dark">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <div>
                <h3 className="ff-section-title">Raw responses</h3>
                <p className="ff-section-subtitle">Every submission as received from participants.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="ff-chip">{rawResponses.length}</span>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="ff-btn-secondary px-3 py-1.5 text-xs"
              >
                Import responses
              </button>
            </div>
          </div>
          <div className="px-5 py-4">
            {importMessage && (
              <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {importMessage}
              </div>
            )}
            {rawResponses.length > 0 ? (
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-1 text-sm">
                {rawResponses.map((resp) => (
                  <li key={resp._id || resp.id} className="py-1.5 text-slate-700">
                    {resp.answer_text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm italic text-slate-500">No raw responses submitted yet.</p>
            )}
          </div>
        </div>

        {processingHistory.length > 0 && (
          <details className="ff-card ff-card-topline overflow-hidden">
            <summary className="flex cursor-pointer items-center justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-white via-slate-50/60 to-white px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                    <path d="M12 8v4l3 2" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                </span>
                <div>
                  <h3 className="ff-section-title">Processing history (compact)</h3>
                  <p className="ff-section-subtitle">Lightweight log of past runs — open the full Processing runs section for actions.</p>
                </div>
              </div>
              <span className="ff-chip">{processingHistory.length}</span>
            </summary>
            <div className="px-5 py-4">
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              {processingHistory.map((run) => (
                <div key={run.run_id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge status={run.status} uppercase={false} />
                    <span className="text-slate-500">{formatUtcLabel(run.run_timestamp_utc)}</span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-slate-600 sm:grid-cols-4">
                    <span><span className="text-slate-400">in</span> {run.input_answer_count ?? '—'}</span>
                    <span><span className="text-slate-400">processed</span> {run.processed_answer_count ?? '—'}</span>
                    <span><span className="text-slate-400">excluded</span> {run.excluded_answer_count ?? '—'}</span>
                    <span><span className="text-slate-400">out</span> {run.output_group_count ?? '—'}</span>
                  </div>
                  <div className="mt-1 text-slate-600">
                    <span className="text-slate-400">label</span> {run.run_label || '—'} · <span className="text-slate-400">model</span> {run.embedding_model || run.model_name || '—'} · {formatPipelineRun(run)}
                  </div>
                  {(run.silhouette != null || run.calinski_harabasz != null || run.davies_bouldin != null) && (
                    <div className="mt-1 text-slate-600">
                      <span className="text-slate-400">metrics</span> silhouette {run.silhouette ?? '—'} · CH {run.calinski_harabasz ?? '—'} · DB {run.davies_bouldin ?? '—'}
                    </div>
                  )}
                  {run.excluded_words_used && run.excluded_words_used.length > 0 && (
                    <div className="mt-1 text-slate-600">
                      <span className="text-slate-400">excluded words</span> {run.excluded_words_used.join(', ')}
                    </div>
                  )}
                  {run.error_summary && <div className="mt-1 text-rose-700">error: {run.error_summary}</div>}
                </div>
              ))}
            </div>
            </div>
          </details>
        )}
      </div>
    </>
  );
}

export default SurveyDetails;