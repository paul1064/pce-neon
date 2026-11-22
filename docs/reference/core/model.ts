// core/model.ts — das gemeinsame Datenmodell aller vier Module
import type { WaterfallResult } from './waterfall';

export type ID = string;          // crypto.randomUUID()
export type ISODate = string;     // '2026-11-22'
export type YearMonth = string;   // '2026-11' (als String sortierbar)
export type Cents = number;       // immer ganze Cent: 12,99 € = 1299

export interface BaseEntity {
  id: ID;
  createdAt: ISODate;
  updatedAt: ISODate;
  archivedAt?: ISODate;           // archivieren statt löschen
}

// ── Modul 1: Ideen-Sammler ────────────────────────────────────────────
export type IdeaStatus = 'inbox' | 'validating' | 'validated' | 'rejected' | 'promoted';
export type ValidationCriterion =
  | 'demand'            // Gibt es zahlende Nachfrage?
  | 'effort'            // Aufwand bis zum ersten Angebot
  | 'timeToFirstEuro'   // Wie schnell kommt der erste Euro?
  | 'startupCost'       // Was kostet der Start?
  | 'energy';           // Zieht es mich an oder kostet es Kraft?

export interface ValidationCheck {
  criterion: ValidationCriterion;
  rating: 1 | 2 | 3 | 4 | 5;
  note?: string;
}

export interface IdeaEstimate {
  setupHours: number;
  monthlyRevenue: Cents;
  monthlyCost: Cents;
}

export interface Idea extends BaseEntity {
  title: string;
  description: string;
  tags: string[];
  status: IdeaStatus;
  checks: ValidationCheck[];
  score?: number;                 // 0–100, aus checks berechnet
  estimate?: IdeaEstimate;
  projectId?: ID;                 // gesetzt, sobald status = 'promoted'
}

export type ProjectStatus = 'active' | 'paused' | 'done' | 'dropped';

export interface Project extends BaseEntity {
  name: string;
  status: ProjectStatus;
  ideaId?: ID;                    // Herkunft; Projekte dürfen auch ohne Idee entstehen
  monthlyTarget?: Cents;          // aus Idea.estimate übernommen
  nextStep?: string;
}

// ── Modul 2: Einkommensquellen-Tracker ────────────────────────────────
export type IncomeSourceKind = 'project' | 'microtask' | 'recurring' | 'other';

export interface IncomeSource extends BaseEntity {
  name: string;
  kind: IncomeSourceKind;
  projectId?: ID;                 // Pflicht bei kind = 'project'
  platform?: string;
  inWaterfall: boolean;           // false = wird erfasst, aber nicht verteilt
}

export interface IncomeEntry extends BaseEntity {
  sourceId: ID;
  amount: Cents;                  // netto, so wie es am Konto ankommt
  receivedOn: ISODate;
  month: YearMonth;               // aus receivedOn abgeleitet, indexiert
  hoursSpent?: number;            // für den Stundenlohn je Quelle
  note?: string;
}

// ── Modul 3: Abo-Gegenfinanzierer ─────────────────────────────────────
export type BillingCycle = 'monthly' | 'quarterly' | 'yearly';

export interface FixedCost extends BaseEntity {
  name: string;
  amount: Cents;                  // pro Abrechnungszyklus
  cycle: BillingCycle;
  dueDay: number;                 // 1–28
  priority: number;               // 1 wird zuerst gedeckt
  category: 'essential' | 'tool' | 'comfort';
  activeFrom: YearMonth;
  activeUntil?: YearMonth;        // gekündigt zum
  projectId?: ID;                 // Tool-Abo eines Projekts → Projektmarge
}

// ── Modul 4: Schuldentilger ───────────────────────────────────────────
export type DebtStrategy = 'snowball' | 'avalanche';

export interface Debt extends BaseEntity {
  name: string;
  creditor?: string;
  originalAmount: Cents;
  balance: Cents;                 // ändert sich nur über DebtPayment oder Zinsbuchung
  aprBps: number;                 // Jahreszins in Basispunkten: 1250 = 12,5 %
  minPayment: Cents;              // monatliche Mindestrate
  status: 'open' | 'paid';
}

export interface DebtPayment extends BaseEntity {
  debtId: ID;
  amount: Cents;
  paidOn: ISODate;
  month: YearMonth;
  kind: 'minimum' | 'extra';
  monthCloseId?: ID;              // aus welchem Monatsabschluss
}

// ── Core: Einstellungen und Monatsabschluss ───────────────────────────
export type ModuleId = 'ideas' | 'income' | 'fixedCosts' | 'debts';

export interface EngineSettings {
  id: 'settings';                 // genau ein Datensatz
  currency: 'EUR';
  debtStrategy: DebtStrategy;
  buffer: Cents;                  // Rücklage pro Monat vor der Extra-Tilgung, 0 = aus
  enabledModules: ModuleId[];
}

export interface MonthClose extends BaseEntity {
  month: YearMonth;               // eindeutig
  result: WaterfallResult;        // eingefrorenes Ergebnis
}
