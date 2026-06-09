/**
 * JVM parser — Maven (pom.xml) + Gradle (build.gradle / .gradle.kts).
 *
 * pom.xml uses a tag-balanced regex (XML parsing intentionally avoided to
 * keep the domain layer dependency-free). Gradle parses `dependencies {}`
 * blocks with literal coordinate strings — variable-resolved coordinates
 * are silently skipped (acceptable — settings.gradle resolution belongs
 * to a future build-graph adapter).
 */

import type { ManifestParserDescriptor, ManifestComponentDraft } from './parser-types';
import { buildPurl, pathEndsWith } from './parser-types';

const POM_DEPENDENCY = /<dependency>([\s\S]*?)<\/dependency>/g;
const POM_TAG = (name: string): RegExp => new RegExp(`<${name}>([^<]+)</${name}>`);

export const mavenPomParser: ManifestParserDescriptor = {
  id: 'parser.jvm.maven-pom',
  matches: (path) => pathEndsWith(path, 'pom.xml'),
  parse: (file) => {
    const drafts: ManifestComponentDraft[] = [];
    POM_DEPENDENCY.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = POM_DEPENDENCY.exec(file.content)) !== null) {
      const body = m[1]!;
      const groupId = POM_TAG('groupId').exec(body)?.[1]?.trim();
      const artifactId = POM_TAG('artifactId').exec(body)?.[1]?.trim();
      const version = POM_TAG('version').exec(body)?.[1]?.trim();
      if (!groupId || !artifactId) continue;
      const name = `${groupId}:${artifactId}`;
      drafts.push({
        ecosystem: 'maven',
        name,
        version,
        purl: buildPurl('maven', name.replace(':', '/'), version),
        type: 'library',
      });
    }
    return drafts;
  },
};

const GRADLE_COORD =
  /(?:implementation|api|compile|testImplementation|runtimeOnly|annotationProcessor)\s*\(?\s*["']([^:"']+):([^:"']+):([^"']+)["']\s*\)?/g;

export const gradleParser: ManifestParserDescriptor = {
  id: 'parser.jvm.gradle',
  matches: (path) => pathEndsWith(path, 'build.gradle') || pathEndsWith(path, 'build.gradle.kts'),
  parse: (file) => {
    const drafts: ManifestComponentDraft[] = [];
    GRADLE_COORD.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = GRADLE_COORD.exec(file.content)) !== null) {
      const groupId = m[1]!;
      const artifactId = m[2]!;
      const version = m[3]!;
      const name = `${groupId}:${artifactId}`;
      drafts.push({
        ecosystem: 'maven',
        name,
        version,
        purl: buildPurl('maven', name.replace(':', '/'), version),
        type: 'library',
      });
    }
    return drafts;
  },
};
