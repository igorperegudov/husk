import type { Skill } from './types';

/** Minimal shape of the generated OpenAPI document (kept dependency-free). */
export type OpenApiDocument = Record<string, unknown>;

export interface OpenApiOptions {
  title?: string;
  version?: string;
  description?: string;
  /** Optional server base URL advertised in the spec. */
  serverUrl?: string;
}

function requestBodyFor(skill: Skill): Record<string, unknown> | undefined {
  const { input, inputMime } = skill.manifest;
  if (input === 'none') {
    return undefined;
  }
  if (input === 'file') {
    const content: Record<string, unknown> = {
      'multipart/form-data': {
        schema: {
          type: 'object',
          properties: {
            file: { type: 'string', format: 'binary', description: 'The input file.' },
            text: { type: 'string', description: 'Optional text sent alongside the file.' },
          },
        },
      },
    };
    // Also advertise the raw-body MIME, but never let it collide with the
    // structured multipart entry above: when input_mime is itself
    // `multipart/form-data`, a duplicate object key would silently drop the
    // documented file/text schema (last key wins).
    const rawMime = inputMime && inputMime !== 'none' ? inputMime : 'application/octet-stream';
    if (rawMime !== 'multipart/form-data') {
      content[rawMime] = { schema: { type: 'string', format: 'binary' } };
    }
    return { required: true, content };
  }
  return {
    required: true,
    content: {
      'text/plain': { schema: { type: 'string' } },
      'application/json': {
        schema: {
          type: 'object',
          properties: { input: { type: 'string' } },
        },
      },
    },
  };
}

function successResponseFor(skill: Skill): Record<string, unknown> {
  const { output, outputMime } = skill.manifest;
  if (output === 'file') {
    return {
      description: 'The file produced by the skill.',
      content: {
        [outputMime ?? 'application/octet-stream']: {
          schema: { type: 'string', format: 'binary' },
        },
      },
    };
  }
  if (output === 'json') {
    return {
      description: 'The skill result as JSON.',
      content: { 'application/json': { schema: {} } },
    };
  }
  return {
    description: 'The skill result as text.',
    content: { 'text/plain': { schema: { type: 'string' } } },
  };
}

const ERROR_RESPONSE = {
  description: 'The skill failed or the request was invalid.',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          stderr: { type: 'string' },
          exitCode: { type: 'integer', nullable: true },
        },
      },
    },
  },
};

/** Build an OpenAPI 3.1 document describing every skill's invoke endpoint. */
export function generateOpenApi(skills: Skill[], options: OpenApiOptions = {}): OpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const skill of skills) {
    const operation: Record<string, unknown> = {
      operationId: skill.slug,
      summary: skill.manifest.name,
      description: skill.manifest.description,
      tags: ['skills'],
      responses: {
        '200': successResponseFor(skill),
        '400': ERROR_RESPONSE,
        '500': ERROR_RESPONSE,
      },
    };
    const body = requestBodyFor(skill);
    if (body) {
      operation.requestBody = body;
    }
    const route = (paths[skill.manifest.route] ??= {});
    route[skill.manifest.method.toLowerCase()] = operation;
  }

  const doc: OpenApiDocument = {
    openapi: '3.1.0',
    info: {
      title: options.title ?? 'HUSK skills',
      version: options.version ?? '0.1.0',
      description: options.description ?? 'Agent skills served over HTTP by HUSK.',
    },
    paths,
  };
  if (options.serverUrl) {
    doc.servers = [{ url: options.serverUrl }];
  }
  return doc;
}
