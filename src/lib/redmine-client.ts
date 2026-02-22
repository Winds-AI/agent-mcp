import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import sharp from "sharp";

import type {
  RedmineIssue,
  RedmineIssueResponse,
  RedmineAttachment,
  RedmineCustomField,
  RedmineJournalDetail,
} from "./types.js";

const DEFAULT_REDMINE_IMAGE_CACHE_DIR = "/tmp/remake-mcp/redmine-images";
const IMAGE_COMPRESSION_THRESHOLD_BYTES = 2 * 1024 * 1024; // 2 MB
const COMPRESSIBLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

async function compressImageBuffer(
  buffer: Buffer,
  contentType: string
): Promise<Buffer> {
  const type = contentType.toLowerCase();
  if (type.includes("jpeg") || type.includes("jpg")) {
    return sharp(buffer).jpeg({ quality: 75 }).toBuffer();
  }
  if (type.includes("png")) {
    return sharp(buffer).png({ compressionLevel: 9 }).toBuffer();
  }
  if (type.includes("webp")) {
    return sharp(buffer).webp({ quality: 75 }).toBuffer();
  }
  return buffer;
}

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
    if (existing.isFile()) {
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
  // eslint-disable-next-line prefer-const
  let fileBuffer: Buffer<ArrayBufferLike> = Buffer.from(arrayBuffer);

  const contentType = attachment.content_type ?? "";
  if (
    fileBuffer.byteLength > IMAGE_COMPRESSION_THRESHOLD_BYTES &&
    COMPRESSIBLE_IMAGE_TYPES.has(contentType.toLowerCase())
  ) {
    fileBuffer = await compressImageBuffer(fileBuffer, contentType);
  }

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

const ATTR_LABELS: Record<string, string> = {
  status_id: "Status",
  assigned_to_id: "Assignee",
  tracker_id: "Tracker",
  priority_id: "Priority",
  subject: "Subject",
  description: "Description",
  done_ratio: "% Done",
  estimated_hours: "Estimated hours",
  start_date: "Start date",
  due_date: "Due date",
  category_id: "Category",
  fixed_version_id: "Target version",
  parent_id: "Parent task",
  is_private: "Private",
};

export async function fetchIdNameMap(
  url: string,
  apiKey: string,
  responseKey: string
): Promise<Map<string, string>> {
  try {
    const response = await fetch(url, {
      headers: { "X-Redmine-API-Key": apiKey },
    });
    if (!response.ok) return new Map();
    const data = (await response.json()) as Record<
      string,
      Array<{ id: number; name: string }>
    >;
    const items = data[responseKey];
    if (!Array.isArray(items)) return new Map();
    return new Map(items.map((item) => [String(item.id), item.name]));
  } catch {
    return new Map();
  }
}

export function resolveDetailDisplay(
  detail: RedmineJournalDetail,
  lookups: {
    statuses: Map<string, string>;
    trackers: Map<string, string>;
    priorities: Map<string, string>;
    users: Map<string, string>;
  }
): string {
  if (detail.property === "attachment") {
    return detail.new_value ? `File ${detail.new_value} added` : `File removed`;
  }

  if (detail.property === "attr") {
    const label = ATTR_LABELS[detail.name] ?? detail.name;

    const resolve = (val: string | null): string | null => {
      if (val === null) return null;
      if (detail.name === "status_id") return lookups.statuses.get(val) ?? val;
      if (detail.name === "assigned_to_id") return lookups.users.get(val) ?? val;
      if (detail.name === "tracker_id") return lookups.trackers.get(val) ?? val;
      if (detail.name === "priority_id") return lookups.priorities.get(val) ?? val;
      return val;
    };

    const oldResolved = resolve(detail.old_value);
    const newResolved = resolve(detail.new_value);

    if (oldResolved === null) return `${label} set to ${newResolved}`;
    if (newResolved === null) return `${label} cleared (was ${oldResolved})`;
    return `${label} changed from ${oldResolved} to ${newResolved}`;
  }

  return `${detail.property} ${detail.name}: ${detail.old_value ?? "—"} → ${detail.new_value ?? "—"}`;
}

export async function fetchRedmineIssue(
  baseUrl: string,
  apiKey: string,
  issueId: string
): Promise<RedmineIssue> {
  const response = await fetch(
    `${baseUrl}/issues/${encodeURIComponent(issueId)}.json?include=attachments,journals`,
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
