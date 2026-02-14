import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  SwaggerDoc,
  SwaggerMetadata,
  SwaggerOperation,
  ParameterSummary,
  ParameterSchemaSummary,
  SchemaObjectPropertySummary,
  RequestBodySummary,
  RequestBodyContentSummary,
  ResponseSummary,
  ResponseContentSummary,
  RequestBodyObject,
  ResponseObject,
  MediaTypeObject,
  PathMatchSummary,
} from "./types.js";
import { HTTP_METHODS } from "./types.js";

const MAX_SCHEMA_DEPTH = 3;

// ── Schema helpers ──────────────────────────────────────────────────

function cloneSchemaSummary(
  summary?: ParameterSchemaSummary
): ParameterSchemaSummary | undefined {
  if (!summary) return undefined;

  return {
    ...summary,
    enum: summary.enum ? [...summary.enum] : undefined,
    itemsEnum: summary.itemsEnum ? [...summary.itemsEnum] : undefined,
    properties: summary.properties
      ? summary.properties.map((property) => ({
          ...property,
          schema: cloneSchemaSummary(property.schema),
        }))
      : undefined,
    itemsSchema: cloneSchemaSummary(summary.itemsSchema),
  };
}

function mergePropertySummaries(
  base: SchemaObjectPropertySummary[] | undefined,
  incoming: SchemaObjectPropertySummary[]
): SchemaObjectPropertySummary[] {
  if (!base || base.length === 0) {
    return incoming.map<SchemaObjectPropertySummary>((property) => ({
      ...property,
      schema: cloneSchemaSummary(property.schema),
    }));
  }

  const result = base.map<SchemaObjectPropertySummary>((property) => ({
    ...property,
    schema: cloneSchemaSummary(property.schema),
  }));

  const indexByName = new Map(
    result.map((property) => [property.name, property])
  );

  for (const property of incoming) {
    const existing = indexByName.get(property.name);

    if (!existing) {
      const cloned: SchemaObjectPropertySummary = {
        ...property,
        schema: cloneSchemaSummary(property.schema),
      };
      result.push(cloned);
      indexByName.set(property.name, cloned);
      continue;
    }

    existing.required = existing.required || property.required;
    if (!existing.description && property.description) {
      existing.description = property.description;
    }

    existing.schema = mergeSchemaSummaries(existing.schema, property.schema);
  }

  return result;
}

function mergeSchemaSummaries(
  ...summaries: Array<ParameterSchemaSummary | undefined>
): ParameterSchemaSummary | undefined {
  const filtered = summaries.filter(
    (entry): entry is ParameterSchemaSummary => Boolean(entry)
  );

  if (filtered.length === 0) {
    return undefined;
  }

  const result: ParameterSchemaSummary = {};

  for (const summary of filtered) {
    if (!result.type && summary.type) result.type = summary.type;
    if (!result.format && summary.format) result.format = summary.format;
    if (!result.enum && summary.enum) result.enum = [...summary.enum];
    if (!result.itemsType && summary.itemsType)
      result.itemsType = summary.itemsType;
    if (!result.itemsEnum && summary.itemsEnum)
      result.itemsEnum = [...summary.itemsEnum];
    if (result.default === undefined && summary.default !== undefined)
      result.default = summary.default;
    if (result.example === undefined && summary.example !== undefined)
      result.example = summary.example;
    if (!result.ref && summary.ref) result.ref = summary.ref;
    if (!result.title && summary.title) result.title = summary.title;

    if (summary.description) {
      if (!result.description) {
        result.description = summary.description;
      } else if (!result.description.includes(summary.description)) {
        result.description = `${result.description}; ${summary.description}`;
      }
    }

    if (summary.properties && summary.properties.length > 0) {
      result.properties = mergePropertySummaries(
        result.properties,
        summary.properties
      );
    }

    if (summary.itemsSchema) {
      result.itemsSchema = result.itemsSchema
        ? mergeSchemaSummaries(result.itemsSchema, summary.itemsSchema)
        : cloneSchemaSummary(summary.itemsSchema);
    }
  }

  const hasData = [
    result.type,
    result.format,
    result.enum,
    result.itemsType,
    result.itemsEnum,
    result.default,
    result.example,
    result.ref,
    result.title,
    result.description,
    result.properties,
    result.itemsSchema,
  ].some((value) => value !== undefined);

  return hasData ? result : undefined;
}

function sanitizeEnumList(
  value: unknown
): Array<string | number | boolean> | undefined {
  if (!Array.isArray(value)) return undefined;

  const sanitized = value.filter(
    (entry): entry is string | number | boolean =>
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
  );

  return sanitized.length > 0 ? sanitized : undefined;
}

