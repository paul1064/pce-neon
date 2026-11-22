import type { Cents } from './model';

const eurFormatter = new Intl.NumberFormat('de-AT', {
  style: 'currency',
  currency: 'EUR',
});

const plainFormatter = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Formatiert ganze Cent als Euro-Betrag im de-AT-Format. */
export function formatCents(cents: Cents): string {
  return eurFormatter.format(cents / 100);
}

/** Formatiert ganze Cent ohne Währungssymbol (z. B. "1.234,56"). */
export function formatCentsPlain(cents: Cents): string {
  return plainFormatter.format(cents / 100);
}

/** Wandelt ganze Cent in einen editierbaren Eingabestring (z. B. "12,99") um. */
export function centsToInput(cents: Cents): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * Parst eine Euro-Eingabe (z. B. "1.234,56", "12,99", "12.99", "1.800", "25")
 * in ganze Cent. Gibt null zurück bei ungültiger Eingabe.
 */
export function parseEuroToCents(raw: string): Cents | null {
  const cleaned = raw.replace(/[€\s\u00a0]/g, '').trim();
  if (!cleaned) return null;

  let normalized: string;
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    if (parts.length !== 2) return null;
    const [intPart, decPart] = parts;
    if (!/^-?\d{1,3}(\.\d{3})*$|^-?\d+$/.test(intPart)) return null;
    if (!/^\d{1,2}$/.test(decPart)) return null;
    normalized = `${intPart.replace(/\./g, '')}.${decPart}`;
  } else if (cleaned.includes('.')) {
    if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
      normalized = cleaned.replace(/\./g, '');
    } else if (/^-?\d+\.\d{1,2}$/.test(cleaned)) {
      normalized = cleaned;
    } else {
      return null;
    }
  } else if (/^-?\d+$/.test(cleaned)) {
    normalized = cleaned;
  } else {
    return null;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Formatiert Basispunkte (z. B. 1250) als Prozentsatz (z. B. "12,5 %"). */
export function formatBps(bps: number): string {
  return `${percentFormatter.format(bps / 100)} %`;
}

/** Parst einen Prozentsatz (z. B. "12,5" oder "12.5") in Basispunkte (1250). */
export function parsePercentToBps(raw: string): number | null {
  const cleaned = raw.replace(/[%\s\u00a0]/g, '').trim();
  if (!cleaned) return null;
  const normalized = cleaned.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 1000) return null;
  return Math.round(value * 100);
}
