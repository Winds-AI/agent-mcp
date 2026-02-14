import type {
  ParameterSummary,
  ParameterSchemaSummary,
  SchemaObjectPropertySummary,
  RequestBodySummary,
  ResponseSummary,
  PayloadContentSummary,
  SwaggerMetadata,
  PathMatchSummary,
} from "./types.js";

export function sanitizePlainText(value?: string): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r?\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function sanitizeMarkdownCell(value: string): string {
  return sanitizePlainText(value).replace(/\|/g, "\\|");
}

export function formatInlineValue(value: unknown): string {
  if (value === null) return "`null`";
  if (typeof value === "string") {
    const escaped = value.replace(/`/g, "\\`");
    return `\`${escaped}\``;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `\`${String(value)}\``;
  }
  try {
    return `\`${JSON.stringify(value)}\``;
  } catch {
    return "`[unsupported]`";
  }
}

export function describeParameterSchema(
  schema?: ParameterSchemaSummary
): string {
  if (!schema) return "\u2014";

  const parts: string[] = [];

  if (schema.type && schema.format) {
    parts.push(`${schema.type} (${schema.format})`);
  } else if (schema.type) {
    parts.push(schema.type);
  } else if (schema.format) {
    parts.push(schema.format);
  }

  if (schema.enum && schema.enum.length > 0) {
    const formattedEnum = schema.enum.map((value) => formatInlineValue(value));
    parts.push(`enum: ${formattedEnum.join(", ")}`);
  }

  if (schema.itemsType) {
    const itemEnum =
      schema.itemsEnum && schema.itemsEnum.length > 0
        ? ` (enum: ${schema.itemsEnum.map((value) => formatInlineValue(value)).join(", ")})`
        : "";
    parts.push(`items: ${schema.itemsType}${itemEnum}`);
  }

  if (schema.default !== undefined) {
    parts.push(`default: ${formatInlineValue(schema.default)}`);
  }

  if (schema.example !== undefined) {
    parts.push(`example: ${formatInlineValue(schema.example)}`);
  }

  return parts.length > 0 ? parts.join("; ") : "\u2014";
}

export function buildParametersSection(
  parameters?: ParameterSummary[]
): string[] {
  if (!parameters || parameters.length === 0) {
    return ["_No parameters defined._"];
  }

  const lines = [
    "| Name | In | Required | Schema | Description |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const param of parameters) {
    const requiredText = param.required ? "Yes" : "No";
    const schemaText = describeParameterSchema(param.schema);
    const descriptionText = param.description
      ? sanitizeMarkdownCell(param.description)
      : "\u2014";

    lines.push(
      `| \`${param.name}\` | ${sanitizeMarkdownCell(param.in)} | ${requiredText} | ${sanitizeMarkdownCell(
        schemaText
      )} | ${descriptionText} |`
    );
  }

  return lines;
}

export function buildSchemaPropertiesTable(
  properties?: SchemaObjectPropertySummary[]
): string[] {
  if (!properties || properties.length === 0) return [];

  const lines = [
    "| Field | Type | Required | Description |",
    "| --- | --- | --- | --- |",
  ];

  for (const property of properties) {
    const typeText = describeParameterSchema(property.schema);
    const requiredText = property.required ? "Yes" : "No";
    const descriptionText = property.description
      ? sanitizeMarkdownCell(property.description)
      : property.schema?.description
        ? sanitizeMarkdownCell(property.schema.description)
        : "\u2014";

    lines.push(
      `| \`${property.name}\` | ${sanitizeMarkdownCell(
        typeText
      )} | ${requiredText} | ${descriptionText} |`
    );
  }

  return lines;
}

export function formatExampleValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function buildPayloadContentSection(
  content: PayloadContentSummary
): string[] {
  const lines: string[] = [];
  const schema = content.schema;

  if (schema) {
    const summaryText = describeParameterSchema(schema);
    if (summaryText && summaryText !== "\u2014") {
      lines.push(`Type: ${summaryText}`);
    }

    if (schema.ref) {
      lines.push(`Schema Ref: \`${schema.ref}\``);
    }

    if (schema.title) {
      lines.push(`Title: ${sanitizePlainText(schema.title)}`);
    }

    if (schema.description) {
      lines.push(`Description: ${sanitizePlainText(schema.description)}`);
    }

    const propertyTable = buildSchemaPropertiesTable(schema.properties);
    if (propertyTable.length > 0) {
      lines.push("");
      lines.push(...propertyTable);
    }

    if (schema.itemsSchema) {
      const itemsSummary = describeParameterSchema(schema.itemsSchema);
      if (itemsSummary && itemsSummary !== "\u2014") {
        lines.push("");
        lines.push(`Items: ${itemsSummary}`);
      }

      const itemPropertiesTable = buildSchemaPropertiesTable(
        schema.itemsSchema.properties
      );

      if (itemPropertiesTable.length > 0) {
        lines.push("");
        lines.push("Item Properties");
        lines.push(...itemPropertiesTable);
      }
    }
  } else {
    lines.push("_Schema not provided._");
  }

  const exampleEntries: Array<{ label: string; value: unknown }> = [];

  if (content.example !== undefined) {
    exampleEntries.push({ label: "Example", value: content.example });
  }

  if (content.examples) {
    for (const [key, value] of Object.entries(content.examples)) {
      exampleEntries.push({ label: `Example (${key})`, value });
    }
  }

  if (
    schema?.example !== undefined &&
    !exampleEntries.some((entry) => entry.label.startsWith("Example"))
  ) {
    exampleEntries.push({ label: "Example (schema)", value: schema.example });
  }

  if (
    schema?.default !== undefined &&
    !exampleEntries.some((entry) => entry.label.startsWith("Default"))
  ) {
    exampleEntries.push({ label: "Default", value: schema.default });
  }

  for (const entry of exampleEntries) {
    lines.push("");
    lines.push(`${entry.label}:`);
    const formatted = formatExampleValue(entry.value);
    const trimmed = formatted.trim();

    let fence: string | undefined;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      fence = "json";
    } else if (trimmed.startsWith("<")) {
      fence = "xml";
    }

    lines.push(fence ? `\`\`\`${fence}` : "```");
    lines.push(formatted);
    lines.push("```");
  }

  if (lines.length === 0) {
    lines.push("_No payload details available._");
  }

  return lines;
}

