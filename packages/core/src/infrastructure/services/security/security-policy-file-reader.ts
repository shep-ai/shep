/**
 * Security Policy File Reader
 *
 * Reads and parses shep.security.yaml from a repository root using js-yaml.
 * Returns the parsed object or null if the file does not exist.
 * Throws with actionable messages on YAML syntax errors.
 *
 * Uses DEFAULT_SCHEMA to prevent arbitrary code execution from YAML tags.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import type { SupplyChainSecurityPolicy } from '../../../domain/generated/output.js';

/**
 * The filename for the security policy file at the repository root.
 */
export const SECURITY_POLICY_FILENAME = 'shep.security.yaml';

/**
 * Reads and parses the security policy YAML file from a repository.
 */
export class SupplyChainSecurityPolicyFileReader {
  /**
   * Read and parse the security policy file from the given repository path.
   *
   * @param repositoryPath - Absolute path to the repository root
   * @returns Parsed policy object, or null if file does not exist or is empty
   * @throws Error with actionable message if YAML is malformed
   */
  async read(repositoryPath: string): Promise<Partial<SupplyChainSecurityPolicy> | null> {
    const filePath = join(repositoryPath, SECURITY_POLICY_FILENAME);

    if (!existsSync(filePath)) {
      return null;
    }

    const content = readFileSync(filePath, 'utf-8');

    try {
      const parsed = yaml.load(content, {
        schema: yaml.DEFAULT_SCHEMA,
        filename: SECURITY_POLICY_FILENAME,
      });

      // Empty file or comment-only file yields null/undefined
      if (parsed == null || typeof parsed !== 'object') {
        return null;
      }

      return parsed as Partial<SupplyChainSecurityPolicy>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse ${SECURITY_POLICY_FILENAME}: ${message}`);
    }
  }
}

/** @alias SupplyChainSecurityPolicyFileReader — kept for backwards compat */
export const SecurityPolicyFileReader = SupplyChainSecurityPolicyFileReader;
export type SecurityPolicyFileReader = SupplyChainSecurityPolicyFileReader;
