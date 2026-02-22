export interface Config {
  openApiJson?: string;
  redmineBaseUrl?: string;
  redmineApiKey?: string;
  redmineProjectId?: string;
  redmineImageCacheDir?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    openApiJson: env.OPENAPI_JSON,
    redmineBaseUrl: env.REDMINE_URL,
    redmineApiKey: env.REDMINE_API,
    redmineProjectId: env.REDMINE_PROJECT,
    redmineImageCacheDir: env.REDMINE_IMAGE_CACHE_DIR,
  };
}
