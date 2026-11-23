import { useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import { formatCents, type FixedCost, type YearMonth } from '../../core';
import {
  BILLING_CYCLE_LABELS,
  CATEGORY_LABELS,
} from './logic';
import {
  importFixedCostsBatch,
  parseFixedCostsCsv,
  type CsvImportPreview,
} from './csvImport';

interface CsvImportPanelProps {
  defaultMonth: YearMonth;
  existingFixedCosts: FixedCost[];
  onImported: (count: number) => void;
  onClose: () => void;
}

export function CsvImportPanel({
  defaultMonth,
  existingFixedCosts,
  onImported,
  onClose,
}: CsvImportPanelProps) {
  const [rawText, setRawText] = useState<string>('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runParse = (text: string) => {
    setError(null);
    const parsed = parseFixedCostsCsv(text, defaultMonth, existingFixedCosts);
    setPreview(parsed);
    const initialSelected = new Set(
      parsed.rows.filter((r) => !r.isDuplicate).map((r) => r.rowNumber),
    );
    setSelectedRows(initialSelected);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      setFileName(file.name);
      setRawText(text);
      runParse(text);
    } catch {
      setError('Die Datei konnte nicht gelesen werden.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const toggleRow = (rowNumber: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) {
        next.delete(rowNumber);
      } else {
        next.add(rowNumber);
      }
      return next;
    });
  };

  const selectedItems = preview
    ? preview.rows.filter((r) => selectedRows.has(r.rowNumber))
    : [];
  const totalSelectedMonthly = selectedItems.reduce((sum, item) => sum + item.monthlyCents, 0);

  const handleImport = async () => {
    if (selectedItems.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const created = await importFixedCostsBatch(selectedItems.map((item) => item.input));
      onImported(created.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import fehlgeschlagen.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <section
      aria-label="Abos aus CSV importieren"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <h2 className="text-base font-semibold text-slate-900">Abos aus CSV importieren</h2>
          </div>
          <p className="text-xs text-slate-500">
            Lies eine Abo-Übersicht aus Google Sheets oder Excel lokal im Browser ein (Komma,
            Semikolon oder Tab; Spalten wie Name/Bezeichnung und Betrag werden automatisch erkannt).
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="CSV-Import schließen"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Datei-Upload oder Text-Einfügen */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors">
          <Upload className="h-4 w-4" />
          <span>CSV-Datei wählen</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            onChange={(e) => void handleFileChange(e)}
            className="sr-only"
          />
        </label>
        {fileName && (
          <span className="text-xs font-medium text-slate-600">Datei: {fileName}</span>
        )}
      </div>

      <div>
        <label htmlFor="csv-paste-input" className="block text-xs font-medium text-slate-700">
          Oder CSV-Inhalt direkt einfügen
        </label>
        <textarea
          id="csv-paste-input"
          rows={4}
          value={rawText}
          onChange={(e) => {
            const next = e.target.value;
            setRawText(next);
            if (next.trim()) {
              runParse(next);
            } else {
              setPreview(null);
              setSelectedRows(new Set());
            }
          }}
          placeholder={'Name;Betrag;Zyklus;Fälligkeit;Kategorie\nMobilfunk;7,90 €;monatlich;7;Wichtig\nKI-Tool;21,99 €;monatlich;15;Tool'}
          className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      {(error || preview?.error) && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <span>{error ?? preview?.error}</span>
        </div>
      )}

      {/* Vorschau der erkannten Abos */}
      {preview && !preview.error && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
            <span className="text-slate-700">
              <strong>{preview.rows.length}</strong> Abos erkannt (Kopfzeile Zeile{' '}
              {preview.headerRowNumber}) · <strong>{selectedItems.length}</strong> ausgewählt
            </span>
            <span className="font-semibold text-slate-900 tabular-nums">
              Summe Auswahl: {formatCents(totalSelectedMonthly)} / Monat
            </span>
          </div>

          {preview.rows.length > 0 ? (
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
              {preview.rows.map((row) => {
                const checked = selectedRows.has(row.rowNumber);
                return (
                  <label
                    key={row.rowNumber}
                    className={`flex cursor-pointer items-start justify-between gap-3 px-3.5 py-2.5 text-xs transition-colors ${
                      checked ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/60 text-slate-400'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRow(row.rowNumber)}
                        className="mt-0.5 h-4 w-4 accent-emerald-600"
                      />
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-slate-900 truncate">
                            {row.input.name}
                          </span>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 tabular-nums">
                            Prio {row.input.priority}
                          </span>
                          <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-600">
                            {CATEGORY_LABELS[row.input.category]}
                          </span>
                          {row.isDuplicate && (
                            <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                              Bereits vorhanden
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {BILLING_CYCLE_LABELS[row.input.cycle]} · Fällig am {row.input.dueDay}.
                          {row.note ? ` · ${row.note}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right tabular-nums">
                      <p className="font-semibold text-slate-900">
                        {formatCents(row.monthlyCents)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {row.input.cycle === 'monthly'
                          ? 'pro Monat'
                          : `${formatCents(row.input.amount)} / Zyklus`}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Keine aktiven Abo-Zeilen gefunden.
            </p>
          )}

          {preview.skipped.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">
                {preview.skipped.length} Zeile(n) übersprungen:
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                {preview.skipped.slice(0, 6).map((item) => (
                  <li key={`${item.rowNumber}-${item.rawName}`}>
                    Zeile {item.rowNumber} ({item.rawName}): {item.reason}
                  </li>
                ))}
                {preview.skipped.length > 6 && (
                  <li>… und {preview.skipped.length - 6} weitere</li>
                )}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="button"
              disabled={importing || selectedItems.length === 0}
              onClick={() => void handleImport()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              {importing
                ? 'Importiere …'
                : `${selectedItems.length} ${selectedItems.length === 1 ? 'Abo' : 'Abos'} importieren`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
