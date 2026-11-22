import { describe, expect, it } from 'vitest';
import {
  centsToInput,
  formatBps,
  formatCents,
  formatCentsPlain,
  parseEuroToCents,
  parsePercentToBps,
} from './money';

describe('money helpers', () => {
  it('formatiert ganze Cent mit de-AT Euro-Format', () => {
    const formatted = formatCents(123456);
    expect(formatted).toContain('1.234,56');
    expect(formatted).toContain('€');
    expect(formatCentsPlain(1299)).toBe('12,99');
    expect(centsToInput(1299)).toBe('12,99');
  });

  it('parst deutsche und internationale Euro-Eingaben in ganze Cent', () => {
    expect(parseEuroToCents('12,99')).toBe(1299);
    expect(parseEuroToCents('1.234,56 €')).toBe(123456);
    expect(parseEuroToCents('1.800')).toBe(180000);
    expect(parseEuroToCents('1.800,00')).toBe(180000);
    expect(parseEuroToCents('380')).toBe(38000);
    expect(parseEuroToCents('12.99')).toBe(1299);
    expect(parseEuroToCents('0')).toBe(0);
    expect(parseEuroToCents('')).toBeNull();
    expect(parseEuroToCents('abc')).toBeNull();
    expect(parseEuroToCents('12,999')).toBeNull();
  });

  it('parst und formatiert Basispunkte für Zinssätze', () => {
    expect(parsePercentToBps('12,5')).toBe(1250);
    expect(parsePercentToBps('12.5 %')).toBe(1250);
    expect(parsePercentToBps('6')).toBe(600);
    expect(parsePercentToBps('0')).toBe(0);
    expect(parsePercentToBps('-1')).toBeNull();
    expect(formatBps(1250)).toBe('12,5 %');
    expect(formatBps(600)).toBe('6 %');
    expect(formatBps(0)).toBe('0 %');
  });
});
