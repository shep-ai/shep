/**
 * Aggregated parser registry. Order is stable so callers can iterate
 * deterministically without sorting.
 */

import { npmPackageLockParser, npmPackageJsonParser } from './npm-parser';
import {
  pythonRequirementsParser,
  pythonPipfileLockParser,
  pythonPyprojectParser,
} from './python-parser';
import { goModParser } from './go-parser';
import { cargoLockParser, cargoTomlParser } from './rust-parser';
import { mavenPomParser, gradleParser } from './jvm-parser';
import { gemfileLockParser, gemfileParser } from './ruby-parser';
import { composerLockParser, composerJsonParser } from './php-parser';
import { csprojParser, packagesLockParser } from './dotnet-parser';
import { dockerfileParser, dockerComposeParser } from './container-parser';
import { terraformParser, kubernetesParser, githubActionsParser } from './iac-parser';
import type { ManifestParserDescriptor } from './parser-types';

export const MANIFEST_PARSERS: readonly ManifestParserDescriptor[] = [
  npmPackageLockParser,
  npmPackageJsonParser,
  pythonRequirementsParser,
  pythonPipfileLockParser,
  pythonPyprojectParser,
  goModParser,
  cargoLockParser,
  cargoTomlParser,
  mavenPomParser,
  gradleParser,
  gemfileLockParser,
  gemfileParser,
  composerLockParser,
  composerJsonParser,
  csprojParser,
  packagesLockParser,
  dockerfileParser,
  dockerComposeParser,
  terraformParser,
  kubernetesParser,
  githubActionsParser,
];

export * from './parser-types';
