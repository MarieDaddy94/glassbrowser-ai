import type {
  AppOutsideShellModel,
  AppShellContentModel,
  AppSidebarPanelsModel
} from '../../../components/app/models';

export interface AppOrchestratorDepsModel {
  shell: Omit<AppShellContentModel, 'sidebarPanels'>;
  sidebarPanels: AppSidebarPanelsModel;
  outsideShell: AppOutsideShellModel;
}

export const buildAppOrchestratorDeps = <T extends AppOrchestratorDepsModel>(
  input: T
): AppOrchestratorDepsModel => ({
  ...input
});

