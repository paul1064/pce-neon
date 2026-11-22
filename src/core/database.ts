import { EngineDB } from './db';
import type { EngineSettings } from './model';

export const db = new EngineDB();

export const DEFAULT_SETTINGS: EngineSettings = {
  id: 'settings',
  currency: 'EUR',
  debtStrategy: 'avalanche',
  buffer: 0,
  enabledModules: ['ideas', 'income', 'fixedCosts', 'debts'],
};

/** Stellt sicher, dass der einzige Einstellungen-Datensatz existiert. */
export async function ensureSettings(database: EngineDB = db): Promise<EngineSettings> {
  const existing = await database.settings.get('settings');
  if (existing) return existing;
  await database.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}
