import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Config } from "../lib/config.js";
import {
  normalizeBaseUrl,
  ensureIssueProjectScope,
  getCustomFieldValue,
  extractDescriptionImageHints,
  matchDescriptionAttachments,
  fetchRedmineIssue,
  fetchIdNameMap,
  resolveDetailDisplay,
  resolveRedmineImageCacheDir,
  cacheRedmineAttachmentLocally,
} from "../lib/redmine-client.js";

export function registerRedmineTool(server: McpServer, config: Config) {
  server.registerTool(
    "redmine_getIssue",
    {
      title: "Get Redmine Issue",
      description:
        "Fetch a Redmine issue by ID, scoped to the configured project. Returns core fields, selected custom fields, description image references (including local cached paths), and remaining attachments.",
      inputSchema: {
        issueId: z
          .string()
          .min(1)
          .describe("Redmine issue ID/number (e.g., 24799)."),
      },
      outputSchema: {
        issue: z.object({
          id: z.number(),
          tracker: z.string(),
          status: z.string(),
          priority: z.string(),
          subject: z.string(),
          project: z.string(),
          author: z.string(),
          assignee: z.string().nullable(),
          created_on: z.string(),
          updated_on: z.string(),
          start_date: z.string().nullable(),
          description: z.string(),
        }),
        custom_fields: z.object({
          severity: z.string().nullable(),
          screen_name: z.string().nullable(),
          testing_environment: z.string().nullable(),
        }),
        description_images: z.array(
          z.object({
            id: z.number(),
            size: z.number(),
            author: z.string(),
            created_on: z.string().optional(),
            content_type: z.string().optional(),
            local_path: z.string().nullable(),
            cached: z.boolean(),
            download_error: z.string().nullable(),
          })
        ),
        attachments: z.array(
          z.object({
            id: z.number(),
            size: z.number(),
            author: z.string(),
            created_on: z.string().optional(),
            content_type: z.string().optional(),
            local_path: z.string().nullable(),
            cached: z.boolean(),
            download_error: z.string().nullable(),
          })
        ),
        journals: z.array(
          z.object({
            id: z.number(),
            author: z.string(),
            created_on: z.string().nullable(),
            notes: z.string().nullable(),
            details: z.array(z.string()),
          })
        ),
      },
    },
    async ({ issueId }) => {
      try {
        const { redmineBaseUrl: baseUrlRaw, redmineApiKey: apiKey, redmineProjectId: configuredProject } = config;
        const imageCacheDir = resolveRedmineImageCacheDir(config.redmineImageCacheDir);

        if (!baseUrlRaw || !apiKey || !configuredProject) {
          throw new Error(
            "Missing Redmine config. Provide REDMINE_URL, REDMINE_API, and REDMINE_PROJECT."
          );
        }

        const baseUrl = normalizeBaseUrl(baseUrlRaw);

        const normalizedIssueId = issueId.trim().replace(/^#/, "");
        if (!normalizedIssueId) {
          throw new Error("Issue ID is required.");
        }

        const [issue, statusMap, trackerMap, priorityMap] = await Promise.all([
          fetchRedmineIssue(baseUrl, apiKey, normalizedIssueId),
          fetchIdNameMap(`${baseUrl}/issue_statuses.json`, apiKey, "issue_statuses"),
          fetchIdNameMap(`${baseUrl}/trackers.json`, apiKey, "trackers"),
          fetchIdNameMap(`${baseUrl}/enumerations/issue_priorities.json`, apiKey, "issue_priorities"),
        ]);
        ensureIssueProjectScope(issue, configuredProject);

        const userMap = new Map<string, string>();
        for (const journal of issue.journals ?? []) {
          if (journal.user) {
            userMap.set(String(journal.user.id), journal.user.name);
          }
        }
        const lookups = { statuses: statusMap, trackers: trackerMap, priorities: priorityMap, users: userMap };

        const description = issue.description ?? "";
        const imageHints = extractDescriptionImageHints(description);
        const matchResult = matchDescriptionAttachments(
          issue.attachments,
          imageHints
        );

        const descriptionImages = await Promise.all(
          matchResult.matched.map(async (attachment) => {
            try {
              const cacheResult = await cacheRedmineAttachmentLocally(
                attachment,
                apiKey,
                imageCacheDir,
                issue.id
              );
              return {
                id: attachment.id,
                size: attachment.filesize,
                author: attachment.author?.name ?? "Unknown",
                created_on: attachment.created_on,
                content_type: attachment.content_type,

                local_path: cacheResult.localPath,
                cached: cacheResult.cached,
                download_error: null,
              };
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              return {
                id: attachment.id,
                size: attachment.filesize,
                author: attachment.author?.name ?? "Unknown",
                created_on: attachment.created_on,
                content_type: attachment.content_type,

                local_path: null,
                cached: false,
                download_error: errorMessage,
              };
            }
          })
        );

        const remainingAttachments = await Promise.all(
          (issue.attachments ?? [])
            .filter(
              (attachment) =>
                !descriptionImages.some((image) => image.id === attachment.id)
            )
            .map(async (attachment) => {
              try {
                const cacheResult = await cacheRedmineAttachmentLocally(
                  attachment,
                  apiKey,
                  imageCacheDir,
                  issue.id
                );
                return {
                  id: attachment.id,
                  filename: attachment.filename,
                  size: attachment.filesize,
                  author: attachment.author?.name ?? "Unknown",
                  created_on: attachment.created_on,
                  content_type: attachment.content_type,
  
                  local_path: cacheResult.localPath,
                  cached: cacheResult.cached,
                  download_error: null,
                };
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                return {
                  id: attachment.id,
                  filename: attachment.filename,
                  size: attachment.filesize,
                  author: attachment.author?.name ?? "Unknown",
                  created_on: attachment.created_on,
                  content_type: attachment.content_type,
  
                  local_path: null,
                  cached: false,
                  download_error: errorMessage,
                };
              }
            })
        );

        const coreIssue = {
          id: issue.id,
          tracker: issue.tracker?.name ?? "Unknown",
          status: issue.status?.name ?? "Unknown",
          priority: issue.priority?.name ?? "Unknown",
          subject: issue.subject ?? "",
          project: issue.project?.name ?? "Unknown",
          author: issue.author?.name ?? "Unknown",
          assignee: issue.assigned_to?.name ?? null,
          created_on: issue.created_on ?? "",
          updated_on: issue.updated_on ?? "",
          start_date: issue.start_date ?? null,
          description,
        };

        const customFields = {
          severity: getCustomFieldValue(issue.custom_fields, "Severity"),
          screen_name: getCustomFieldValue(issue.custom_fields, "Screen Name"),
          testing_environment: getCustomFieldValue(
            issue.custom_fields,
            "Testing Environment"
          ),
        };

        const journals = (issue.journals ?? []).map((journal) => ({
          id: journal.id,
          author: journal.user?.name ?? "Unknown",
          created_on: journal.created_on ?? null,
          notes: journal.notes?.trim() || null,
          details: (journal.details ?? []).map((d) => resolveDetailDisplay(d, lookups)),
        }));

        const cachedImageCount = descriptionImages.filter(
          (image) => image.cached
        ).length;
        const failedImageDownloads = descriptionImages.filter(
          (image) => image.local_path === null
        );

        const mdLines: string[] = [];

        mdLines.push(`# Issue #${coreIssue.id} — ${coreIssue.subject}`);
        mdLines.push("");
        mdLines.push(`**Project:** ${coreIssue.project} | **Tracker:** ${coreIssue.tracker} | **Status:** ${coreIssue.status} | **Priority:** ${coreIssue.priority}`);
        mdLines.push(`**Author:** ${coreIssue.author} | **Assignee:** ${coreIssue.assignee ?? "Unassigned"}`);

        const dateParts = [`**Created:** ${coreIssue.created_on}`, `**Updated:** ${coreIssue.updated_on}`];
        if (coreIssue.start_date) dateParts.push(`**Start:** ${coreIssue.start_date}`);
        mdLines.push(dateParts.join(" | "));

        const cfParts: string[] = [];
        if (customFields.severity) cfParts.push(`**Severity:** ${customFields.severity}`);
        if (customFields.screen_name) cfParts.push(`**Screen:** ${customFields.screen_name}`);
        if (customFields.testing_environment) cfParts.push(`**Env:** ${customFields.testing_environment}`);
        if (cfParts.length > 0) mdLines.push(cfParts.join(" | "));

        if (matchResult.unresolved.length > 0) {
          mdLines.push(`> ⚠ Unresolved image refs: ${matchResult.unresolved.join(", ")}`);
        }

        mdLines.push("");
        mdLines.push("## Description");
        mdLines.push("");
        mdLines.push(coreIssue.description.trim() || "_No description._");

        if (descriptionImages.length > 0) {
          mdLines.push("");
          mdLines.push("## Description Images");
          mdLines.push("");
          for (const img of descriptionImages) {
            const status = img.download_error ? `⚠ ${img.download_error}` : img.local_path ?? "unavailable";
            mdLines.push(`- id:${img.id} | ${img.content_type ?? "unknown"} | ${img.size}b | ${img.author} | ${img.created_on ?? ""}`);
            mdLines.push(`  \`${status}\``);
          }
        }

        if (remainingAttachments.length > 0) {
          mdLines.push("");
          mdLines.push("## Attachments");
          mdLines.push("");
          for (const att of remainingAttachments) {
            const status = att.download_error ? `⚠ ${att.download_error}` : att.local_path ?? "unavailable";
            mdLines.push(`- id:${att.id} | ${att.content_type ?? "unknown"} | ${att.size}b | ${att.author} | ${att.created_on ?? ""}`);
            mdLines.push(`  \`${status}\``);
          }
        }

        if (journals.length > 0) {
          mdLines.push("");
          mdLines.push("## Journal");
          for (const journal of journals) {
            mdLines.push("");
            mdLines.push(`**#${journal.id}** ${journal.author} · ${journal.created_on ?? ""}`);
            for (const detail of journal.details) {
              mdLines.push(`- ${detail}`);
            }
            if (journal.notes) {
              mdLines.push("");
              mdLines.push(`> ${journal.notes}`);
            }
          }
        }

        const content: Array<{ type: "text"; text: string }> = [
          { type: "text", text: mdLines.join("\n") },
        ];

        return {
          content,
          structuredContent: {
            issue: coreIssue,
            custom_fields: customFields,
            description_images: descriptionImages,
            attachments: remainingAttachments,
            journals,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `**Error:** Failed to fetch issue: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
