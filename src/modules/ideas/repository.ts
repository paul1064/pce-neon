import {
  db,
  todayISO,
  type EngineDB,
  type ID,
  type Idea,
  type IdeaStatus,
  type Project,
  type ValidationCheck,
  type ValidationCriterion,
} from '../../core';
import {
  applyCheckUpdate,
  calculateIdeaScore,
  createIdeaInputSchema,
  createProjectInputSchema,
  deriveIdeaStatus,
  ideaStatusSchema,
  normalizeChecks,
  updateIdeaInputSchema,
  updateProjectInputSchema,
  validationCheckSchema,
  validationCriterionSchema,
  type CreateIdeaInput,
  type CreateProjectInput,
  type UpdateIdeaInput,
  type UpdateProjectInput,
} from './logic';

/** Legt eine neue Idee validiert in db.ideas an. */
export async function createIdea(
  rawInput: CreateIdeaInput,
  database: EngineDB = db,
): Promise<Idea> {
  const input = createIdeaInputSchema.parse(rawInput);
  const now = todayISO();
  const idea: Idea = {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description,
    tags: input.tags,
    status: 'inbox',
    checks: [],
    ...(input.estimate ? { estimate: input.estimate } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await database.ideas.add(idea);
  return idea;
}

/** Aktualisiert Titel, Beschreibung, Tags oder Schätzung einer Idee. */
export async function updateIdea(
  ideaId: ID,
  rawPatch: UpdateIdeaInput,
  database: EngineDB = db,
): Promise<Idea> {
  const patch = updateIdeaInputSchema.parse(rawPatch);
  const existing = await database.ideas.get(ideaId);
  if (!existing) {
    throw new Error('Idee wurde nicht gefunden.');
  }

  const nextEstimate =
    patch.estimate === undefined
      ? existing.estimate
      : patch.estimate === null
        ? undefined
        : patch.estimate;

  const updated: Idea = {
    ...existing,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
    updatedAt: todayISO(),
  };

  if (nextEstimate) {
    updated.estimate = nextEstimate;
  } else {
    delete updated.estimate;
  }

  await database.ideas.put(updated);
  return updated;
}

/** Speichert oder aktualisiert eine Kriterien-Bewertung und berechnet Score & Status neu. */
export async function upsertIdeaCheck(
  ideaId: ID,
  rawCheck: ValidationCheck,
  database: EngineDB = db,
): Promise<Idea> {
  const check = validationCheckSchema.parse(rawCheck);
  const existing = await database.ideas.get(ideaId);
  if (!existing) {
    throw new Error('Idee wurde nicht gefunden.');
  }

  const checks = applyCheckUpdate(existing.checks, check);
  const score = calculateIdeaScore(checks);
  const status = deriveIdeaStatus(existing.status, checks);

  const updated: Idea = {
    ...existing,
    checks,
    status,
    updatedAt: todayISO(),
  };

  if (score !== undefined) {
    updated.score = score;
  } else {
    delete updated.score;
  }

  await database.ideas.put(updated);
  return updated;
}

/** Entfernt eine einzelne Kriterien-Bewertung und berechnet Score & Status neu. */
export async function removeIdeaCheck(
  ideaId: ID,
  rawCriterion: ValidationCriterion,
  database: EngineDB = db,
): Promise<Idea> {
  const criterion = validationCriterionSchema.parse(rawCriterion);
  const existing = await database.ideas.get(ideaId);
  if (!existing) {
    throw new Error('Idee wurde nicht gefunden.');
  }

  const checks = normalizeChecks(existing.checks.filter((c) => c.criterion !== criterion));
  const score = calculateIdeaScore(checks);
  const status = deriveIdeaStatus(existing.status, checks);

  const updated: Idea = {
    ...existing,
    checks,
    status,
    updatedAt: todayISO(),
  };

  if (score !== undefined) {
    updated.score = score;
  } else {
    delete updated.score;
  }

  await database.ideas.put(updated);
  return updated;
}

/** Ändert den Status einer Idee (z. B. manuell validieren, verwerfen, wieder öffnen). */
export async function setIdeaStatus(
  ideaId: ID,
  rawStatus: IdeaStatus,
  database: EngineDB = db,
): Promise<Idea> {
  const nextStatus = ideaStatusSchema.parse(rawStatus);
  if (nextStatus === 'promoted') {
    throw new Error('Zum Befördern bitte promoteIdeaToProject verwenden.');
  }
  const existing = await database.ideas.get(ideaId);
  if (!existing) {
    throw new Error('Idee wurde nicht gefunden.');
  }
  if (existing.status === 'promoted' || existing.projectId) {
    throw new Error('Bereits beförderte Ideen können ihren Status nicht mehr ändern.');
  }

  const updated: Idea = {
    ...existing,
    status: nextStatus,
    updatedAt: todayISO(),
  };
  await database.ideas.put(updated);
  return updated;
}

/** Archiviert oder reaktiviert eine Idee (archivedAt statt Löschen). */
export async function setIdeaArchived(
  ideaId: ID,
  archived: boolean,
  database: EngineDB = db,
): Promise<Idea> {
  const existing = await database.ideas.get(ideaId);
  if (!existing) {
    throw new Error('Idee wurde nicht gefunden.');
  }
  const now = todayISO();
  const updated: Idea = {
    ...existing,
    updatedAt: now,
  };
  if (archived) {
    updated.archivedAt = now;
  } else {
    delete updated.archivedAt;
  }
  await database.ideas.put(updated);
  return updated;
}

/**
 * Befördert eine validierte Idee in einer atomaren Dexie-Transaktion zum Projekt.
 * Legt ein neues Project an und aktualisiert die Idee mit projectId und status = 'promoted'.
 */
export async function promoteIdeaToProject(
  ideaId: ID,
  database: EngineDB = db,
): Promise<{ idea: Idea; project: Project }> {
  return database.transaction('rw', database.ideas, database.projects, async () => {
    const existing = await database.ideas.get(ideaId);
    if (!existing) {
      throw new Error('Idee wurde nicht gefunden.');
    }
    if (existing.archivedAt) {
      throw new Error('Archivierte Ideen können nicht befördert werden.');
    }
    if (existing.status === 'promoted' || existing.projectId) {
      throw new Error('Diese Idee wurde bereits zum Projekt gemacht.');
    }
    if (existing.status !== 'validated') {
      throw new Error('Nur validierte Ideen können zum Projekt gemacht werden.');
    }

    const now = todayISO();
    const project: Project = {
      id: crypto.randomUUID(),
      name: existing.title,
      status: 'active',
      ideaId: existing.id,
      ...(existing.estimate ? { monthlyTarget: existing.estimate.monthlyRevenue } : {}),
      createdAt: now,
      updatedAt: now,
    };

    const updatedIdea: Idea = {
      ...existing,
      status: 'promoted',
      projectId: project.id,
      updatedAt: now,
    };

    await database.projects.add(project);
    await database.ideas.put(updatedIdea);

    return { idea: updatedIdea, project };
  });
}

/** Legt ein eigenständiges Projekt direkt ohne Idee in db.projects an. */
export async function createProject(
  rawInput: CreateProjectInput,
  database: EngineDB = db,
): Promise<Project> {
  const input = createProjectInputSchema.parse(rawInput);
  const now = todayISO();
  const project: Project = {
    id: crypto.randomUUID(),
    name: input.name,
    status: 'active',
    ...(input.monthlyTarget !== undefined ? { monthlyTarget: input.monthlyTarget } : {}),
    ...(input.nextStep && input.nextStep.length > 0 ? { nextStep: input.nextStep } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await database.projects.add(project);
  return project;
}

/** Aktualisiert Name, Status, Monatsziel oder nächsten Schritt eines Projekts. */
export async function updateProject(
  projectId: ID,
  rawPatch: UpdateProjectInput,
  database: EngineDB = db,
): Promise<Project> {
  const patch = updateProjectInputSchema.parse(rawPatch);
  const existing = await database.projects.get(projectId);
  if (!existing) {
    throw new Error('Projekt wurde nicht gefunden.');
  }

  const updated: Project = {
    ...existing,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    updatedAt: todayISO(),
  };

  if (patch.monthlyTarget === null) {
    delete updated.monthlyTarget;
  } else if (patch.monthlyTarget !== undefined) {
    updated.monthlyTarget = patch.monthlyTarget;
  }

  if (patch.nextStep === null || patch.nextStep === '') {
    delete updated.nextStep;
  } else if (patch.nextStep !== undefined) {
    updated.nextStep = patch.nextStep;
  }

  await database.projects.put(updated);
  return updated;
}

/** Archiviert oder reaktiviert ein Projekt (archivedAt statt Löschen). */
export async function setProjectArchived(
  projectId: ID,
  archived: boolean,
  database: EngineDB = db,
): Promise<Project> {
  const existing = await database.projects.get(projectId);
  if (!existing) {
    throw new Error('Projekt wurde nicht gefunden.');
  }
  const now = todayISO();
  const updated: Project = {
    ...existing,
    updatedAt: now,
  };
  if (archived) {
    updated.archivedAt = now;
  } else {
    delete updated.archivedAt;
  }
  await database.projects.put(updated);
  return updated;
}