export function summarizeSchema(
  schema: unknown,
  resolveRef?: (ref: string) => unknown,
  depth = 0,
  seen = new WeakSet<object>()
): ParameterSchemaSummary | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  if (seen.has(schema as object) || depth > MAX_SCHEMA_DEPTH) {
    return undefined;
  }

  const current = schema as object;
  seen.add(current);

  try {
    const source = schema as Record<string, unknown>;
    const direct: ParameterSchemaSummary = {};

    const type = typeof source.type === "string" ? source.type : undefined;
    const format =
      typeof source.format === "string" ? source.format : undefined;
    const title = typeof source.title === "string" ? source.title : undefined;
    const description =
      typeof source.description === "string" ? source.description : undefined;
    const ref = typeof source.$ref === "string" ? source.$ref : undefined;
    const enumValues = sanitizeEnumList(source.enum);

    if (type) direct.type = type;
    if (format) direct.format = format;
    if (title) direct.title = title;
    if (description) direct.description = description;
    if (ref) direct.ref = ref;
    if (enumValues && enumValues.length > 0) direct.enum = enumValues;

    if (Object.prototype.hasOwnProperty.call(source, "default")) {
      direct.default = source.default;
    }

    if (Object.prototype.hasOwnProperty.call(source, "example")) {
      direct.example = source.example;
    }

    if (source.items) {
      const itemSummary = summarizeSchema(
        source.items,
        resolveRef,
        depth + 1,
        seen
      );

      if (itemSummary) {
        direct.itemsSchema = itemSummary;
        if (!direct.itemsType && itemSummary.type) {
          direct.itemsType = itemSummary.type;
        }
        if (!direct.itemsEnum && itemSummary.enum) {
          direct.itemsEnum = itemSummary.enum;
        }
        if (!direct.type) {
          direct.type = "array";
        }
      }
    }

    if (source.properties && typeof source.properties === "object") {
      const requiredEntries = Array.isArray(source.required)
        ? (source.required as unknown[]).filter(
            (entry): entry is string => typeof entry === "string"
          )
        : [];
      const requiredSet = new Set(requiredEntries);
      const properties: SchemaObjectPropertySummary[] = [];

      for (const [name, propertySchema] of Object.entries(
        source.properties as Record<string, unknown>
      )) {
        const propertySummary = summarizeSchema(
          propertySchema,
          resolveRef,
          depth + 1,
          seen
        );
        const propSchemaObj = propertySchema as Record<string, unknown>;
        const propertyDescription =
          typeof propSchemaObj.description === "string"
            ? propSchemaObj.description
            : propertySummary?.description;

        properties.push({
          name,
          required: requiredSet.has(name),
          description: propertyDescription,
          schema: propertySummary,
        });
      }

      if (properties.length > 0) {
        direct.properties = properties;
        if (!direct.type) {
          direct.type = "object";
        }
      }
    }

    const contributions: ParameterSchemaSummary[] = [];
    const combinationVariants: Array<ParameterSchemaSummary | undefined> = [];
    const combinationKeys = ["allOf", "oneOf", "anyOf"] as const;

    for (const key of combinationKeys) {
      const variants = source[key];
      if (!Array.isArray(variants)) continue;

      for (const variant of variants) {
        const variantSummary = summarizeSchema(
          variant,
          resolveRef,
          depth + 1,
          seen
        );
        if (variantSummary) {
          combinationVariants.push(variantSummary);
        }
      }

      if (key !== "allOf" && variants.length > 1) {
        const marker =
          key === "oneOf"
            ? `oneOf (${variants.length} variants)`
            : `anyOf (${variants.length} variants)`;
        direct.description = direct.description
          ? `${direct.description}; ${marker}`
          : marker;
      }
    }

    const hasDirectData = [
      direct.type,
      direct.format,
      direct.enum,
      direct.itemsType,
      direct.itemsEnum,
      direct.default,
      direct.example,
      direct.ref,
      direct.title,
      direct.description,
      direct.properties,
      direct.itemsSchema,
    ].some((value) => value !== undefined);

    if (hasDirectData) {
      contributions.push(direct);
    }

    if (ref && resolveRef) {
      const resolvedSchema = resolveRef(ref);
      if (resolvedSchema && typeof resolvedSchema === "object") {
        const resolvedSummary = summarizeSchema(
          resolvedSchema,
          resolveRef,
          depth + 1,
          seen
        );
        if (resolvedSummary) {
          contributions.push(resolvedSummary);
        }
      }
    }

    contributions.push(
      ...combinationVariants.filter(
        (variant): variant is ParameterSchemaSummary => Boolean(variant)
      )
    );

    const combined = mergeSchemaSummaries(...contributions);

    if (combined && ref && !combined.ref) {
      combined.ref = ref;
    }

    return combined;
  } finally {
    seen.delete(current);
  }
}

// ── Parameter / Request Body / Response summarizers ─────────────────

