/** Server-side vault owner — used for API auth only, never shown in UI. */
export const VAULT_USERNAME =
  process.env.NEXT_PUBLIC_VAULT_USERNAME ?? 'Abhiraj';

/** Display name for WebAuthn / OS biometric prompts. */
export const APP_DISPLAY_NAME = 'Notes';
