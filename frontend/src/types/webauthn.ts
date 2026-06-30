// ── PRF Extension types (not yet in lib.dom.d.ts in all TS versions) ──

export interface AuthenticationExtensionsPRFValues {
  first: ArrayBuffer;
  second?: ArrayBuffer;
}

export interface AuthenticationExtensionsPRFInputs {
  eval?: AuthenticationExtensionsPRFValues;
  evalByCredential?: Record<string, AuthenticationExtensionsPRFValues>;
}

export interface AuthenticationExtensionsPRFOutputs {
  enabled?: boolean;
  results?: {
    first?: ArrayBuffer;
    second?: ArrayBuffer;
  };
}

// Extend the standard PublicKeyCredentialRequestOptions to include PRF
export interface PublicKeyCredentialRequestOptionsPRF
  extends PublicKeyCredentialRequestOptions {
  extensions?: AuthenticationExtensionsClientInputs & {
    prf?: AuthenticationExtensionsPRFInputs;
  };
}

export interface PublicKeyCredentialCreationOptionsPRF
  extends PublicKeyCredentialCreationOptions {
  extensions?: AuthenticationExtensionsClientInputs & {
    prf?: AuthenticationExtensionsPRFInputs;
  };
}

// ── Stored biometric credential metadata ─────────────────────────

export interface StoredBiometricCredential {
  /** Base64url-encoded credential ID */
  credentialId: string;
  /** Base64url-encoded wrapped master password ciphertext */
  wrappedPassword: string;
  /** Base64url-encoded 12-byte AES-GCM IV used for wrapping */
  wrapIv: string;
}
