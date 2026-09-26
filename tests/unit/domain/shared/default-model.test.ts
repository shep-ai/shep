import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { DEFAULT_MODEL_ID } from '@/domain/shared/default-model.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';

describe('DEFAULT_MODEL_ID', () => {
  it('is Claude Opus 5.5', () => {
    expect(DEFAULT_MODEL_ID).toBe('claude-opus-5-5');
  });

  it('is the model new settings start with', () => {
    expect(createDefaultSettings().models.default).toBe(DEFAULT_MODEL_ID);
  });

  it('matches the TypeSpec default emitted to the JSON schema', () => {
    // TypeSpec defaults must be literals, so this pins the generated schema to
    // the constant: changing one without the other fails here.
    const schemaPath = resolve(process.cwd(), 'apis/json-schema/ModelConfiguration.yaml');
    const schema = yaml.load(readFileSync(schemaPath, 'utf8')) as {
      properties: { default: { default: string } };
    };
    expect(schema.properties.default.default).toBe(DEFAULT_MODEL_ID);
  });
});