function extractParameterSchema(
  param: Record<string, unknown>,
  resolveRef?: (ref: string) => unknown
): ParameterSchemaSummary | undefined {
  const schemaFromParam = summarizeSchema(param.schema, resolveRef);
  const inlineSummary = summarizeSchema(param, resolveRef);

  return mergeSchemaSummaries(schemaFromParam, inlineSummary);
}

function summarizeParameters(
  operation: SwaggerOperation | undefined,
  resolveRef?: (ref: string) => unknown
): ParameterSummary[] | undefined {
  const params = Array.isArray(operation?.parameters)
    ? operation.parameters
    : [];

  const mapped = params
    .map((param) => {
      if (!param || typeof param !== "object") return undefined;
      let parameterObject = param as Record<string, unknown>;

      if (resolveRef && typeof parameterObject.$ref === "string") {
        const resolved = resolveRef(parameterObject.$ref);
        if (resolved && typeof resolved === "object") {
          parameterObject = {
            ...(resolved as Record<string, unknown>),
            ...parameterObject,
          };
        }
      }

      const name =
        typeof parameterObject.name === "string" ? parameterObject.name : null;
      const location =
        typeof parameterObject.in === "string" ? parameterObject.in : null;
      if (!name || !location) return undefined;

      const summary: ParameterSummary = {
        name,
        in: location,
        required:
          typeof parameterObject.required === "boolean"
            ? parameterObject.required
            : undefined,
        description:
          typeof parameterObject.description === "string"
            ? parameterObject.description
            : undefined,
        schema: extractParameterSchema(parameterObject, resolveRef),
      };
      return summary;
    })
    .filter((entry): entry is ParameterSummary => Boolean(entry));

  return mapped.length > 0 ? mapped : undefined;
}

function parseExamplesObject(
  examples: Record<string, unknown>
): Record<string, unknown> | undefined {
  const parsed: Record<string, unknown> = {};
  for (const [exampleKey, exampleValue] of Object.entries(examples)) {
    if (!exampleValue || typeof exampleValue !== "object") {
      parsed[exampleKey] = exampleValue;
      continue;
    }

    const exampleObj = exampleValue as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(exampleObj, "value")) {
      parsed[exampleKey] = exampleObj.value;
    } else {
      parsed[exampleKey] = exampleValue;
    }
  }

  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function summarizeRequestBody(
  operation: SwaggerOperation | undefined,
  resolveRef?: (ref: string) => unknown
): RequestBodySummary | undefined {
  const requestBody = operation?.requestBody as RequestBodyObject | undefined;
  if (!requestBody || typeof requestBody !== "object") return undefined;

  const content = requestBody.content;
  const contentTypes =
    content && typeof content === "object" ? Object.keys(content) : [];

  const contents: RequestBodyContentSummary[] = [];

  if (content && typeof content === "object") {
    for (const [contentType, mediaObject] of Object.entries(content)) {
      if (!mediaObject || typeof mediaObject !== "object") continue;

      const schemaSummary = summarizeSchema(mediaObject.schema, resolveRef);

      const example = Object.prototype.hasOwnProperty.call(
        mediaObject,
        "example"
      )
        ? mediaObject.example
        : undefined;

      const examples =
        mediaObject.examples && typeof mediaObject.examples === "object"
          ? parseExamplesObject(mediaObject.examples)
          : undefined;

      contents.push({
        contentType,
        schema: schemaSummary,
        example,
        examples,
      });
    }
  }

  return {
    required: Boolean(requestBody.required),
    contentTypes,
    description:
      typeof requestBody.description === "string"
        ? requestBody.description
        : undefined,
    contents: contents.length > 0 ? contents : undefined,
  };
}

function summarizeResponses(
  operation: SwaggerOperation | undefined,
  resolveRef?: (ref: string) => unknown
): {
  successResponses?: ResponseSummary[];
  errorResponses?: ResponseSummary[];
} {
  const responses = operation?.responses;
  if (!responses || typeof responses !== "object") return {};

  const success: ResponseSummary[] = [];
  const errors: ResponseSummary[] = [];

  for (const [status, response] of Object.entries(responses)) {
    if (!/^[1-5][0-9]{2}$/.test(status)) continue;
    const statusCode = Number(status);
    if (Number.isNaN(statusCode)) continue;

    if (!response || typeof response !== "object") continue;

    const responseObj = response as ResponseObject;
    const description =
      typeof responseObj.description === "string"
        ? responseObj.description
        : undefined;

    const content = responseObj.content;
    const contents: ResponseContentSummary[] = [];

    if (content && typeof content === "object") {
      for (const [contentType, mediaObject] of Object.entries(content)) {
        if (!mediaObject || typeof mediaObject !== "object") continue;

        const schemaSummary = summarizeSchema(mediaObject.schema, resolveRef);

        const example = Object.prototype.hasOwnProperty.call(
          mediaObject,
          "example"
        )
          ? mediaObject.example
          : undefined;

        const examples =
          mediaObject.examples && typeof mediaObject.examples === "object"
            ? parseExamplesObject(mediaObject.examples)
            : undefined;

        contents.push({
          contentType,
          schema: schemaSummary,
          example,
          examples,
        });
      }
    }

    const contentTypes =
      contents.length > 0
        ? contents.map((entry) => entry.contentType)
        : undefined;

    const summary: ResponseSummary = {
      status,
      description,
      contentTypes,
      contents: contents.length > 0 ? contents : undefined,
    };

    if (statusCode >= 200 && statusCode < 400) {
      success.push(summary);
    } else if (statusCode >= 400) {
      errors.push(summary);
    }
  }

  return {
    successResponses: success.length > 0 ? success : undefined,
    errorResponses: errors.length > 0 ? errors : undefined,
  };
}

