/**
 * Spec YAML Backward Compatibility Tests
 *
 * Regression tests that verify existing spec.yaml files (written before
 * forced quoting changes) can still be parsed successfully.
 *
 * Ensures safeYamlLoad handles both old (unquoted) and new (force-quoted)
 * YAML without errors.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { safeYamlLoad } from '@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js';
import { SpecYamlParserService } from '@/infrastructure/services/spec/spec-yaml-parser.service.js';

describe('Spec YAML Backward Compatibility', () => {
  const projectRoot = join(__dirname, '../../..');
  const specsDir = join(projectRoot, 'specs');

  it('should find spec.yaml files in specs/ directory', () => {
    // Ensure specs directory exists
    expect(existsSync(specsDir)).toBe(true);

    // Find all spec directories
    const specDirs = readdirSync(specsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    expect(specDirs.length).toBeGreaterThan(0);
  });

  it('should parse all existing spec.yaml files without errors', () => {
    // Skip if specs directory doesn't exist (CI environments without specs)
    if (!existsSync(specsDir)) {
      console.warn('Specs directory not found, skipping backward compatibility test');
      return;
    }

    const specDirs = readdirSync(specsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    const results: { dir: string; success: boolean; error?: string }[] = [];

    for (const dirName of specDirs) {
      const specPath = join(specsDir, dirName, 'spec.yaml');

      // Skip if spec.yaml doesn't exist in this directory
      if (!existsSync(specPath)) {
        continue;
      }

      try {
        const content = readFileSync(specPath, 'utf-8');
        const parsed = safeYamlLoad(content);

        // Verify parsed result is an object
        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe('object');

        results.push({ dir: dirName, success: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({ dir: dirName, success: false, error: errorMessage });
      }
    }

    // Verify at least one spec.yaml was found and parsed
    expect(results.length).toBeGreaterThan(0);

    // Report failures if any
    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      const failureReport = failures.map((f) => `  - ${f.dir}: ${f.error}`).join('\n');
      throw new Error(`Failed to parse ${failures.length} spec.yaml files:\n${failureReport}`);
    }

    // All spec.yaml files should parse successfully
    expect(failures).toHaveLength(0);
  });

  it('should validate current feature spec.yaml against schema', () => {
    // This test focuses on the current feature (071) to ensure the new
    // safeYamlDump changes produce valid YAML. Older specs may use
    // outdated schemas and are covered by the parse-only test above.
    const currentSpecPath = join(specsDir, '071-fix-spec-yaml-generation', 'spec.yaml');

    // Skip if current spec doesn't exist
    if (!existsSync(currentSpecPath)) {
      console.warn('Current spec not found, skipping schema validation test');
      return;
    }

    const content = readFileSync(currentSpecPath, 'utf-8');

    // parseSpecYaml throws on validation failure
    let parsed: unknown;
    try {
      parsed = new SpecYamlParserService().parseSpecYaml(content);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Current spec.yaml failed validation: ${errorMessage}`);
    }

    // Current spec should parse successfully and return an object
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');
  });

  it('should handle spec.yaml files with various quoting styles', () => {
    // Test safeYamlLoad with different quoting styles
    const unquotedYaml = `name: Test Feature
oneLiner: A simple test
summary: Summary text without quotes
phase: implementation
sizeEstimate: S
content: Content without quotes
technologies:
  - TypeScript
openQuestions: []
`;

    const quotedYaml = `name: "Test Feature"
oneLiner: "A simple test"
summary: "Summary text with quotes"
phase: "implementation"
sizeEstimate: "S"
content: "Content with quotes"
technologies:
  - "TypeScript"
openQuestions: []
`;

    const mixedYaml = `name: "Test Feature"
oneLiner: A mixed approach
summary: "Some quoted, some not"
phase: implementation
sizeEstimate: "S"
content: Content without quotes
technologies:
  - TypeScript
  - "React"
openQuestions: []
`;

    // All styles should parse successfully
    const unquotedParsed = safeYamlLoad(unquotedYaml) as Record<string, unknown>;
    expect(unquotedParsed).toBeDefined();
    expect(unquotedParsed.name).toBe('Test Feature');

    const quotedParsed = safeYamlLoad(quotedYaml) as Record<string, unknown>;
    expect(quotedParsed).toBeDefined();
    expect(quotedParsed.name).toBe('Test Feature');

    const mixedParsed = safeYamlLoad(mixedYaml) as Record<string, unknown>;
    expect(mixedParsed).toBeDefined();
    expect(mixedParsed.name).toBe('Test Feature');
    expect((mixedParsed.technologies as string[]).includes('TypeScript')).toBe(true);
    expect((mixedParsed.technologies as string[]).includes('React')).toBe(true);
  });
});
