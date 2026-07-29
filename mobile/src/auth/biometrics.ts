/**
 * Biometric unlock (FR-14.4).
 *
 * **This is a lock on the door, not the key.** What authenticates against the
 * API is the refresh token in the Keychain; a fingerprint only decides whether
 * this app will use it right now. Treating it as authentication would be a
 * mistake — biometrics can be unavailable, unenrolled, or fail repeatedly, and
 * a user locked out of their own assets because of a wet thumb is unacceptable
 * in a stock room. Hence: **the password fallback always works** (FR-14.4).
 */
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const ENABLED_KEY = "trasset.biometric";

export type BiometricKind = "face" | "fingerprint" | "iris" | "none";

/** What this handset actually offers, so the UI can name it correctly. */
export async function biometricKind(): Promise<BiometricKind> {
  try {
    if (!(await LocalAuthentication.hasHardwareAsync())) return "none";
    if (!(await LocalAuthentication.isEnrolledAsync())) return "none";

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return "face";
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return "fingerprint";
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return "iris";
    return "none";
  } catch {
    return "none";
  }
}

export function biometricLabel(kind: BiometricKind): string {
  switch (kind) {
    case "face":
      return "Face ID";
    case "fingerprint":
      return "fingerprint";
    case "iris":
      return "iris scan";
    default:
      return "biometrics";
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ENABLED_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) await SecureStore.setItemAsync(ENABLED_KEY, "1");
    else await SecureStore.deleteItemAsync(ENABLED_KEY);
  } catch {
    // Preference is a convenience; failing to store it must not block sign-in.
  }
}

/**
 * Prompt for the biometric. Returns false on cancel or failure — never throws,
 * because every caller's answer to a failure is the same: fall back.
 */
export async function promptBiometric(reason = "Unlock Trasset"): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      // The OS passcode is a legitimate fallback and keeps a user with a cut
      // finger out of a dead end.
      disableDeviceFallback: false,
      cancelLabel: "Use password",
    });
    return result.success;
  } catch {
    return false;
  }
}
