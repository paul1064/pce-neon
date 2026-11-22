import { lazy } from 'react';
import type { ModuleManifest } from '../../core';
import { FixedCostsDashboardCard } from './FixedCostsDashboardCard';

export const manifest: ModuleManifest = {
  id: 'fixedCosts',
  title: 'Abos',
  path: '/abos',
  Page: lazy(() => import('./FixedCostsPage')),
  DashboardCard: FixedCostsDashboardCard,
};
