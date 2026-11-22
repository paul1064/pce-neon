import type { ModuleManifest } from '../core';
import { manifest as debtsManifest } from '../modules/debts';
import { manifest as fixedCostsManifest } from '../modules/fixed-costs';
import { manifest as ideasManifest } from '../modules/ideas';
import { manifest as incomeManifest } from '../modules/income';

export const modules: ModuleManifest[] = [
  ideasManifest,
  incomeManifest,
  fixedCostsManifest,
  debtsManifest,
];
