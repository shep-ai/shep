import { describe, it, expect } from 'vitest';
import { buildSbom } from '@/domain/aspm/scan/sbom-builder';
import { MANIFEST_PARSERS } from '@/domain/aspm/scan/manifest-parsers';
import {
  dockerfileParser,
  dockerComposeParser,
} from '@/domain/aspm/scan/manifest-parsers/container-parser';
import {
  terraformParser,
  kubernetesParser,
  githubActionsParser,
} from '@/domain/aspm/scan/manifest-parsers/iac-parser';
import { npmPackageLockParser } from '@/domain/aspm/scan/manifest-parsers/npm-parser';
import {
  pythonRequirementsParser,
  pythonPyprojectParser,
} from '@/domain/aspm/scan/manifest-parsers/python-parser';
import { goModParser } from '@/domain/aspm/scan/manifest-parsers/go-parser';
import { cargoLockParser } from '@/domain/aspm/scan/manifest-parsers/rust-parser';
import { mavenPomParser, gradleParser } from '@/domain/aspm/scan/manifest-parsers/jvm-parser';
import { gemfileLockParser } from '@/domain/aspm/scan/manifest-parsers/ruby-parser';
import { composerLockParser } from '@/domain/aspm/scan/manifest-parsers/php-parser';
import { csprojParser } from '@/domain/aspm/scan/manifest-parsers/dotnet-parser';

function f(path: string, content: string) {
  return { path, content };
}

describe('Manifest parser registry', () => {
  it('registers at least 9 distinct ecosystems', () => {
    const ecosystems = new Set(MANIFEST_PARSERS.map((p) => p.id.split('.')[1]));
    expect(ecosystems.size).toBeGreaterThanOrEqual(9);
  });
});

describe('npm package-lock parser', () => {
  it('extracts components with versions', () => {
    const drafts = npmPackageLockParser.parse(
      f(
        'package-lock.json',
        JSON.stringify({
          packages: {
            '': { name: 'root', version: '1.0.0' },
            'node_modules/lodash': { name: 'lodash', version: '4.17.21' },
            'node_modules/react': { name: 'react', version: '18.2.0' },
          },
        })
      )
    );
    expect(drafts.map((d) => ({ name: d.name, version: d.version }))).toEqual([
      { name: 'lodash', version: '4.17.21' },
      { name: 'react', version: '18.2.0' },
    ]);
    expect(drafts[0]!.purl).toBe('pkg:npm/lodash@4.17.21');
  });
});

describe('python parsers', () => {
  it('parses requirements.txt with version specifiers', () => {
    const drafts = pythonRequirementsParser.parse(
      f(
        'requirements.txt',
        ['# comment', '', 'requests==2.31.0', 'numpy>=1.20.0', 'flask'].join('\n')
      )
    );
    expect(drafts).toHaveLength(3);
    expect(drafts.map((d) => d.name)).toEqual(['requests', 'numpy', 'flask']);
  });

  it('parses pyproject.toml poetry dependencies', () => {
    const drafts = pythonPyprojectParser.parse(
      f(
        'pyproject.toml',
        [
          '[tool.poetry.dependencies]',
          'python = "^3.10"',
          'requests = "^2.31.0"',
          'django = "4.2"',
        ].join('\n')
      )
    );
    expect(drafts.map((d) => d.name)).toEqual(['requests', 'django']);
  });
});

describe('go parser', () => {
  it('extracts require block entries', () => {
    const drafts = goModParser.parse(
      f(
        'go.mod',
        [
          'module example.com/m',
          'go 1.21',
          'require (',
          '\tgithub.com/spf13/cobra v1.7.0',
          '\tgolang.org/x/sys v0.10.0 // indirect',
          ')',
        ].join('\n')
      )
    );
    expect(drafts).toHaveLength(2);
    expect(drafts[0]!.purl).toBe('pkg:golang/github.com/spf13/cobra@v1.7.0');
  });
});

describe('rust parser', () => {
  it('extracts packages from Cargo.lock', () => {
    const drafts = cargoLockParser.parse(
      f(
        'Cargo.lock',
        '[[package]]\nname = "serde"\nversion = "1.0.180"\n\n[[package]]\nname = "tokio"\nversion = "1.32.0"\n'
      )
    );
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.name).sort()).toEqual(['serde', 'tokio']);
  });
});

describe('jvm parsers', () => {
  it('parses Maven pom.xml dependencies', () => {
    const drafts = mavenPomParser.parse(
      f(
        'pom.xml',
        `<project>
          <dependencies>
            <dependency>
              <groupId>org.springframework</groupId>
              <artifactId>spring-core</artifactId>
              <version>6.0.10</version>
            </dependency>
          </dependencies>
        </project>`
      )
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      name: 'org.springframework:spring-core',
      version: '6.0.10',
      ecosystem: 'maven',
    });
  });

  it('parses Gradle coordinate strings', () => {
    const drafts = gradleParser.parse(
      f(
        'build.gradle',
        `dependencies {\n  implementation "org.apache.commons:commons-lang3:3.13.0"\n}`
      )
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.name).toBe('org.apache.commons:commons-lang3');
  });
});

