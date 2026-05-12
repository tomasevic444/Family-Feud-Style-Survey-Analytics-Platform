import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../../api';

const DELIMITER_OPTIONS = [
  { value: ',', label: 'Comma (,)' },
  { value: ';', label: 'Semicolon (;)' },
  { value: '\t', label: 'Tab' },
];

function extractErrorMessage(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  return fallback;
}

function parseCsvLine(line, delimiter) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function parseCsvPreview(text, delimiter) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.length > 0);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0], delimiter).map((h) => h.trim());
  const rows = lines.slice(1, 6).map((line) => parseCsvLine(line, delimiter));
  return { headers, rows };
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
  const [delimiter, setDelimiter] = useState(',');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [parseError, setParseError] = useState('');

  useEffect(() => {
    if (!show) return;
    setFile(null);
    setAnswerColumn('answer_text');
    setDelimiter(',');
    setIsUploading(false);
    setError('');
    setResult(null);
    setHeaders([]);
    setPreviewRows([]);
    setParseError('');
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
  const canUseDropdown = headers.length > 0;

  const handleFileSelected = (selectedFile) => {
    setFile(selectedFile || null);
    setError('');
    setResult(null);
    setParseError('');
    if (!selectedFile) {
      setHeaders([]);
      setPreviewRows([]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const preview = parseCsvPreview(text, delimiter);
        setHeaders(preview.headers);
        setPreviewRows(preview.rows);
        if (preview.headers.includes(answerColumn)) return;
        if (preview.headers.includes('answer_text')) {
          setAnswerColumn('answer_text');
        } else if (preview.headers.length > 0) {
          setAnswerColumn(preview.headers[0]);
        }
      } catch {
        setParseError('Could not parse CSV preview. You can still import manually.');
        setHeaders([]);
        setPreviewRows([]);
      }
    };
    reader.onerror = () => {
      setParseError('Could not read file preview. You can still import manually.');
      setHeaders([]);
      setPreviewRows([]);
    };
    reader.readAsText(selectedFile, 'utf-8');
  };

  const handleDownloadSample = () => {
    const sample = [
      'answer_text',
      'dog',
      'puppy',
      'cat',
      'kitten',
      'rabbit',
      'bunny',
      'remote work',
      'work from home',
      'salary',
      'career growth',
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sample-responses.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

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
      formData.append('delimiter', delimiter);
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
            <div className="flex items-center justify-between">
              <label className="ff-label" htmlFor="csvFileInput">CSV file</label>
              <button type="button" onClick={handleDownloadSample} className="ff-btn-ghost px-2 py-1 text-xs">
                Download sample CSV
              </button>
            </div>
            <label
              htmlFor="csvFileInput"
              className="block cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 text-sm text-slate-600 hover:bg-slate-50"
            >
              <span className="font-medium text-slate-800">
                {file ? file.name : 'Drop CSV here or click to browse'}
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-500">
                Header row required. UTF-8 CSV recommended.
              </span>
            </label>
            <input
              id="csvFileInput"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => handleFileSelected(event.target.files?.[0] || null)}
              className="sr-only"
              disabled={isUploading}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="ff-label" htmlFor="delimiterSelect">Delimiter</label>
              <select
                id="delimiterSelect"
                value={delimiter}
                onChange={(event) => {
                  const next = event.target.value;
                  setDelimiter(next);
                  if (file) handleFileSelected(file);
                }}
                className="ff-input"
                disabled={isUploading}
              >
                {DELIMITER_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="ff-label" htmlFor="answerColumnInput">Answer column</label>
              {canUseDropdown ? (
                <select
                  id="answerColumnInput"
                  value={answerColumn}
                  onChange={(event) => setAnswerColumn(event.target.value)}
                  className="ff-input"
                  disabled={isUploading}
                >
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              ) : (
                <input
                  id="answerColumnInput"
                  type="text"
                  value={answerColumn}
                  onChange={(event) => setAnswerColumn(event.target.value)}
                  placeholder="answer_text"
                  className="ff-input"
                  disabled={isUploading}
                />
              )}
            </div>
          </div>

          {headers.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Detected columns</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {headers.map((header) => (
                  <span key={header} className="ff-chip">{header}</span>
                ))}
              </div>
            </div>
          )}

          {previewRows.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">
                Preview (first 5 rows)
              </div>
              <div className="max-h-36 overflow-auto px-3 py-2 text-xs text-slate-700">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {headers.map((header) => (
                        <th key={header} className="border-b border-slate-200 px-1.5 py-1 text-left font-semibold text-slate-600">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, idx) => (
                      <tr key={`preview-${idx}`}>
                        {headers.map((_, colIdx) => (
                          <td key={`cell-${idx}-${colIdx}`} className="border-b border-slate-100 px-1.5 py-1">
                            {row[colIdx] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {parseError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {parseError}
            </div>
          )}

          <div>
            <p className="text-[11px] text-slate-500">
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
            <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-800">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div className="rounded-md border border-emerald-200 bg-white/80 px-2 py-1">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-700/80">Imported</p>
                  <p className="text-base font-semibold tabular-nums">{result.imported_count ?? 0}</p>
                </div>
                <div className="rounded-md border border-emerald-200 bg-white/80 px-2 py-1">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-700/80">Skipped empty</p>
                  <p className="text-base font-semibold tabular-nums">{result.skipped_empty_count ?? 0}</p>
                </div>
                <div className="rounded-md border border-emerald-200 bg-white/80 px-2 py-1">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-700/80">Skipped invalid</p>
                  <p className="text-base font-semibold tabular-nums">{result.skipped_invalid_count ?? 0}</p>
                </div>
                <div className="rounded-md border border-emerald-200 bg-white/80 px-2 py-1">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-700/80">Skipped limit</p>
                  <p className="text-base font-semibold tabular-nums">{result.skipped_limit_count ?? 0}</p>
                </div>
                <div className="rounded-md border border-emerald-200 bg-white/80 px-2 py-1">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-700/80">Total rows</p>
                  <p className="text-base font-semibold tabular-nums">{result.total_rows ?? 0}</p>
                </div>
              </div>
              <span className="block text-emerald-700/90">
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
