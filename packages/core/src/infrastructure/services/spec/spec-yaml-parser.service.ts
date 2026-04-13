/**
 * Spec YAML Parser Service
 *
 * Parses raw YAML strings from spec artifact files into their TypeSpec-generated types.
 * Uses AJV with the generated JSON Schema files for validation, then casts directly
 * to the TypeScript types — no manual field-by-field extraction needed.
 *
 * Lives in the infrastructure layer because it touches node:fs / node:path /
 * node:url / node:crypto and owns the Ajv instance. Application-layer consumers
 * depend on the ISpecArtifactParser port instead of importing this directly.
 */

import { injectable } from 'tsyringe';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  FeatureArtifact,
  ResearchArtifact,
  TechnicalPlanArtifact,
  TasksArtifact,
  FeatureStatus,
} from '../../../domain/generated/output.js';
import type { ISpecArtifactParser } from '../../../application/ports/output/services/spec-artifact-parser.interface.js';

/** Resolve the apis/json-schema directory relative to the package root */
function resolveSchemaDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  let dir = currentDir;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, 'apis', 'json-schema');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not find apis/json-schema directory (searched from ${currentDir})`);
}

/** Recursively strip null values from an object (YAML null → absent key for JSON Schema) */
function stripNulls(obj: unknown): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== null && value !== undefined) {
        result[key] = stripNulls(value);
      }
    }
    return result;
  }
  return obj;
}

/** Inject default BaseEntity fields if missing */
function injectBaseEntityDefaults(data: Record<string, unknown>): void {
  const now = new Date().toISOString();
  data.id ??= randomUUID();
  data.createdAt ??= now;
  data.updatedAt ??= now;
}

@injectable()
export class SpecYamlParserService implements ISpecArtifactParser {
  private readonly ajv: Ajv2020;

  constructor() {
    this.ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(this.ajv);
    const schemaDir = resolveSchemaDir();
    const files = readdirSync(schemaDir).filter((f) => f.endsWith('.yaml'));

    for (const file of files) {
      const content = readFileSync(join(schemaDir, file), 'utf-8');
      const schema = yaml.load(content) as Record<string, unknown>;
      this.ajv.addSchema(schema, schema.$id as string);
    }
  }

  private validateSchema<T>(schemaId: string, data: unknown): T {
    const validate = this.ajv.getSchema(schemaId);
    if (!validate) {
      throw new Error(`Schema not found: ${schemaId}`);
    }
    if (!validate(data)) {
      const errors = validate.errors
        ?.map((e: { instancePath: string; message?: string }) => `${e.instancePath} ${e.message}`)
        .join('; ');
      throw new Error(`Validation failed for ${schemaId}: ${errors}`);
    }
    return data as T;
  }

  parseSpecYaml(content: string): FeatureArtifact {
    const raw = stripNulls(yaml.load(content)) as Record<string, unknown>;
    injectBaseEntityDefaults(raw);
    return this.validateSchema<FeatureArtifact>('FeatureArtifact.yaml', raw);
  }

  parseResearchYaml(content: string): ResearchArtifact {
    const raw = stripNulls(yaml.load(content)) as Record<string, unknown>;
    injectBaseEntityDefaults(raw);
    return this.validateSchema<ResearchArtifact>('ResearchArtifact.yaml', raw);
  }

  parsePlanYaml(content: string): TechnicalPlanArtifact {
    const raw = stripNulls(yaml.load(content)) as Record<string, unknown>;
    injectBaseEntityDefaults(raw);
    return this.validateSchema<TechnicalPlanArtifact>('TechnicalPlanArtifact.yaml', raw);
  }

  parseTasksYaml(content: string): TasksArtifact {
    const raw = stripNulls(yaml.load(content)) as Record<string, unknown>;
    injectBaseEntityDefaults(raw);
    return this.validateSchema<TasksArtifact>('TasksArtifact.yaml', raw);
  }

  parseFeatureStatusYaml(content: string): FeatureStatus {
    const raw = stripNulls(yaml.load(content)) as Record<string, unknown>;
    injectBaseEntityDefaults(raw);
    return this.validateSchema<FeatureStatus>('FeatureStatus.yaml', raw);
  }
}
