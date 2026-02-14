import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { SessionConfig, ParameterSchemaSummary } from "../lib/types.js";
import {
  createSwaggerLoader,
  collectPathMatches,
} from "../lib/swagger-parser.js";
import { formatSearchResultAsMarkdown } from "../lib/formatting.js";

const OPENAPI_SEARCH_ENDPOINTS_DESCRIPTION =
  'Default discovery tool for API related tasks. Trigger: when a request mentions "API integration", "changes in API logic/response", "correct field names", or "validations." Searches through OpenAPI JSON of the backend and consults a per-project integration guide at PROJECT_INTEGRATION_GUIDE to infer stack and code patterns (routing, data fetching, forms, file layout, auth). Returns canonical operations (path, method, operationId, parameters, requestBody schemas, response schemas, examples) plus integrationHints derived from the guide (e.g., where to place services/hooks, file/alias conventions, preferred validation). Use the results to make real requests via .agent/api.sh and generate project-conformant code that follows the code patterns and structure of the current repo.';

const schemaSummaryZod: z.ZodType<ParameterSchemaSummary> = z.lazy(() =>
  z.object({
    type: z.string().optional(),
    format: z.string().optional(),
    enum: z
      .array(z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
    itemsType: z.string().optional(),
    itemsEnum: z
      .array(z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
    default: z.unknown().optional(),
    example: z.unknown().optional(),
    ref: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    properties: z
      .array(
        z.object({
          name: z.string(),
          required: z.boolean(),
          description: z.string().optional(),
          schema: schemaSummaryZod.optional(),
        })
      )
      .optional(),
    itemsSchema: schemaSummaryZod.optional(),
  })
);

const responseContentSummaryZod = z.object({
  contentType: z.string(),
  schema: schemaSummaryZod.optional(),
  example: z.unknown().optional(),
  examples: z.record(z.unknown()).optional(),
});

export function registerOpenApiTool(
  server: McpServer,
  config: SessionConfig
) {
  if (!config.swaggerApiJson) return;

  const loader = createSwaggerLoader(config.swaggerApiJson);

  server.registerTool(
    "openapi_searchEndpoints",
    {
      title: "Search OpenAPI Endpoints",
      description: OPENAPI_SEARCH_ENDPOINTS_DESCRIPTION,
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe(
            "Path fragment to search for (case-insensitive). Example: '/users' or 'orders/{orderId}'."
          ),
      },
      outputSchema: {
        query: z.string(),
        totalMatches: z.number(),
        metadata: z.object({
          projectTitle: z.string(),
          totalEndpoints: z.number(),
          totalTags: z.number(),
        }),
        matches: z.array(
          z.object({
            path: z.string(),
            method: z.string(),
            summary: z.string().optional(),
            description: z.string().optional(),
            operationId: z.string().optional(),
            tags: z.array(z.string()).optional(),
            parameters: z
              .array(
                z.object({
                  name: z.string(),
                  in: z.string(),
                  required: z.boolean().optional(),
                  description: z.string().optional(),
                  schema: schemaSummaryZod.optional(),
                })
              )
              .optional(),
            requestBody: z
              .object({
                required: z.boolean(),
                contentTypes: z.array(z.string()),
                description: z.string().optional(),
                contents: z
                  .array(
                    z.object({
                      contentType: z.string(),
                      schema: schemaSummaryZod.optional(),
                      example: z.unknown().optional(),
                      examples: z.record(z.unknown()).optional(),
                    })
                  )
                  .optional(),
              })
              .optional(),
            successResponses: z
              .array(
                z.object({
                  status: z.string(),
                  description: z.string().optional(),
                  contentTypes: z.array(z.string()).optional(),
                  contents: z.array(responseContentSummaryZod).optional(),
                })
              )
              .optional(),
            errorResponses: z
              .array(
                z.object({
                  status: z.string(),
                  description: z.string().optional(),
                  contentTypes: z.array(z.string()).optional(),
                  contents: z.array(responseContentSummaryZod).optional(),
                })
              )
              .optional(),
          })
        ),
      },
    },
    async ({ path: pathFilter }) => {
      try {
        const doc = await loader.getDocument();
        const metadata = loader.computeMetadata(doc);
        const matches = collectPathMatches(doc, pathFilter);

        const result = {
          query: pathFilter,
          totalMatches: matches.length,
          metadata,
          matches,
        };

        const markdown = formatSearchResultAsMarkdown(result);

        return {
          content: [
            {
              type: "text" as const,
              text: markdown,
            },
          ],
          structuredContent: result,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `**Error:** Failed to filter Swagger paths: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
