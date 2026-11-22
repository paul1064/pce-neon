import type { ComponentType, LazyExoticComponent } from 'react';
import type { ModuleId, YearMonth } from './model';

export interface ModuleManifest {
  id: ModuleId;
  title: string;
  path: string;
  Page: LazyExoticComponent<ComponentType>;
  DashboardCard?: ComponentType<{ month: YearMonth }>;
}
