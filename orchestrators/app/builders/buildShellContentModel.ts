import type { AppShellContentModel } from '../../../components/app/models';

export type AppShellContentModelInput = Omit<AppShellContentModel, 'sidebarPanels'>;

export const buildShellContentModel = <T extends AppShellContentModelInput>(
  input: T
): AppShellContentModelInput => ({
  ...input,
  notifications: Array.isArray(input.notifications) ? input.notifications : [],
  tabs: Array.isArray(input.tabs) ? input.tabs : []
});
