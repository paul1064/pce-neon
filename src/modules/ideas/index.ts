import { lazy } from 'react';
import type { ModuleManifest } from '../../core';
import { IdeasDashboardCard } from './IdeasDashboardCard';

export const manifest: ModuleManifest = {
  id: 'ideas',
  title: 'Ideen',
  path: '/ideen',
  Page: lazy(() => import('./IdeasPage')),
  DashboardCard: IdeasDashboardCard,
};