export function buildRequestBodySection(
  requestBody?: RequestBodySummary
): string[] {
  if (!requestBody) {
    return ["_Not applicable._"];
  }

  const lines: string[] = [];

  lines.push(`Required: ${requestBody.required ? "Yes" : "No"}`);

  if (requestBody.description) {
    lines.push(
      `Description: ${sanitizePlainText(requestBody.description)}`
    );
  }

  const contentTypes = requestBody.contentTypes
    .map((value) => sanitizePlainText(value))
    .filter((value) => Boolean(value));

  if (contentTypes.length > 0) {
    lines.push(`Content Types: ${contentTypes.join(", ")}`);
  } else {
    lines.push("Content Types: \u2014");
  }

  if (requestBody.contents) {
    for (const content of requestBody.contents) {
      lines.push("");
      lines.push(`**Payload \u2013 ${content.contentType}**`);
      lines.push(...buildPayloadContentSection(content));
    }
  }

  return lines;
}

export function formatResponseSection(
  title: string,
  responses?: ResponseSummary[]
): string[] {
  if (!responses || responses.length === 0) return [];

  const lines = [`**${title}**`];

  for (const response of responses) {
    const description = sanitizePlainText(response.description);
    const contentTypes =
      response.contentTypes && response.contentTypes.length > 0
        ? `(${response.contentTypes.join(", ")})`
        : undefined;

    if (lines.length > 1) {
      lines.push("");
    }

    const headerParts = [`**Status** \`${response.status}\``];
    if (contentTypes) headerParts.push(contentTypes);
    if (description) headerParts.push(`\u2014 ${description}`);

    lines.push(headerParts.join(" ").trim());

    if (response.contents) {
      for (const content of response.contents) {
        lines.push("");
        lines.push(`**Payload \u2013 ${content.contentType}**`);
        lines.push(...buildPayloadContentSection(content));
      }
    }
  }

  return lines;
}

