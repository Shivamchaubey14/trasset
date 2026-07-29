/**
 * Runtime configuration for the API layer.
 *
 * Deliberately not read from `expo-constants` here. Keeping the request layer
 * free of platform imports means it can be exercised against the real server
 * without a device or a simulator — which is how the refresh-and-replay
 * behaviour below actually got verified rather than assumed.
 *
 * `App.tsx` supplies the real values at startup from `@/config/env`.
 */
export interface ApiConfig {
  baseUrl: string;
  /** Sent as `X-Client`; "mobile" earns the 30-day refresh (BE-1). */
  client: string;
}

let config: ApiConfig = {
  baseUrl: "",
  client: "mobile",
};

export function configureApi(next: Partial<ApiConfig>) {
  config = { ...config, ...next };
}

export function apiConfig(): ApiConfig {
  if (!config.baseUrl) {
    throw new Error("API base URL not configured — call configureApi() at startup.");
  }
  return config;
}
