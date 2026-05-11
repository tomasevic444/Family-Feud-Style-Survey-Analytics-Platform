// src/components/admin/SurveyDetails.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import apiClient from '../../api';
import SurveyResultsChart from './SurveyResultsChart';
import MoveAnswerModal from './MoveAnswerModal';
import MergeGroupsModal from './MergeGroupsModal';
import SemanticSpaceChart from './SemanticSpaceChart';
import RunPreviewModal from './RunPreviewModal';

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
                    {(activeRunContext.label || activeRunContext.runId || activeRunContext.clusteringMethod) && (
                      <p className="mt-2 text-xs text-gray-600">
                        Showing active result from:{' '}
                        <span className="font-medium text-gray-800">
                          {activeRunContext.label || 'Latest result'}
                        </span>
                        {activeRunContext.runId && (
                          <span className="text-gray-500"> · run {shortRunId(activeRunContext.runId)}</span>
                        )}
                        {activeRunContext.clusteringMethod && (
                          <span className="text-gray-500"> · {activeRunContext.clusteringMethod}</span>
                        )}
                        {activeRunContext.embeddingModel && (
                          <span className="text-gray-500"> · {activeRunContext.embeddingModel}</span>
                        )}
                      </p>
                    )}
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
            {runsActionMessage && (
              <p className="mt-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-md p-2">
                {runsActionMessage}
              </p>
            )}
            {error && !groupNameEditError && <p className="mt-3 text-sm text-red-800 bg-red-50 border border-red-100 rounded-md p-2">{error}</p>}
        </div>

        <div>
          <div className="flex flex-col gap-1 border-b border-gray-100 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Processing Runs</h3>
              <p className="text-xs text-gray-500">
                Stored snapshots from every processing run. Preview, reuse settings, or set as active.
              </p>
            </div>
            <div className="text-xs text-gray-500">
              {isLoadingRuns ? 'Loading…' : `${processingRuns.length} run${processingRuns.length === 1 ? '' : 's'}`}
            </div>
          </div>
          {runsError && (
            <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md p-2">{runsError}</p>
          )}
          {!isLoadingRuns && processingRuns.length === 0 && !runsError && (
            <p className="mt-3 text-sm italic text-gray-500">No processing runs yet.</p>
          )}
          {processingRuns.length > 0 && (
            <ul className="mt-3 space-y-2 max-h-96 overflow-y-auto pr-1">
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
                    className={`rounded-md border bg-white p-3 shadow-sm ${
                      run.is_active ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={run.status} uppercase={false} />
                        {run.is_active && (
                          <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                            Active
                          </span>
                        )}
                        {run.run_label && (
                          <span className="text-sm font-medium text-gray-800 truncate">
                            {run.run_label}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {formatUtcLabel(run.run_timestamp_utc)}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600 sm:grid-cols-4">
                      <div>
                        <span className="text-gray-500">Method:</span>{' '}
                        <span className="text-gray-800">{run.clustering_method || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Model:</span>{' '}
                        <span className="text-gray-800 truncate">
                          {run.embedding_model || run.model_name || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Groups:</span>{' '}
                        <span className="text-gray-800 tabular-nums">{groupCount || 0}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Processed:</span>{' '}
                        <span className="text-gray-800 tabular-nums">
                          {run.processed_answer_count ?? '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Excluded:</span>{' '}
                        <span className="text-gray-800 tabular-nums">
                          {run.excluded_answer_count ?? '—'}
                        </span>
                      </div>
                      {run.clustering_method === 'agglomerative_threshold' && (
                        <div>
                          <span className="text-gray-500">Threshold:</span>{' '}
                          <span className="text-gray-800 tabular-nums">
                            {run.distance_threshold ?? '—'}
                          </span>
                        </div>
                      )}
                      {run.clustering_method === 'kmeans_auto_k' && (
                        <>
                          <div>
                            <span className="text-gray-500">K range:</span>{' '}
                            <span className="text-gray-800 tabular-nums">
                              {run.min_k ?? '—'} - {run.max_k ?? '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Selected K:</span>{' '}
                            <span className="text-gray-800 tabular-nums">
                              {run.selected_k ?? '—'}
                            </span>
                          </div>
                        </>
                      )}
                      {run.clustering_method === 'kmeans_fixed_k' && (
                        <div>
                          <span className="text-gray-500">Fixed K:</span>{' '}
                          <span className="text-gray-800 tabular-nums">
                            {run.fixed_k ?? '—'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePreviewRun(run)}
                        className="rounded-md bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUseSettingsFromRun(run)}
                        className="rounded-md bg-slate-700 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
                      >
                        Use settings
                      </button>
                      <button
                        type="button"
                        onClick={() => handleActivateRun(run)}
                        disabled={!canActivate || activatingRunId === run.run_id}
                        title={activateTitle}
                        className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {activatingRunId === run.run_id ? 'Activating…' : 'Set as active result'}
                      </button>
                      {useSettingsRunId === run.run_id && (
                        <span className="text-[11px] font-medium text-slate-600">
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

        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex flex-col gap-1 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Cluster Quality Insights</h3>
              <p className="text-xs text-gray-500">
                Review signals for the active grouped result. These are review hints, not automatic merge recommendations.
              </p>
            </div>
            {groupedResults?.manual_edits_applied && (
              <span className="inline-flex self-start rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
                Manual edits applied
              </span>
            )}
          </div>

          {!groupedResults ? (
            <p className="mt-3 text-sm italic text-gray-500">
              No active grouped result yet. Process responses to see quality insights.
            </p>
          ) : qualityInsights.totalGroups === 0 ? (
            <p className="mt-3 text-sm italic text-gray-500">
              No clusters are available in the active result.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Total groups</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {qualityInsights.totalGroups}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Grouped answers</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {qualityInsights.totalGroupedAnswers}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Largest group</p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                    {qualityInsights.largestGroup
                      ? `${qualityInsights.largestGroup.canonical_name} (${qualityInsights.largestGroup.count})`
                      : '—'}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Smallest group</p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                    {qualityInsights.smallestGroup
                      ? `${qualityInsights.smallestGroup.canonical_name} (${qualityInsights.smallestGroup.count})`
                      : '—'}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Avg group size</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {qualityInsights.averageGroupSize != null
                      ? qualityInsights.averageGroupSize.toFixed(1)
                      : '—'}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Review items</p>
                  <p className={`mt-1 text-lg font-semibold tabular-nums ${
                    qualityInsights.potentialReviewItemsCount > 0 ? 'text-amber-700' : 'text-emerald-700'
                  }`}>
                    {qualityInsights.potentialReviewItemsCount}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-slate-900">Weak clusters</h4>
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

                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-slate-900">Low-confidence answers</h4>
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
                        <li key={`${item.canonical_name}-${item.answer}-${idx}`} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5">
                          <div className="font-medium text-slate-900">{item.answer || '—'}</div>
                          <div className="mt-0.5 text-slate-600">
                            Group: {item.canonical_name || '—'} · match {formatPercent(item.similarity)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-slate-900">Similar group hints</h4>
                    <span className="text-xs tabular-nums text-slate-500">{reviewHintPairs.length}</span>
                  </div>
                  {reviewHintPairs.length > 0 ? (
                    <>
                      <p className="mt-2 text-xs text-indigo-900/75">
                        {reviewHintPairs.length} similar group pair{reviewHintPairs.length === 1 ? '' : 's'} may need review.
                      </p>
                      <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs text-indigo-900/90">
                        {reviewHintPairs.slice(0, 5).map((pair, idx) => (
                          <li key={`${pair.source_group}-${pair.target_group}-${idx}`} className="rounded border border-indigo-100 bg-indigo-50 px-2 py-1.5">
                            <span className="font-medium">{pair.source_group}</span> ↔{' '}
                            <span className="font-medium">{pair.target_group}</span>{' '}
                            <span className="text-indigo-800/80">
                              ({formatPercent(pair.similarity)})
                            </span>
                          </li>
                        ))}
                      </ul>
                      {reviewHintPairs.length > 5 && (
                        <p className="mt-1 text-[11px] text-indigo-900/70">
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