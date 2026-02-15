import type { SessionConfig } from "./types.js";

export type HeaderRecord = Record<string, string | string[] | undefined>;

function cleanHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]?.trim() || undefined;
  return value?.trim() || undefined;
}

export function getHeader(headers: HeaderRecord | undefined, key: string): string | undefined {
  if (!headers) return undefined;
  return cleanHeaderValue(headers[key.toLowerCase()]);
}

export function extractSessionConfigFromHeaders(
  headers: HeaderRecord | undefined,
  env: NodeJS.ProcessEnv = process.env
): SessionConfig {
  // Header keys are case-insensitive; Node lowercases them in req.headers.
  // We intentionally accept only the new names.
  const swaggerApiJson = getHeader(headers, "OPENAPI_JSON") ?? env.OPENAPI_JSON;

  const redmineBaseUrl = getHeader(headers, "REDMINE_URL") ?? env.REDMINE_URL;

  const redmineApiKey = getHeader(headers, "REDMINE_API") ?? env.REDMINE_API;

  const redmineProjectId =
    getHeader(headers, "REDMINE_PROJECT") ?? env.REDMINE_PROJECT;

  return {
    swaggerApiJson,
    redmineBaseUrl,
    redmineApiKey,
    redmineProjectId,
  };
}

export function extractHeadersFromToolExtra(extra: unknown): HeaderRecord | undefined {
  return (extra as any)?.requestInfo?.headers as HeaderRecord | undefined;
}

export function extractSessionConfigFromToolExtra(
  extra: unknown,
  defaults: SessionConfig
): SessionConfig {
  const headers = extractHeadersFromToolExtra(extra);
  const fromHeaders = extractSessionConfigFromHeaders(headers);

  return {
    swaggerApiJson: fromHeaders.swaggerApiJson ?? defaults.swaggerApiJson,
    redmineBaseUrl: fromHeaders.redmineBaseUrl ?? defaults.redmineBaseUrl,
    redmineApiKey: fromHeaders.redmineApiKey ?? defaults.redmineApiKey,
    redmineProjectId: fromHeaders.redmineProjectId ?? defaults.redmineProjectId,
  };
}
