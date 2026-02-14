import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { SessionConfig } from "../lib/types.js";
import {
  normalizeBaseUrl,
  ensureIssueProjectScope,
  getCustomFieldValue,
  extractDescriptionImageHints,
  matchDescriptionAttachments,
  fetchRedmineIssue,
  fetchAndCompressAttachment,
} from "../lib/redmine-client.js";
import { truncateText } from "../lib/formatting.js";

export function registerRedmineTool(
  server: McpServer,
  config: SessionConfig
) {
  if (!config.redmineBaseUrl || !config.redmineApiKey || !config.redmineProjectId) {
    return;
  }

  const baseUrl = normalizeBaseUrl(config.redmineBaseUrl);
  const apiKey = config.redmineApiKey;
  const configuredProject = config.redmineProjectId;

  server.registerTool(
    "redmine_getIssue",
    {
      title: "Get Redmine Issue",
      description:
        "Fetch a Redmine issue by ID, scoped to the configured project. Returns core fields, selected custom fields, description images as base64 WebP, and remaining attachments.",
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
            filename: z.string(),
            mime: z.literal("image/webp"),
            base64: z.string(),
          })
        ),
        attachments: z.array(
          z.object({
            id: z.number(),
            filename: z.string(),
            size: z.number(),
            author: z.string(),
            created_on: z.string().optional(),
            content_url: z.string(),
          })
        ),
      },
    },
    async ({ issueId }) => {
      try {
        const normalizedIssueId = issueId.trim().replace(/^#/, "");
        if (!normalizedIssueId) {
          throw new Error("Issue ID is required.");
        }

        const issue = await fetchRedmineIssue(
          baseUrl,
          apiKey,
          normalizedIssueId
        );
        ensureIssueProjectScope(issue, configuredProject);

        const description = issue.description ?? "";
        const imageHints = extractDescriptionImageHints(description);
        const matchResult = matchDescriptionAttachments(
          issue.attachments,
          imageHints
        );

        const descriptionImages: Array<{
          id: number;
          filename: string;
          mime: "image/webp";
          base64: string;
        }> = [];
        for (const attachment of matchResult.matched) {
          const base64 = await fetchAndCompressAttachment(attachment, apiKey);
          descriptionImages.push({
            id: attachment.id,
            filename: attachment.filename,
            mime: "image/webp" as const,
            base64,
          });
        }

        const remainingAttachments = (issue.attachments ?? [])
          .filter(
            (attachment) =>
              !descriptionImages.some((image) => image.id === attachment.id)
          )
          .map((attachment) => ({
            id: attachment.id,
            filename: attachment.filename,
            size: attachment.filesize,
            author: attachment.author?.name ?? "Unknown",
            created_on: attachment.created_on,
            content_url: attachment.content_url,
          }));

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

        const summaryLines = [
          `Issue #${coreIssue.id}: ${coreIssue.subject}`,
          `Project: ${coreIssue.project}`,
          `Tracker: ${coreIssue.tracker} | Status: ${coreIssue.status} | Priority: ${coreIssue.priority}`,
          `Author: ${coreIssue.author} | Assignee: ${coreIssue.assignee ?? "Unassigned"}`,
          `Created: ${coreIssue.created_on} | Updated: ${coreIssue.updated_on}`,
          `Start date: ${coreIssue.start_date ?? "None"}`,
          `Severity: ${customFields.severity ?? "None"} | Screen Name: ${customFields.screen_name ?? "None"} | Testing Env: ${customFields.testing_environment ?? "None"}`,
          `Description: ${truncateText(coreIssue.description.trim(), 500) || "None"}`,
          `Description images: ${descriptionImages.length} | Other attachments: ${remainingAttachments.length}`,
        ];

        const content: Array<
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string }
        > = [
          {
            type: "text",
            text: summaryLines.join("\n"),
          },
        ];

        if (matchResult.unresolved.length > 0) {
          content.push({
            type: "text",
            text: `Warning: Some description image references could not be resolved: ${matchResult.unresolved.join(
              ", "
            )}`,
          });
        }

        for (const image of descriptionImages) {
          content.push({
            type: "image",
            data: image.base64,
            mimeType: "image/webp",
          });
        }

        return {
          content,
          structuredContent: {
            issue: coreIssue,
            custom_fields: customFields,
            description_images: descriptionImages,
            attachments: remainingAttachments,
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
