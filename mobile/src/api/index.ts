/**
 * Public surface of the API layer.
 *
 * Screens import from `@/api` and never reach into these modules directly, so
 * the transport can change without touching a screen.
 */
export { api, login, logout, restoreSession, setSessionExpiredHandler } from "./client";
export type { QueryParams, RequestOptions } from "./client";
export { apiConfig, configureApi } from "./config";
export type { ApiConfig } from "./config";
export { ApiError, SessionExpiredError } from "./errors";
export type { FieldErrors } from "./errors";
export { createQueryClient } from "./queryClient";
export { configureTokenStore, tokens } from "./tokens";
export type { SecureStore } from "./tokens";
export * from "./types";
