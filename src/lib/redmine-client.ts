import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";

import type {
  RedmineIssue,
  RedmineIssueResponse,
  RedmineAttachment,
  RedmineCustomField,
} from "./types.js";

const DEFAULT_REDMINE_IMAGE_CACHE_DIR = "/tmp/remake-mcp/redmine-images";

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function normalizeProjectValue(value: string): string {
  return value.trim().toLowerCase();
}

export function ensureIssueProjectScope(
  issue: RedmineIssue,
  configuredProject: string
) {
  const normalized = normalizeProjectValue(configuredProject);
  if (!normalized) return;

  const projectName = issue.project?.name?.trim();
  const matchesByName =
    projectName && normalizeProjectValue(projectName) === normalized;

  if (!matchesByName) {
    throw new Error(
      `Issue project mismatch. Expected ${configuredProject}, got ${projectName ?? "unknown"}`
    );
  }
}

export function getCustomFieldValue(
  fields: RedmineCustomField[] | undefined,
  fieldName: string
): string | null {
  if (!fields || fields.length === 0) return null;
  const match = fields.find(
    (field) =>
      field.name.trim().toLowerCase() === fieldName.trim().toLowerCase()
  );
  if (!match || match.value === null || match.value === undefined) {
    return null;
  }
  if (Array.isArray(match.value)) {
    return match.value.join(", ").trim() || null;
  }
  const value = match.value.trim();
  return value.length > 0 ? value : null;
}

export function extractDescriptionImageHints(description: string): {
  attachmentIds: Set<number>;
  filenames: Set<string>;
  unresolvedRefs: string[];
} {
  const attachmentIds = new Set<number>();
  const filenames = new Set<string>();
  const unresolvedRefs: string[] = [];

  const htmlImgRegex = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of description.matchAll(htmlImgRegex)) {
    const src = match[1]?.trim();
    if (!src) continue;
    const attachmentMatch = src.match(
      /\/attachments\/(?:download\/)?(\d+)(?:\/([^/?#]+))?/i
    );
    if (attachmentMatch) {
      const id = Number(attachmentMatch[1]);
      if (!Number.isNaN(id)) {
        attachmentIds.add(id);
      }
      const filename = attachmentMatch[2];
      if (filename) {
        try {
          filenames.add(decodeURIComponent(filename));
        } catch {
          filenames.add(filename);
        }
      }
      continue;
    }
    unresolvedRefs.push(src);
  }

  const textileRegex = /!([^!\n\r]+)!/g;
  for (const match of description.matchAll(textileRegex)) {
    let token = match[1]?.trim();
    if (!token) continue;
    token = token.replace(/^\{[^}]*\}/, "").trim();
    if (!token) continue;
    const tokenWithoutQuery = token.split(/[?#]/)[0];
    const filename = path.posix.basename(tokenWithoutQuery);
    if (filename) {
      filenames.add(filename);
    } else {
      unresolvedRefs.push(token);
    }
  }

  return { attachmentIds, filenames, unresolvedRefs };
}

export function matchDescriptionAttachments(
  attachments: RedmineAttachment[] | undefined,
  hints: ReturnType<typeof extractDescriptionImageHints>
): { matched: RedmineAttachment[]; unresolved: string[] } {
  if (!attachments || attachments.length === 0) {
    return { matched: [], unresolved: hints.unresolvedRefs };
  }

  const byId = new Map<number, RedmineAttachment>();
  const byFilename = new Map<string, RedmineAttachment>();
  for (const attachment of attachments) {
    byId.set(attachment.id, attachment);
    byFilename.set(attachment.filename.trim().toLowerCase(), attachment);
  }

  const matched = new Map<number, RedmineAttachment>();
  const unresolved = [...hints.unresolvedRefs];

  for (const id of hints.attachmentIds) {
    const attachment = byId.get(id);
    if (attachment) {
      matched.set(attachment.id, attachment);
    } else {
      unresolved.push(`attachment_id:${id}`);
    }
  }

  for (const filename of hints.filenames) {
    const attachment = byFilename.get(filename.trim().toLowerCase());
    if (!attachment) {
      unresolved.push(filename);
      continue;
    }
    matched.set(attachment.id, attachment);
  }

  return { matched: Array.from(matched.values()), unresolved };
}

function sanitizeAttachmentFilename(filename: string): string {
  const basename = path.basename(filename || "").replace(/\0/g, "").trim();
  const safe = basename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe || "attachment";
}

export function resolveRedmineImageCacheDir(configuredDir?: string): string {
  const raw = configuredDir?.trim();
  if (!raw) {
    return DEFAULT_REDMINE_IMAGE_CACHE_DIR;
  }
  return path.resolve(raw);
}

export interface CachedAttachmentResult {
  localPath: string;
  cached: boolean;
}

export async function cacheRedmineAttachmentLocally(
  attachment: RedmineAttachment,
  apiKey: string,
  cacheRootDir: string,
  issueId: number
): Promise<CachedAttachmentResult> {
  const issueDir = path.resolve(cacheRootDir, `issue-${issueId}`);
  await mkdir(issueDir, { recursive: true });

  const localFilename = `${attachment.id}_${sanitizeAttachmentFilename(attachment.filename)}`;
  const localPath = path.resolve(issueDir, localFilename);

  try {
    const existing = await stat(localPath);
    if (existing.isFile() && existing.size === attachment.filesize) {
      return { localPath, cached: true };
    }
  } catch {
    // Cache miss: continue and fetch attachment from Redmine.
  }

  const response = await fetch(attachment.content_url, {
    headers: {
      "X-Redmine-API-Key": apiKey,
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch attachment ${attachment.filename}: HTTP ${response.status}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);
  const tempPath = `${localPath}.tmp-${process.pid}-${randomUUID()}`;

  try {
    await writeFile(tempPath, fileBuffer);
    await rename(tempPath, localPath);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // Best-effort cleanup for temporary files.
    }
    throw error;
  }

  return { localPath, cached: false };
}

export async function fetchRedmineIssue(
  baseUrl: string,
  apiKey: string,
  issueId: string
): Promise<RedmineIssue> {
  const response = await fetch(
    `${baseUrl}/issues/${encodeURIComponent(issueId)}.json?include=attachments`,
    {
      headers: {
        "X-Redmine-API-Key": apiKey,
      },
    }
  );

  if (response.status === 401 || response.status === 403) {
    throw new Error("Unauthorized or insufficient permissions.");
  }
  if (response.status === 404) {
    throw new Error("Issue not found.");
  }
  if (!response.ok) {
    throw new Error(`Redmine API error: HTTP ${response.status}`);
  }

  const data = (await response.json()) as RedmineIssueResponse;
  if (!data.issue) {
    throw new Error("Malformed Redmine response: missing issue.");
  }

  return data.issue;
}
