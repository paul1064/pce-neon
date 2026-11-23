import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { EngineDB, loadWaterfallInput, runWaterfall, type IncomeEntry, type IncomeSource } from '../../core';
import { createFixedCost } from './logic';
import { detectCsvDelimiter, importFixedCostsBatch, parseFixedCostsCsv } from './csvImport';

const createdDbs: EngineDB[] = [];

async function openTestDb(name: string): Promise<EngineDB> {
  const testDb = new EngineDB(`${name}-${crypto.randomUUID()}`, 4);
  await testDb.open();
  createdDbs.push(testDb);
  return testDb;
}

afterEach(async () => {
  while (createdDbs.length > 0) {
    const instance = createdDbs.pop();
    if (instance) {
      await instance.delete();
    }
  }
});

describe('Modul 3 · CSV-Abo-Import', () => {
  it('erkennt Trennzeichen (Semikolon, Komma, Tab) zuverlässig', () => {
    expect(detectCsvDelimiter('Name;Betrag;Zyklus\nTool A;12,99 €;monatlich')).toBe(';');
    expect(detectCsvDelimiter('Name,Betrag,Zyklus\nTool A,"12,99 €",monatlich')).toBe(',');
    expect(detectCsvDelimiter('Name\tBetrag\tZyklus\nTool A\t12,99 €\tmonatlich')).toBe('\t');
  });

  it('parst deutsche Semikolon-CSV mit Zyklen, Fälligkeit, Priorität und Kategorien', () => {
    const csv = [
      '\uFEFFName;Betrag;Zyklus;Fälligkeit;Priorität;Kategorie;Status',
      'Mobilfunk-Tarif;7,90 €;monatlich;7. des Monats;1;Wichtig;Aktiv',
      'Musik-Distribution;24,00 €;jährlich;15;2;Tool / Arbeit;Aktiv',
      'Cloud-Quartal;29,99 €;quartalsweise;3;3;Tool;Aktiv',
      'Altes Streaming;13,00 €;monatlich;6;4;Komfort;Gekündigt',
    ].join('\n');

    const preview = parseFixedCostsCsv(csv, '2026-11');

    expect(preview.error).toBeUndefined();
    expect(preview.delimiter).toBe(';');
    expect(preview.headerRowNumber).toBe(1);
    expect(preview.rows).toHaveLength(3);
    expect(preview.skipped).toHaveLength(1);
    expect(preview.skipped[0]?.rawName).toBe('Altes Streaming');

    expect(preview.rows[0]?.input).toMatchObject({
      name: 'Mobilfunk-Tarif',
      amount: 790,
      cycle: 'monthly',
      dueDay: 7,
      priority: 1,
      category: 'essential',
      activeFrom: '2026-11',
    });

    expect(preview.rows[1]?.input).toMatchObject({
      name: 'Musik-Distribution',
      amount: 2400,
      cycle: 'yearly',
      dueDay: 15,
      priority: 2,
      category: 'tool',
    });
    expect(preview.rows[1]?.monthlyCents).toBe(200);

    expect(preview.rows[2]?.input).toMatchObject({
      name: 'Cloud-Quartal',
      amount: 2999,
      cycle: 'quarterly',
      dueDay: 3,
      priority: 3,
    });
    expect(preview.rows[2]?.monthlyCents).toBe(1000);
  });

  it('parst mehrteilige Google-Sheets-Exporte mit KPI-Block, Summenzeile und Folgeabschnitt', () => {
    const csv = [
      ',Finanzübersicht,,,,,',
      ',MONATLICHE FIXKOSTEN,,FIXKOSTEN PRO JAHR,,,',
      ',"59,88 €",,"718,56 €",,,',
      ',1. Wiederkehrende Fixkosten & Abonnements,,,,,',
      ',Kategorie,Bezeichnung / Vertrag,Zahlungsintervall & Fälligkeit,Betrag (€ / Monat),Betrag (€ / Jahr),Status',
      ',Kommunikation,Daten-Tarif,1. des Monats,"19,90 €","238,80 €",Aktiv',
      ',Software & Abonnements,KI-Assistent,monatlich,"21,99 €","263,88 €",Aktiv',
      ',Software & Abonnements,Streaming-Paket,ca. 5. des Monats,"8,99 €","107,88 €",Aktiv',
      ',Versicherung,Unfallschutz,2. des Monats,"9,00 €","108,00 €",Aktiv',
      ',Gesamtsumme Fixkosten,,,"59,88 €","718,56 €",',
      ',2. Einzelausgaben,,,,,',
      ',Hardware,Festplatte,2026-11-17,"259,00 €",,Bezahlt',
    ].join('\n');

    const preview = parseFixedCostsCsv(csv, '2026-11');

    expect(preview.error).toBeUndefined();
    expect(preview.headerRowNumber).toBe(5);
    expect(preview.rows).toHaveLength(4);
    expect(preview.rows.map((r) => r.input.name)).toEqual([
      'Daten-Tarif',
      'KI-Assistent',
      'Streaming-Paket',
      'Unfallschutz',
    ]);
    expect(preview.rows.map((r) => r.input.amount)).toEqual([1990, 2199, 899, 900]);
    expect(preview.rows.map((r) => r.input.dueDay)).toEqual([1, 1, 5, 2]);
    expect(preview.rows[0]?.input.category).toBe('essential');
    expect(preview.rows[2]?.input.category).toBe('comfort');
    expect(preview.rows[3]?.input.category).toBe('essential');
  });

  it('erkennt Duplikate gegen bestehende Abos und speichert Batch atomar für den Wasserfall', async () => {
    const testDb = await openTestDb('fc-csv-import');
    await createFixedCost(
      {
        name: 'Hosting',
        amount: 2000,
        cycle: 'monthly',
        dueDay: 1,
        priority: 1,
        category: 'essential',
        activeFrom: '2026-11',
      },
      testDb,
      '2026-11-01',
    );

    const existing = await testDb.fixedCosts.toArray();
    const csv = [
      'Abo;Betrag;Zyklus',
      'Hosting;20,00 €;monatlich',
      'Design-Tool;12,99 €;monatlich',
      'Streaming;9,99 €;monatlich',
    ].join('\n');

    const preview = parseFixedCostsCsv(csv, '2026-11', existing);
    expect(preview.rows).toHaveLength(3);
    expect(preview.rows[0]?.isDuplicate).toBe(true);
    expect(preview.rows[1]?.isDuplicate).toBe(false);
    expect(preview.rows[2]?.isDuplicate).toBe(false);

    const nonDuplicates = preview.rows.filter((r) => !r.isDuplicate).map((r) => r.input);
    const created = await importFixedCostsBatch(nonDuplicates, testDb, '2026-11-23');
    expect(created).toHaveLength(2);

    // Einnahmen 620,00 € ergänzen -> klassisches Rechenbeispiel 577,02 € Überschuss
    const source: IncomeSource = {
      id: crypto.randomUUID(),
      createdAt: '2026-11-01',
      updatedAt: '2026-11-01',
      name: 'Shop',
      kind: 'microtask',
      inWaterfall: true,
    };
    await testDb.incomeSources.add(source);
    const entry: IncomeEntry = {
      id: crypto.randomUUID(),
      createdAt: '2026-11-01',
      updatedAt: '2026-11-01',
      sourceId: source.id,
      amount: 62000,
      receivedOn: '2026-11-01',
      month: '2026-11',
    };
    await testDb.incomeEntries.add(entry);

    const input = await loadWaterfallInput(testDb, '2026-11');
    const result = runWaterfall(input);
    expect(result.fixedCostsDue).toBe(4298);
    expect(result.surplus).toBe(57702);
  });

  it('liefert klare Fehlermeldung bei leerer oder unpassender CSV', () => {
    expect(parseFixedCostsCsv('   ', '2026-11').error).toBeDefined();
    expect(parseFixedCostsCsv('SpalteA;SpalteB\nFoo;Bar', '2026-11').error).toBeDefined();
  });
});
