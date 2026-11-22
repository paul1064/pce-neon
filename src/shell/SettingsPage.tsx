import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import {
  CheckCircle2,
  Download,
  HardDrive,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  DEFAULT_SETTINGS,
  centsToInput,
  db,
  formatCents,
  parseEuroToCents,
  todayISO,
  type DebtStrategy,
  type ModuleId,
} from '../core';
import {
  clearAllData,
  exportAllData,
  getLastExportAt,
  importAllData,
  markExportedNow,
} from './backup';
import { modules } from './registry';
import {
  checkPersistentStorage,
  requestPersistentStorage,
  useInstallPrompt,
  useOnlineStatus,
} from './pwa';

const bufferSchema = z.number().int().min(0, 'Der Puffer darf nicht negativ sein.');

export function SettingsPage() {
  const settings = useLiveQuery(() => db.settings.get('settings'), []);
  const current = settings ?? DEFAULT_SETTINGS;

  const [bufferInput, setBufferInput] = useState<string>('');
  const [bufferSynced, setBufferSynced] = useState<boolean>(false);
  const [bufferMessage, setBufferMessage] = useState<string | null>(null);
  const [bufferError, setBufferError] = useState<string | null>(null);

  const [backupStatus, setBackupStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(
    null,
  );
  const [lastExportAt, setLastExportAt] = useState<string | null>(() => getLastExportAt());
  const [confirmClear, setConfirmClear] = useState<boolean>(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { canInstall, triggerInstall } = useInstallPrompt();
  const online = useOnlineStatus();

  useEffect(() => {
    if (settings && !bufferSynced) {
      setBufferInput(centsToInput(settings.buffer));
      setBufferSynced(true);
    }
  }, [settings, bufferSynced]);

  useEffect(() => {
    void checkPersistentStorage().then(setPersisted);
  }, []);

  const updateStrategy = async (debtStrategy: DebtStrategy) => {
    await db.settings.put({ ...current, debtStrategy });
  };

  const handleBufferSave = async (e: FormEvent) => {
    e.preventDefault();
    setBufferError(null);
    setBufferMessage(null);
    const parsedCents = parseEuroToCents(bufferInput);
    if (parsedCents === null) {
      setBufferError('Bitte einen gültigen Euro-Betrag eingeben (z. B. 0,00 oder 100,00).');
      return;
    }
    const validation = bufferSchema.safeParse(parsedCents);
    if (!validation.success) {
      setBufferError(validation.error.issues[0]?.message ?? 'Ungültiger Betrag.');
      return;
    }
    await db.settings.put({ ...current, buffer: validation.data });
    setBufferInput(centsToInput(validation.data));
    setBufferMessage(`Puffer auf ${formatCents(validation.data)} gespeichert.`);
  };

  const toggleModule = async (id: ModuleId) => {
    const exists = current.enabledModules.includes(id);
    const next = exists
      ? current.enabledModules.filter((m) => m !== id)
      : [...current.enabledModules, id];
    await db.settings.put({ ...current, enabledModules: next });
  };

  const handleExport = async () => {
    setBackupStatus(null);
    try {
      const payload = await exportAllData(db);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cashflow-engine-backup-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      markExportedNow();
      setLastExportAt(getLastExportAt());
      setBackupStatus({ kind: 'ok', text: 'Backup erfolgreich als JSON exportiert.' });
    } catch {
      setBackupStatus({ kind: 'error', text: 'Export fehlgeschlagen.' });
    }
  };

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupStatus(null);
    try {
      const text = await file.text();
      const raw: unknown = JSON.parse(text);
      const imported = await importAllData(db, raw);
      const nextSettings = imported.tables.settings[0] ?? DEFAULT_SETTINGS;
      setBufferInput(centsToInput(nextSettings.buffer));
      setBackupStatus({
        kind: 'ok',
        text: 'Backup erfolgreich importiert und wiederhergestellt.',
      });
    } catch {
      setBackupStatus({
        kind: 'error',
        text: 'Ungültige Backup-Datei. Bitte ein gültiges Cashflow-Engine-JSON wählen.',
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClearAll = async () => {
    await clearAllData(db);
    setBufferInput(centsToInput(0));
    setConfirmClear(false);
    setBackupStatus({ kind: 'ok', text: 'Alle lokalen Daten wurden gelöscht.' });
  };

  const handleRequestPersist = async () => {
    const result = await requestPersistentStorage();
    setPersisted(result);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Einstellungen</h1>
        <p className="text-sm text-slate-500">
          Tilgungsstrategie, monatlicher Puffer, Module und lokales JSON-Backup.
        </p>
      </div>

      {/* Tilgungsstrategie */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Tilgungsstrategie</h2>
        <p className="text-xs text-slate-500">
          Bestimmt, welche Schuld den gesamten Überschuss nach Fixkosten und Mindestraten erhält.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => updateStrategy('avalanche')}
            aria-pressed={current.debtStrategy === 'avalanche'}
            className={`rounded-xl border p-4 text-left transition-colors ${
              current.debtStrategy === 'avalanche'
                ? 'border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900">Lawine</span>
              {current.debtStrategy === 'avalanche' && (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              )}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Höchster Zinssatz zuerst – spart langfristig die meisten Zinsen.
            </p>
          </button>

          <button
            type="button"
            onClick={() => updateStrategy('snowball')}
            aria-pressed={current.debtStrategy === 'snowball'}
            className={`rounded-xl border p-4 text-left transition-colors ${
              current.debtStrategy === 'snowball'
                ? 'border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900">Schneeball</span>
              {current.debtStrategy === 'snowball' && (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              )}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Kleinster Saldo zuerst – sorgt für schnelle erste Erfolgserlebnisse.
            </p>
          </button>
        </div>
      </section>

      {/* Puffer */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Monatlicher Puffer</h2>
        <p className="text-xs text-slate-500">
          Rücklage pro Monat vor der Extra-Tilgung. Standard ist 0,00 € (aus).
        </p>
        <form onSubmit={handleBufferSave} className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-44">
            <span className="block text-xs font-medium text-slate-700">Betrag in Euro</span>
            <input
              type="text"
              inputMode="decimal"
              value={bufferInput}
              onChange={(e) => setBufferInput(e.target.value)}
              placeholder="0,00"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-emerald-600 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
          >
            Puffer speichern
          </button>
        </form>
        {bufferError && <p className="text-xs text-rose-600">{bufferError}</p>}
        {bufferMessage && <p className="text-xs text-emerald-700">{bufferMessage}</p>}
      </section>

      {/* Aktive Module */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Aktive Module</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {modules.map((mod) => {
            const active = current.enabledModules.includes(mod.id);
            return (
              <label
                key={mod.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm cursor-pointer hover:bg-slate-50"
              >
                <span className="font-medium text-slate-800">{mod.title}</span>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => void toggleModule(mod.id)}
                  className="h-4 w-4 accent-emerald-600"
                />
              </label>
            );
          })}
        </div>
      </section>

      {/* Backup: JSON-Export & -Import */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Backup & Daten</h2>
          <p className="text-xs text-slate-500">
            Alle Daten bleiben lokal in IndexedDB. Exportiere regelmäßig ein JSON-Backup.
          </p>
          {lastExportAt && (
            <p className="mt-1 text-xs text-slate-500">
              Letzter Export: {new Date(lastExportAt).toLocaleString('de-AT')}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 transition-colors"
          >
            <Download className="h-4 w-4" />
            JSON exportieren
          </button>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors">
            <Upload className="h-4 w-4" />
            <span>JSON importieren</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void handleImportFile(e)}
              className="sr-only"
            />
          </label>
        </div>

        {backupStatus && (
          <p
            role="status"
            className={`text-xs font-medium ${
              backupStatus.kind === 'ok' ? 'text-emerald-700' : 'text-rose-600'
            }`}
          >
            {backupStatus.text}
          </p>
        )}

        <div className="border-t border-slate-100 pt-4">
          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Alle Daten löschen
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
              <span className="text-xs font-medium text-rose-800">
                Wirklich alle lokalen Daten unwiderruflich löschen?
              </span>
              <button
                type="button"
                onClick={() => void handleClearAll()}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Ja, alles löschen
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                Abbrechen
              </button>
            </div>
          )}
        </div>
      </section>

      {/* App & Speicher */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
        <h2 className="text-base font-semibold text-slate-900">App & Offline-Speicher</h2>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 text-slate-700">
            <HardDrive className="h-4 w-4 text-slate-500" />
            <span>
              Dauerhafter Speicher:{' '}
              <strong>
                {persisted === true
                  ? 'Aktiv'
                  : persisted === false
                    ? 'Nicht garantiert'
                    : 'Vom Browser verwaltet'}
              </strong>
            </span>
          </div>
          {persisted === false && (
            <button
              type="button"
              onClick={() => void handleRequestPersist()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Schutz anfordern
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 text-slate-700">
            <Smartphone className="h-4 w-4 text-slate-500" />
            <span>
              Verbindungsstatus: <strong>{online ? 'Online' : 'Offline (lokal aktiv)'}</strong>
            </span>
          </div>
          {canInstall && (
            <button
              type="button"
              onClick={() => void triggerInstall()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              Als App installieren
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