export function buildIntegrationNotes(match: PathMatchSummary): string[] {
  const notes: string[] = [];

  const requiredParameters = match.parameters
    ?.filter((param) => param.required)
    .map((param) => `\`${param.name}\``);

  if (requiredParameters && requiredParameters.length > 0) {
    notes.push(
      `Ensure required parameters ${requiredParameters.join(", ")} are provided before calling the endpoint.`
    );
  }

  if (match.requestBody?.required) {
    const contentTypes =
      match.requestBody.contentTypes
        .map((value) => sanitizePlainText(value))
        .filter((value) => Boolean(value))
        .join(", ") || "available content types";
    notes.push(
      `Send a request body that matches one of the supported content types (${contentTypes}).`
    );
  }

  if (
    match.requestBody?.contents?.some(
      (content) =>
        content.example !== undefined ||
        (content.examples && Object.keys(content.examples).length > 0)
    )
  ) {
    notes.push(
      "Use the provided example payloads as a starting point to validate request serialization."
    );
  }

  if (match.errorResponses && match.errorResponses.length > 0) {
    const statuses = match.errorResponses
      .map((response) => `\`${response.status}\``)
      .join(", ");
    notes.push(
      `Implement error handling for statuses ${statuses} and surface clear messages to callers.`
    );
  }

  return notes;
}

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}\u2026`;
}

export function formatSearchResultAsMarkdown(result: {
  query: string;
  totalMatches: number;
  metadata: SwaggerMetadata;
  matches: PathMatchSummary[];
}): string {
  const lines: string[] = [];

  lines.push("# OpenAPI Search Results");
  lines.push(`- **Query:** \`${result.query}\``);
  lines.push(`- **Total Matches:** ${result.totalMatches}`);
  lines.push(`- **Project:** ${result.metadata.projectTitle}`);
  lines.push(`- **Endpoints in Spec:** ${result.metadata.totalEndpoints}`);
  lines.push(`- **Tags in Spec:** ${result.metadata.totalTags}`);

  if (result.totalMatches === 0) {
    lines.push("");
    lines.push("_No endpoints matched the provided path fragment._");
    return lines.join("\n");
  }

  for (const match of result.matches) {
    lines.push("");
    lines.push(`## ${match.method} ${match.path}`);

    const summary = sanitizePlainText(match.summary);
    if (summary) {
      lines.push(`**Summary** ${summary}`);
    }

    const description = sanitizePlainText(match.description);
    if (description) {
      lines.push(`**Description** ${description}`);
    }

    if (match.operationId) {
      lines.push(`**operationId** \`${match.operationId}\``);
    }

    if (match.tags && match.tags.length > 0) {
      const tagsText = match.tags
        .map((tag) => sanitizePlainText(tag))
        .filter((tag) => Boolean(tag))
        .join(", ");
      if (tagsText) {
        lines.push(`**Tags** ${tagsText}`);
      }
    }

    lines.push("");
    lines.push("**Parameters**");
    lines.push(...buildParametersSection(match.parameters));

    lines.push("");
    lines.push("**Request Body**");
    lines.push(...buildRequestBodySection(match.requestBody));

    const successSection = formatResponseSection(
      "Success Responses",
      match.successResponses
    );
    if (successSection.length > 0) {
      lines.push("");
      lines.push(...successSection);
    }

    const errorSection = formatResponseSection(
      "Error Handling",
      match.errorResponses
    );
    if (errorSection.length > 0) {
      lines.push("");
      lines.push(...errorSection);
    }

    const integrationNotes = buildIntegrationNotes(match);
    if (integrationNotes.length > 0) {
      lines.push("");
      lines.push("**Integration Notes**");
      for (const note of integrationNotes) {
        lines.push(`- ${note}`);
      }
    }
  }

  return lines.join("\n");
}
