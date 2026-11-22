import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { EngineDB, type IncomeEntry, type IncomeSource, type Project, type ValidationCheck } from '../../core';
import {
  IDEA_STATUS_LABELS,
  VALIDATION_CRITERIA,
  calculateIdeaScore,
  computeProjectMetrics,
  createIdeaInputSchema,
  deriveIdeaStatus,
  parseTagsInput,
} from './logic';
import {
  createIdea,
  createProject,
  promoteIdeaToProject,
  removeIdeaCheck,
  setIdeaArchived,
  setIdeaStatus,
  setProjectArchived,
  updateIdea,
  updateProject,
  upsertIdeaCheck,
} from './repository';

const openDbs: EngineDB[] = [];

function createTestDB(): EngineDB {
  const testDb = new EngineDB(`ideas-test-${crypto.randomUUID()}`, 4);
  openDbs.push(testDb);
  return testDb;
}

afterEach(async () => {
  while (openDbs.length > 0) {
    const instance = openDbs.pop();
    if (instance) {
      instance.close();
      await instance.delete();
    }
  }
});

describe('Ideen-Score und Validierungsregeln', () => {
  it('definiert genau 5 Kriterien mit deutschen Bezeichnungen', () => {
    expect(VALIDATION_CRITERIA.map((c) => c.key)).toEqual([
      'demand',
      'effort',
      'timeToFirstEuro',
      'startupCost',
      'energy',
    ]);
    expect(IDEA_STATUS_LABELS.validated).toBe('Validiert');
    expect(IDEA_STATUS_LABELS.promoted).toBe('Befördert');
  });

  it('berechnet undefined bei leeren Checks', () => {
    expect(calculateIdeaScore([])).toBeUndefined();
    expect(deriveIdeaStatus('inbox', [])).toBe('inbox');
  });

  it('Abnahmefall: alle 5 Kriterien mit 4 bewerten -> Score 75, Status validated', () => {
    const checks: ValidationCheck[] = [
      { criterion: 'demand', rating: 4 },
      { criterion: 'effort', rating: 4 },
      { criterion: 'timeToFirstEuro', rating: 4 },
      { criterion: 'startupCost', rating: 4 },
      { criterion: 'energy', rating: 4 },
    ];
    expect(calculateIdeaScore(checks)).toBe(75);
    expect(deriveIdeaStatus('inbox', checks)).toBe('validated');
  });

  it('berechnet Randwerte korrekt (1 -> 0, 3 -> 50, 5 -> 100)', () => {
    const makeAll = (rating: 1 | 2 | 3 | 4 | 5): ValidationCheck[] =>
      VALIDATION_CRITERIA.map((c) => ({ criterion: c.key, rating }));

    expect(calculateIdeaScore(makeAll(1))).toBe(0);
    expect(calculateIdeaScore(makeAll(3))).toBe(50);
    expect(calculateIdeaScore(makeAll(5))).toBe(100);
  });

  it('validiert exakt ab 60 Punkten bei 5 Kriterien und hält darunter Status validating', () => {
    // 3, 3, 3, 4, 4 -> avg 3.4 -> ((3.4 - 1) / 4) * 100 = 60
    const exact60: ValidationCheck[] = [
      { criterion: 'demand', rating: 3 },
      { criterion: 'effort', rating: 3 },
      { criterion: 'timeToFirstEuro', rating: 3 },
      { criterion: 'startupCost', rating: 4 },
      { criterion: 'energy', rating: 4 },
    ];
    expect(calculateIdeaScore(exact60)).toBe(60);
    expect(deriveIdeaStatus('validating', exact60)).toBe('validated');

    // 3, 3, 3, 3, 4 -> avg 3.2 -> ((3.2 - 1) / 4) * 100 = 55
    const below60: ValidationCheck[] = [
      { criterion: 'demand', rating: 3 },
      { criterion: 'effort', rating: 3 },
      { criterion: 'timeToFirstEuro', rating: 3 },
      { criterion: 'startupCost', rating: 3 },
      { criterion: 'energy', rating: 4 },
    ];
    expect(calculateIdeaScore(below60)).toBe(55);
    expect(deriveIdeaStatus('validated', below60)).toBe('validating');
  });

  it('setzt bei 1–4 Kriterien trotz hohem Score nur Status validating', () => {
    const fourOfFive: ValidationCheck[] = [
      { criterion: 'demand', rating: 5 },
      { criterion: 'effort', rating: 5 },
      { criterion: 'timeToFirstEuro', rating: 5 },
      { criterion: 'startupCost', rating: 5 },
    ];
    expect(calculateIdeaScore(fourOfFive)).toBe(100);
    expect(deriveIdeaStatus('inbox', fourOfFive)).toBe('validating');
    expect(deriveIdeaStatus('validated', fourOfFive)).toBe('validating');
  });

  it('überschreibt promoted oder rejected nicht automatisch', () => {
    const checks: ValidationCheck[] = VALIDATION_CRITERIA.map((c) => ({
      criterion: c.key,
      rating: 4,
    }));
    expect(deriveIdeaStatus('promoted', checks)).toBe('promoted');
    expect(deriveIdeaStatus('rejected', checks)).toBe('rejected');
  });

  it('parst und dedupliziert Tags sauber und prüft Zod-Eingaben', () => {
    expect(parseTagsInput(' digital, Shop, digital , , lokal ')).toEqual([
      'digital',
      'Shop',
      'lokal',
    ]);
    expect(createIdeaInputSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(
      createIdeaInputSchema.safeParse({
        title: 'Gültig',
        estimate: { setupHours: -1, monthlyRevenue: 1000, monthlyCost: 0 },
      }).success,
    ).toBe(false);
  });
});

describe('Projekt-Monatsmetriken (Soll gegen Ist)', () => {
  it('summiert Einnahmen aus verknüpften IncomeSources gegen monthlyTarget', () => {
    const base = { createdAt: '2026-11-01', updatedAt: '2026-11-01' };
    const projects: Project[] = [
      { ...base, id: 'p1', name: 'Testidee', status: 'active', monthlyTarget: 50000 },
      { ...base, id: 'p2', name: 'Ohne Ziel', status: 'active' },
    ];
    const sources: IncomeSource[] = [
      { ...base, id: 's1', name: 'Shop', kind: 'project', projectId: 'p1', inWaterfall: true },
      { ...base, id: 's2', name: 'Umfragen', kind: 'microtask', inWaterfall: true },
    ];
    const entries: IncomeEntry[] = [
      { ...base, id: 'e1', sourceId: 's1', amount: 38000, receivedOn: '2026-11-10', month: '2026-11' },
      { ...base, id: 'e2', sourceId: 's2', amount: 24000, receivedOn: '2026-11-11', month: '2026-11' },
      {
        ...base,
        id: 'e3',
        sourceId: 's1',
        amount: 5000,
        receivedOn: '2026-11-12',
        month: '2026-11',
        archivedAt: '2026-11-13',
      },
    ];

    const metrics = computeProjectMetrics(projects, sources, entries);
    const m1 = metrics.get('p1');
    expect(m1).toBeDefined();
    expect(m1?.actualIncome).toBe(38000);
    expect(m1?.progressPercent).toBe(76);
    expect(m1?.clampedPercent).toBe(76);
    expect(m1?.remainingToTarget).toBe(12000);
    expect(m1?.sourceCount).toBe(1);

    const m2 = metrics.get('p2');
    expect(m2?.actualIncome).toBe(0);
    expect(m2?.progressPercent).toBeNull();
  });
});

describe('Datenbank-Operationen (IndexedDB)', () => {
  it('erfasst Idee, bewertet 5 Kriterien mit 4 (-> Score 75, Validiert) und befördert atomar zum Projekt', async () => {
    const testDb = createTestDB();
    await testDb.open();

    const idea = await createIdea(
      {
        title: 'Testidee',
        description: 'Digitale Vorlagen',
        tags: ['digital'],
        estimate: { setupHours: 12, monthlyRevenue: 40000, monthlyCost: 1500 },
      },
      testDb,
    );
    expect(idea.status).toBe('inbox');
    expect(idea.score).toBeUndefined();

    // Erste 4 Kriterien bewerten -> noch in Prüfung
    for (const key of ['demand', 'effort', 'timeToFirstEuro', 'startupCost'] as const) {
      const updated = await upsertIdeaCheck(idea.id, { criterion: key, rating: 4 }, testDb);
      expect(updated.status).toBe('validating');
      expect(updated.score).toBe(75);
    }

    // 5. Kriterium bewerten -> automatisch validiert
    const validated = await upsertIdeaCheck(
      idea.id,
      { criterion: 'energy', rating: 4, note: 'Macht Spaß' },
      testDb,
    );
    expect(validated.score).toBe(75);
    expect(validated.status).toBe('validated');
    expect(validated.checks).toHaveLength(5);

    // Zum Projekt machen (atomare Transaktion)
    const { idea: promotedIdea, project } = await promoteIdeaToProject(idea.id, testDb);
    expect(project.name).toBe('Testidee');
    expect(project.status).toBe('active');
    expect(project.ideaId).toBe(idea.id);
    expect(project.monthlyTarget).toBe(40000);

    expect(promotedIdea.status).toBe('promoted');
    expect(promotedIdea.projectId).toBe(project.id);

    // Persistenz prüfen
    const storedIdea = await testDb.ideas.get(idea.id);
    const storedProject = await testDb.projects.get(project.id);
    expect(storedIdea?.status).toBe('promoted');
    expect(storedIdea?.projectId).toBe(project.id);
    expect(storedProject?.name).toBe('Testidee');

    // Doppeltes Befördern wird verhindert
    await expect(promoteIdeaToProject(idea.id, testDb)).rejects.toThrow();
  });

  it('erlaubt manuelle Validierung und anschließendes Befördern, blockiert aber unvalidierte Ideen', async () => {
    const testDb = createTestDB();
    await testDb.open();

    const idea = await createIdea({ title: 'Schnellstart-Idee' }, testDb);
    await expect(promoteIdeaToProject(idea.id, testDb)).rejects.toThrow();

    const manuallyValidated = await setIdeaStatus(idea.id, 'validated', testDb);
    expect(manuallyValidated.status).toBe('validated');

    const { idea: promoted, project } = await promoteIdeaToProject(idea.id, testDb);
    expect(promoted.status).toBe('promoted');
    expect(project.ideaId).toBe(idea.id);
    expect(project.monthlyTarget).toBeUndefined();
  });

  it('unterstützt Bearbeiten, Entfernen von Checks und Archivieren von Ideen', async () => {
    const testDb = createTestDB();
    await testDb.open();

    const idea = await createIdea({ title: 'Alt' }, testDb);
    const edited = await updateIdea(
      idea.id,
      { title: 'Neu', description: 'Details', tags: ['a', 'b'] },
      testDb,
    );
    expect(edited.title).toBe('Neu');
    expect(edited.tags).toEqual(['a', 'b']);

    await upsertIdeaCheck(idea.id, { criterion: 'demand', rating: 5 }, testDb);
    const afterRemove = await removeIdeaCheck(idea.id, 'demand', testDb);
    expect(afterRemove.checks).toHaveLength(0);
    expect(afterRemove.score).toBeUndefined();
    expect(afterRemove.status).toBe('inbox');

    const archived = await setIdeaArchived(idea.id, true, testDb);
    expect(archived.archivedAt).toBeDefined();
    const restored = await setIdeaArchived(idea.id, false, testDb);
    expect(restored.archivedAt).toBeUndefined();
  });

  it('legt eigenständige Projekte an, bearbeitet und archiviert sie', async () => {
    const testDb = createTestDB();
    await testDb.open();

    const project = await createProject(
      {
        name: 'Eigenes Projekt',
        monthlyTarget: 25000,
        nextStep: 'Landingpage bauen',
      },
      testDb,
    );
    expect(project.ideaId).toBeUndefined();
    expect(project.status).toBe('active');
    expect(project.monthlyTarget).toBe(25000);

    const updated = await updateProject(
      project.id,
      {
        status: 'paused',
        monthlyTarget: null,
        nextStep: 'Kunden fragen',
      },
      testDb,
    );
    expect(updated.status).toBe('paused');
    expect(updated.monthlyTarget).toBeUndefined();
    expect(updated.nextStep).toBe('Kunden fragen');

    const archived = await setProjectArchived(project.id, true, testDb);
    expect(archived.archivedAt).toBeDefined();
    const unarchived = await setProjectArchived(project.id, false, testDb);
    expect(unarchived.archivedAt).toBeUndefined();
  });
});