// ── Ref resolver ────────────────────────────────────────────────────

export function createRefResolver(doc: SwaggerDoc) {
  return (ref: string): unknown => {
    if (typeof ref !== "string") return undefined;
    if (!ref.startsWith("#/")) return undefined;

    const parts = ref
      .slice(2)
      .split("/")
      .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));

    let current: unknown = doc;

    for (const part of parts) {
      if (Array.isArray(current)) {
        const index = Number(part);
        if (Number.isNaN(index) || index < 0 || index >= current.length) {
          return undefined;
        }
        current = current[index];
        continue;
      }

      if (current && typeof current === "object" && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  };
}

// ── Path matching ───────────────────────────────────────────────────

export function collectPathMatches(
  doc: SwaggerDoc,
  pathFilter: string
): PathMatchSummary[] {
  const normalizedFilter = pathFilter.trim().toLowerCase();
  const matches: PathMatchSummary[] = [];
  const resolveRef = createRefResolver(doc);

  if (!normalizedFilter) {
    return matches;
  }

  for (const [pathKey, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") continue;
    if (!pathKey.toLowerCase().includes(normalizedFilter)) continue;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const tags =
        Array.isArray(operation.tags) &&
        operation.tags.every((tag: unknown) => typeof tag === "string")
          ? operation.tags
          : undefined;

      const responses = summarizeResponses(operation, resolveRef);

      matches.push({
        path: pathKey,
        method: method.toUpperCase(),
        summary: operation.summary,
        description: operation.description,
        operationId: operation.operationId,
        tags,
        parameters: summarizeParameters(operation, resolveRef),
        requestBody: summarizeRequestBody(operation, resolveRef),
        ...responses,
      });
    }
  }

  return matches;
}

// ── Document metadata ───────────────────────────────────────────────

export function computeMetadata(doc: SwaggerDoc): SwaggerMetadata {
  const tags = new Set<string>();
  const paths = doc.paths ?? {};
  let totalEndpoints = 0;

  for (const pathItem of Object.values(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      totalEndpoints += 1;
      const operationTags = operation.tags;
      if (Array.isArray(operationTags)) {
        for (const tag of operationTags) {
          if (typeof tag === "string" && tag.trim()) {
            tags.add(tag.trim());
          }
        }
      }
    }
  }

  const docTags = doc.tags ?? [];
  for (const tag of docTags) {
    if (!tag) continue;
    if (typeof tag === "string") {
      if (tag.trim()) tags.add(tag.trim());
    } else if (typeof tag === "object" && typeof tag.name === "string") {
      if (tag.name.trim()) tags.add(tag.name.trim());
    }
  }

  return {
    projectTitle: doc.info?.title?.trim() || "Swagger Project",
    totalEndpoints,
    totalTags: tags.size,
  };
}

// ── Document loader (per-session, with caching) ─────────────────────

export function createSwaggerLoader(source: string) {
  let cache: { doc: SwaggerDoc } | null = null;

  function isHttpSource(src: string): boolean {
    return /^https?:\/\//i.test(src);
  }

  async function loadDocument(): Promise<SwaggerDoc> {
    if (cache) return cache.doc;

    let doc: SwaggerDoc;

    if (isHttpSource(source)) {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch Swagger JSON from ${source} (HTTP ${response.status})`
        );
      }
      doc = (await response.json()) as SwaggerDoc;
    } else {
      const absolutePath = path.isAbsolute(source)
        ? source
        : path.resolve(process.cwd(), source);

      const fileContents = await readFile(absolutePath, "utf-8");
      try {
        doc = JSON.parse(fileContents) as SwaggerDoc;
      } catch (error) {
        throw new Error(
          `Failed to parse Swagger JSON at ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    cache = { doc };
    return doc;
  }

  return { getDocument: loadDocument, computeMetadata };
}
