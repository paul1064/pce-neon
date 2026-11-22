import type { ISODate, YearMonth } from './model';
import { nextMonth } from './waterfall';

/** Heutiges Datum als YYYY-MM-DD in lokaler Zeit. */
export function todayISO(now = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Aktueller Monat als YYYY-MM in lokaler Zeit. */
export function currentYearMonth(now = new Date()): YearMonth {
  return todayISO(now).slice(0, 7);
}

/** Leitet YYYY-MM aus einem ISO-Datum (YYYY-MM-DD) ab. */
export function toYearMonth(date: ISODate): YearMonth {
  return date.slice(0, 7);
}

/** Vorheriger Monat für YYYY-MM. */
export function prevMonth(ym: YearMonth): YearMonth {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Verschiebt einen Monat um delta Monate. */
export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  let current = ym;
  if (delta > 0) {
    for (let i = 0; i < delta; i += 1) current = nextMonth(current);
  } else if (delta < 0) {
    for (let i = 0; i < -delta; i += 1) current = prevMonth(current);
  }
  return current;
}

const monthLabelFormatter = new Intl.DateTimeFormat('de-AT', {
  month: 'long',
  year: 'numeric',
});

const dateLabelFormatter = new Intl.DateTimeFormat('de-AT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Formatiert YYYY-MM lesbar auf Deutsch, z. B. "November 2026". */
export function formatYearMonth(ym: YearMonth): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return monthLabelFormatter.format(new Date(y, m - 1, 1));
}

/** Formatiert YYYY-MM-DD lesbar auf Deutsch, z. B. "22.11.2026". */
export function formatISODate(iso: ISODate): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return dateLabelFormatter.format(new Date(y, m - 1, d));
}
