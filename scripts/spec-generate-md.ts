import yaml from 'js-yaml';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SUPPORTED_ARTIFACT_TYPES = ['feature', 'research', 'plan', 'tasks'] as const;
type ArtifactType = (typeof SUPPORTED_ARTIFACT_TYPES)[number];
type YamlData = Record<string, unknown>;

/**
 * Parse a YAML file and return the parsed object.
 */
export function parseYamlFile(filePath: string): YamlData {
  const content = readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(content);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Invalid YAML content in ${filePath}`);
  }
  return parsed as YamlData;
}

/**
 * Generate Markdown from a YAML spec file.
 * Returns the content body directly (no frontmatter).
 */
export function generateMarkdownFromYaml(yamlPath: string, artifactType: string): string {
  if (!SUPPORTED_ARTIFACT_TYPES.includes(artifactType as ArtifactType)) {
    throw new Error(
      `Unsupported artifact type: ${artifactType}. Supported: ${SUPPORTED_ARTIFACT_TYPES.join(', ')}`
    );
  }

  const data = parseYamlFile(yamlPath);

  if (!data.content) {
    throw new Error(`The content field is required in ${yamlPath}`);
  }

  return String(data.content);
}

const ARTIFACT_TYPE_TO_FILENAME: Record<ArtifactType, string> = {
  feature: 'spec',
  research: 'research',
  plan: 'plan',
  tasks: 'tasks',
};

// CLI entry point

if (typeof process !== 'undefined' && process.argv[1]?.includes('spec-generate-md')) {
  const args = process.argv.slice(2);
  const featureDir = args[0];
  if (!featureDir) {
    console.error('Usage: spec-generate-md <feature-dir>');
    process.exit(1);
  }

  for (const type of SUPPORTED_ARTIFACT_TYPES) {
    const yamlPath = join(featureDir, `${ARTIFACT_TYPE_TO_FILENAME[type]}.yaml`);
    if (existsSync(yamlPath)) {
      const md = generateMarkdownFromYaml(yamlPath, type);
      const mdPath = yamlPath.replace(/\.yaml$/, '.md');
      writeFileSync(mdPath, md, 'utf-8');
      console.log(`Generated: ${mdPath}`);
    }
  }
}
