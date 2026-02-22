export const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
] as const;

export interface SwaggerOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
}

export interface SwaggerPathItem {
  get?: SwaggerOperation;
  post?: SwaggerOperation;
  put?: SwaggerOperation;
  patch?: SwaggerOperation;
  delete?: SwaggerOperation;
  options?: SwaggerOperation;
  head?: SwaggerOperation;
  trace?: SwaggerOperation;
}

export interface SwaggerDoc {
  info?: {
    title?: string;
  };
  paths?: Record<string, SwaggerPathItem>;
  tags?: Array<{ name?: string } | string>;
  components?: Record<string, unknown>;
  definitions?: Record<string, unknown>;
}

export interface SwaggerMetadata {
  projectTitle: string;
  totalEndpoints: number;
  totalTags: number;
}

export interface ParameterSummary {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: ParameterSchemaSummary;
}

export interface ParameterSchemaSummary {
  type?: string;
  format?: string;
  enum?: Array<string | number | boolean>;
  itemsType?: string;
  itemsEnum?: Array<string | number | boolean>;
  default?: unknown;
  example?: unknown;
  ref?: string;
  title?: string;
  description?: string;
  properties?: SchemaObjectPropertySummary[];
  itemsSchema?: ParameterSchemaSummary;
}

export interface SchemaObjectPropertySummary {
  name: string;
  required: boolean;
  description?: string;
  schema?: ParameterSchemaSummary;
}

export interface RequestBodySummary {
  required: boolean;
  contentTypes: string[];
  description?: string;
  contents?: RequestBodyContentSummary[];
}

export interface RequestBodyContentSummary {
  contentType: string;
  schema?: ParameterSchemaSummary;
  example?: unknown;
  examples?: Record<string, unknown>;
}

export interface ResponseSummary {
  status: string;
  description?: string;
  contentTypes?: string[];
  contents?: ResponseContentSummary[];
}

export interface ResponseContentSummary {
  contentType: string;
  schema?: ParameterSchemaSummary;
  example?: unknown;
  examples?: Record<string, unknown>;
}

export type PayloadContentSummary =
  | RequestBodyContentSummary
  | ResponseContentSummary;

export interface PathMatchSummary {
  path: string;
  method: string;
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: ParameterSummary[];
  requestBody?: RequestBodySummary;
  successResponses?: ResponseSummary[];
  errorResponses?: ResponseSummary[];
}

export interface MediaTypeObject {
  schema?: unknown;
  example?: unknown;
  examples?: Record<string, unknown>;
}

export interface RequestBodyObject {
  required?: boolean;
  description?: string;
  content?: Record<string, MediaTypeObject>;
}

export interface ResponseObject {
  description?: string;
  content?: Record<string, MediaTypeObject>;
}

export interface RedmineIssueResponse {
  issue: RedmineIssue;
}

export interface RedmineIssue {
  id: number;
  project?: { id: number; name: string };
  tracker?: { id: number; name: string };
  status?: { id: number; name: string };
  priority?: { id: number; name: string };
  author?: { id: number; name: string };
  assigned_to?: { id: number; name: string };
  subject?: string;
  description?: string;
  created_on?: string;
  updated_on?: string;
  start_date?: string | null;
  custom_fields?: RedmineCustomField[];
  attachments?: RedmineAttachment[];
  journals?: RedmineJournal[];
}

export interface RedmineCustomField {
  id: number;
  name: string;
  value: string | string[] | null;
}

export interface RedmineAttachment {
  id: number;
  filename: string;
  filesize: number;
  content_url: string;
  content_type?: string;
  author?: { id: number; name: string };
  created_on?: string;
}

export interface RedmineJournalDetail {
  property: string;
  name: string;
  old_value: string | null;
  new_value: string | null;
}

export interface RedmineJournal {
  id: number;
  user?: { id: number; name: string };
  notes?: string;
  created_on?: string;
  details?: RedmineJournalDetail[];
}
