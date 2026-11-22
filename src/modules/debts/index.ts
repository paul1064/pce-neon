import { lazy } from 'react';
import type { ModuleManifest } from '../../core';
import { DebtsDashboardCard } from './DebtsDashboardCard';

export const manifest: ModuleManifest = {
  id: 'debts',
  title: 'Schulden',
  path: '/schulden',
  Page: lazy(() => import('./DebtsPage')),
  DashboardCard: DebtsDashboardCard,
};
