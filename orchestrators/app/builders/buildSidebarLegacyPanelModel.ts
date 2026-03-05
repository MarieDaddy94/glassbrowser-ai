import type { AppSidebarLegacyPanelModel } from '../../../components/app/models';

export const buildSidebarLegacyPanelModel = <T extends AppSidebarLegacyPanelModel>(
  input: T
): AppSidebarLegacyPanelModel => ({
  ...input
});

