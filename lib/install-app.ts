export type InstallReason = 'manual' | 'share' | 'loan';

export const INSTALL_REQUEST_EVENT = 'estante-aberta:install-request';
export const APP_INSTALLED_EVENT = 'estante-aberta:app-installed';

export function requestAppInstall(reason: InstallReason = 'manual') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<InstallReason>(INSTALL_REQUEST_EVENT, { detail: reason }),
  );
}