describe('ruby parser', () => {
  it('extracts gems from Gemfile.lock', () => {
    const drafts = gemfileLockParser.parse(
      f('Gemfile.lock', `GEM\n  specs:\n    rails (7.0.4)\n    rack (2.2.6)\n`)
    );
    expect(drafts).toHaveLength(2);
    expect(drafts[0]!.name).toBe('rails');
  });
});

describe('php parser', () => {
  it('extracts packages from composer.lock', () => {
    const drafts = composerLockParser.parse(
      f(
        'composer.lock',
        JSON.stringify({ packages: [{ name: 'symfony/console', version: '6.3.0' }] })
      )
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.purl).toBe('pkg:composer/symfony/console@6.3.0');
  });
});

describe('dotnet parser', () => {
  it('extracts PackageReference entries from .csproj', () => {
    const drafts = csprojParser.parse(
      f(
        'app.csproj',
        `<Project>
          <ItemGroup>
            <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
          </ItemGroup>
        </Project>`
      )
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ name: 'Newtonsoft.Json', version: '13.0.3' });
  });
});

describe('container parser (Dockerfile)', () => {
  it('extracts FROM lines from multi-stage builds', () => {
    const drafts = dockerfileParser.parse(
      f(
        'Dockerfile',
        [
          'FROM node:20-alpine AS build',
          'COPY . .',
          'FROM nginx:1.25-alpine',
          'COPY --from=build /app /',
        ].join('\n')
      )
    );
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => `${d.name}:${d.version}`)).toEqual([
      'node:20-alpine',
      'nginx:1.25-alpine',
    ]);
  });

  it('ignores `FROM scratch`', () => {
    const drafts = dockerfileParser.parse(f('Dockerfile', 'FROM scratch'));
    expect(drafts).toEqual([]);
  });

  it('parses docker-compose image lines', () => {
    const drafts = dockerComposeParser.parse(
      f(
        'docker-compose.yml',
        `services:\n  web:\n    image: postgres:15.3\n  cache:\n    image: redis:7\n`
      )
    );
    expect(drafts).toHaveLength(2);
  });
});

describe('iac parser (terraform / k8s / GHA)', () => {
  it('extracts Terraform required_providers with versions', () => {
    const drafts = terraformParser.parse(
      f(
        'main.tf',
        `terraform {\n  required_providers {\n    aws = {\n      source = "hashicorp/aws"\n      version = "~> 5.0"\n    }\n  }\n}`
      )
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      name: 'hashicorp/aws',
      version: '5.0',
      ecosystem: 'terraform',
    });
  });

  it('extracts Kubernetes container images from apiVersion-marked YAML', () => {
    const drafts = kubernetesParser.parse(
      f(
        'deploy.yaml',
        `apiVersion: apps/v1\nkind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n        - name: api\n          image: ghcr.io/example/api:1.2.3\n`
      )
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.name).toBe('ghcr.io/example/api');
  });

  it('skips YAML files without apiVersion (avoids false positives on arbitrary YAML)', () => {
    const drafts = kubernetesParser.parse(f('config.yaml', `db:\n  image: redis:7\n`));
    expect(drafts).toEqual([]);
  });

  it('extracts GitHub Actions `uses:` entries', () => {
    const drafts = githubActionsParser.parse(
      f(
        '.github/workflows/ci.yml',
        `jobs:\n  build:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v3\n`
      )
    );
    expect(drafts).toHaveLength(2);
    expect(drafts[0]!.name).toBe('actions/checkout');
    expect(drafts[0]!.version).toBe('v4');
  });
});

describe('buildSbom — merges multi-ecosystem repos', () => {
  it('combines npm + python components with stable dedup', () => {
    const result = buildSbom([
      f(
        'package-lock.json',
        JSON.stringify({
          packages: { 'node_modules/lodash': { name: 'lodash', version: '4.17.21' } },
        })
      ),
      f('requirements.txt', 'requests==2.31.0'),
    ]);
    expect(result.components.map((c) => c.name).sort()).toEqual(['lodash', 'requests']);
  });

  it('dedupes the same component appearing in multiple files', () => {
    const result = buildSbom([
      f(
        'a/package-lock.json',
        JSON.stringify({
          packages: { 'node_modules/lodash': { name: 'lodash', version: '4.17.21' } },
        })
      ),
      f(
        'b/package-lock.json',
        JSON.stringify({
          packages: { 'node_modules/lodash': { name: 'lodash', version: '4.17.21' } },
        })
      ),
    ]);
    expect(result.components).toHaveLength(1);
  });

  it('returns stats per parser that matched at least one file', () => {
    const result = buildSbom([f('requirements.txt', 'requests==2.31.0')]);
    expect(result.parsersInvoked.map((p) => p.parserId)).toEqual(['parser.python.requirements']);
  });
});
