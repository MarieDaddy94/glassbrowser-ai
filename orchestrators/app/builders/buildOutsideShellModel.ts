import type { AppOutsideShellModel } from '../../../components/app/models';

export const buildOutsideShellModel = <T extends AppOutsideShellModel>(input: T): AppOutsideShellModel => ({
  ...input
});
