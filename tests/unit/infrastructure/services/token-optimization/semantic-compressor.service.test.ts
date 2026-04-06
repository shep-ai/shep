/**
 * SemanticCompressorService Unit Tests
 *
 * Tests for rule-based caveman compression of non-code prompt sections.
 * The compressor removes articles, filler words, shortens common phrases,
 * collapses whitespace, and abbreviates technical terms — while preserving
 * code blocks, file paths, URLs, YAML/JSON content, and quoted strings.
 *
 * TDD Phase: RED
 */

import { describe, it, expect } from 'vitest';
import { SemanticCompressorService } from '@/infrastructure/services/token-optimization/semantic-compressor.service.js';

describe('SemanticCompressorService', () => {
  const service = new SemanticCompressorService();

  // --- Empty / no-op cases ---

  describe('empty and no-op inputs', () => {
    it('should return empty string with ratio 1.0 for empty input', () => {
      const result = service.compress('');
      expect(result.compressed).toBe('');
      expect(result.compressionRatio).toBe(1.0);
    });

    it('should return unchanged text for text with nothing to compress', () => {
      const input = 'fix bug';
      const result = service.compress(input);
      expect(result.compressed).toBe(input);
    });
  });

  // --- Article removal ---

  describe('article removal', () => {
    it('should remove "the" from instruction text', () => {
      const input = 'Review the code in the repository';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/\bthe\b/i);
      expect(result.compressed).toContain('code');
      expect(result.compressed).toContain('repo');
    });

    it('should remove "a" as an article from instruction text', () => {
      const input = 'Create a new file in a directory';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/\ba\b/);
      expect(result.compressed).toContain('new file');
      expect(result.compressed).toContain('dir');
    });

    it('should remove "an" from instruction text', () => {
      const input = 'This is an example of an approach';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/\ban\b/i);
      expect(result.compressed).toContain('example');
    });

    it('should handle articles at the start of a sentence', () => {
      const input = 'The system must handle errors. A test should pass.';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/\bThe\b/);
      expect(result.compressed).not.toMatch(/\bA\s+test\b/);
    });
  });

  // --- Filler word removal ---

  describe('filler word removal', () => {
    it('should remove "just" from instruction text', () => {
      const input = 'You should just run the tests';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/\bjust\b/i);
    });

    it('should remove "simply" from instruction text', () => {
      const input = 'Simply add the import statement';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/\bsimply\b/i);
    });

    it('should remove "basically" from instruction text', () => {
      const input = 'This basically means the test passes';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/\bbasically\b/i);
    });

    it('should remove "actually" from instruction text', () => {
      const input = 'The function actually returns a number';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/\bactually\b/i);
    });

    it('should remove "really" from instruction text', () => {
      const input = 'This is really important to check';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/\breally\b/i);
    });

    it('should remove "currently" from instruction text', () => {
      const input = 'The system currently supports three modes';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/\bcurrently\b/i);
    });

    it('should remove multiple filler words in one pass', () => {
      const input = 'You should just simply actually run the test';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/\bjust\b/i);
      expect(result.compressed).not.toMatch(/\bsimply\b/i);
      expect(result.compressed).not.toMatch(/\bactually\b/i);
    });
  });

  // --- Phrase shortening ---

  describe('phrase shortening', () => {
    it('should shorten "you must" to "must"', () => {
      const input = 'You must validate the input';
      const result = service.compress(input);
      expect(result.compressed).toMatch(/\bmust\b/);
      expect(result.compressed).not.toMatch(/\byou must\b/i);
    });

    it('should shorten "make sure to" to "ensure"', () => {
      const input = 'Make sure to check for errors';
      const result = service.compress(input);
      expect(result.compressed).toContain('ensure');
      expect(result.compressed).not.toMatch(/make sure to/i);
    });

    it('should shorten "in order to" to "to"', () => {
      const input = 'In order to fix the bug, add a check';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/in order to/i);
    });

    it('should shorten "as well as" to "and"', () => {
      const input = 'Check types as well as values';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/as well as/i);
      expect(result.compressed).toContain('and');
    });

    it('should shorten "due to the fact that" to "because"', () => {
      const input = 'This fails due to the fact that the input is null';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/due to the fact that/i);
      expect(result.compressed).toContain('because');
    });

    it('should shorten "it is important to" to "important:"', () => {
      const input = 'It is important to validate inputs';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/it is important to/i);
    });

    it('should shorten "please note that" to "note:"', () => {
      const input = 'Please note that this is required';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/please note that/i);
    });

    it('should shorten "in addition to" to "besides"', () => {
      const input = 'In addition to tests, add docs';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/in addition to/i);
    });

    it('should shorten "at this point" to "now"', () => {
      const input = 'At this point the code is ready';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/at this point/i);
      expect(result.compressed).toContain('now');
    });

    it('should shorten "a number of" to "several"', () => {
      const input = 'There are a number of options';
      const result = service.compress(input);
      expect(result.compressed).not.toMatch(/a number of/i);
      expect(result.compressed).toContain('several');
    });
  });

  // --- Whitespace collapsing ---

  describe('whitespace collapsing', () => {
    it('should collapse multiple blank lines to a single blank line', () => {
      const input = 'Line one.\n\n\n\n\nLine two.';
      const result = service.compress(input);
      expect(result.compressed).not.toContain('\n\n\n');
      expect(result.compressed).toContain('Line one.');
      expect(result.compressed).toContain('Line two.');
    });

    it('should collapse multiple spaces within a line to single space', () => {
      const input = 'Check   the   code   here';
      const result = service.compress(input);
      expect(result.compressed).not.toContain('  ');
    });

    it('should preserve single blank lines between paragraphs', () => {
      const input = 'First paragraph.\n\nSecond paragraph.';
      const result = service.compress(input);
      expect(result.compressed).toContain('\n\n');
    });
  });

  // --- Technical term abbreviation ---

  describe('technical term abbreviation', () => {
    it('should abbreviate "repository" to "repo"', () => {
      const input = 'Clone the repository locally';
      const result = service.compress(input);
      expect(result.compressed).toContain('repo');
      expect(result.compressed).not.toMatch(/\brepository\b/i);
    });

    it('should abbreviate "configuration" to "config"', () => {
      const input = 'Update the configuration file';
      const result = service.compress(input);
      expect(result.compressed).toContain('config');
      expect(result.compressed).not.toMatch(/\bconfiguration\b/i);
    });

    it('should abbreviate "implementation" to "impl"', () => {
      const input = 'Review the implementation details';
      const result = service.compress(input);
      expect(result.compressed).toContain('impl');
      expect(result.compressed).not.toMatch(/\bimplementation\b/i);
    });

    it('should abbreviate "specification" to "spec"', () => {
      const input = 'Read the specification document';
      const result = service.compress(input);
      expect(result.compressed).toContain('spec');
      expect(result.compressed).not.toMatch(/\bspecification\b/i);
    });

    it('should abbreviate "function" to "fn"', () => {
      const input = 'Create a new function for validation';
      const result = service.compress(input);
      expect(result.compressed).toContain('fn');
      expect(result.compressed).not.toMatch(/\bfunction\b/i);
    });

    it('should abbreviate "directory" to "dir"', () => {
      const input = 'Create the directory structure';
      const result = service.compress(input);
      expect(result.compressed).toContain('dir');
      expect(result.compressed).not.toMatch(/\bdirectory\b/i);
    });

    it('should abbreviate "environment" to "env"', () => {
      const input = 'Set up the environment variables';
      const result = service.compress(input);
      expect(result.compressed).toContain('env');
      expect(result.compressed).not.toMatch(/\benvironment\b/i);
    });

    it('should abbreviate "dependency" to "dep"', () => {
      const input = 'Install the dependency first';
      const result = service.compress(input);
      expect(result.compressed).toContain('dep');
      expect(result.compressed).not.toMatch(/\bdependency\b/i);
    });

    it('should abbreviate "dependencies" to "deps"', () => {
      const input = 'All dependencies are installed';
      const result = service.compress(input);
      expect(result.compressed).toContain('deps');
      expect(result.compressed).not.toMatch(/\bdependencies\b/i);
    });

    it('should abbreviate "application" to "app"', () => {
      const input = 'Start the application server';
      const result = service.compress(input);
      expect(result.compressed).toContain('app');
      expect(result.compressed).not.toMatch(/\bapplication\b/i);
    });
  });

  // --- Protected region: code blocks ---

  describe('code block preservation', () => {
    it('should NOT compress text inside fenced code blocks', () => {
      const input = [
        'Instructions for the task:',
        '```typescript',
        'const the = "article";',
        'function justDoIt() {',
        '  // simply return the value',
        '  return the;',
        '}',
        '```',
        'Make sure to review the code.',
      ].join('\n');

      const result = service.compress(input);

      // Code block content must be preserved exactly
      expect(result.compressed).toContain('const the = "article";');
      expect(result.compressed).toContain('function justDoIt()');
      expect(result.compressed).toContain('// simply return the value');
      expect(result.compressed).toContain('return the;');

      // Text outside code blocks should be compressed
      expect(result.compressed).not.toMatch(/Make sure to/);
    });

    it('should handle multiple code blocks', () => {
      const input = [
        'The first example:',
        '```',
        'const a = "the value";',
        '```',
        'And the second example:',
        '```',
        'function simply() {}',
        '```',
      ].join('\n');

      const result = service.compress(input);

      // Both code blocks preserved
      expect(result.compressed).toContain('const a = "the value";');
      expect(result.compressed).toContain('function simply() {}');
    });

    it('should preserve indented code blocks (4+ spaces)', () => {
      const input = [
        'Run the following command:',
        '',
        '    npm install the-package',
        '    npm run just-build',
        '',
        'Then check the output.',
      ].join('\n');

      const result = service.compress(input);

      expect(result.compressed).toContain('npm install the-package');
      expect(result.compressed).toContain('npm run just-build');
    });
  });

  // --- Protected region: file paths ---

  describe('file path preservation', () => {
    it('should NOT compress file paths like /src/foo/bar.ts', () => {
      const input = 'Edit the file at /src/infrastructure/services/the-service.ts';
      const result = service.compress(input);
      expect(result.compressed).toContain('/src/infrastructure/services/the-service.ts');
    });

    it('should NOT compress relative file paths like ./src/app.ts', () => {
      const input = 'Check ./src/application/the-use-case.ts for details';
      const result = service.compress(input);
      expect(result.compressed).toContain('./src/application/the-use-case.ts');
    });

    it('should NOT compress Windows-style paths', () => {
      const input = 'The file is at C:\\Users\\dev\\the-project\\configuration.ts';
      const result = service.compress(input);
      expect(result.compressed).toContain('C:\\Users\\dev\\the-project\\configuration.ts');
    });
  });

  // --- Protected region: URLs ---

  describe('URL preservation', () => {
    it('should NOT compress URLs', () => {
      const input = 'Visit https://example.com/the/configuration/repository for details';
      const result = service.compress(input);
      expect(result.compressed).toContain('https://example.com/the/configuration/repository');
    });

    it('should NOT compress HTTP URLs', () => {
      const input = 'See http://localhost:3000/api/the/implementation for docs';
      const result = service.compress(input);
      expect(result.compressed).toContain('http://localhost:3000/api/the/implementation');
    });
  });

  // --- Protected region: YAML/JSON content ---

  describe('YAML/JSON content preservation', () => {
    it('should NOT compress YAML blocks', () => {
      const input = [
        'The configuration:',
        '```yaml',
        'name: the-service',
        'description: "A simple configuration for the application"',
        'environment: production',
        '```',
        'Make sure to apply it.',
      ].join('\n');

      const result = service.compress(input);

      // YAML block should be preserved (it's inside a code fence)
      expect(result.compressed).toContain('name: the-service');
      expect(result.compressed).toContain(
        'description: "A simple configuration for the application"'
      );
      expect(result.compressed).toContain('environment: production');
    });

    it('should NOT compress inline JSON objects', () => {
      const input = 'Send the payload: {"the": "value", "configuration": "test"}';
      const result = service.compress(input);
      expect(result.compressed).toContain('{"the": "value", "configuration": "test"}');
    });
  });

  // --- Protected region: quoted strings ---

  describe('quoted string preservation', () => {
    it('should NOT compress double-quoted strings', () => {
      const input = 'Set the value to "the repository configuration" in settings';
      const result = service.compress(input);
      expect(result.compressed).toContain('"the repository configuration"');
    });

    it('should NOT compress single-quoted strings', () => {
      const input = "Use the name 'the-implementation-service' for it";
      const result = service.compress(input);
      expect(result.compressed).toContain("'the-implementation-service'");
    });

    it('should NOT compress backtick-quoted strings', () => {
      const input = 'Call the `justDoSomething()` function from the implementation';
      const result = service.compress(input);
      expect(result.compressed).toContain('`justDoSomething()`');
    });
  });

  // --- Compression ratio ---

  describe('compression ratio calculation', () => {
    it('should return ratio less than 1.0 for compressible text', () => {
      const input =
        'You must make sure to review the implementation of the configuration in order to verify that the application is actually working correctly in the environment. In addition to the tests, please note that the dependencies should be checked as well as the repository settings.';
      const result = service.compress(input);
      expect(result.compressionRatio).toBeGreaterThan(0);
      expect(result.compressionRatio).toBeLessThan(1.0);
    });

    it('should return ratio of 1.0 for text that is only code', () => {
      const input = ['```', 'const x = 1;', 'const y = 2;', '```'].join('\n');
      const result = service.compress(input);
      expect(result.compressionRatio).toBe(1.0);
    });

    it('should achieve 25%+ savings on instruction-heavy text', () => {
      const input = [
        'You must make sure to review the code in the repository.',
        'It is important to validate the implementation details.',
        'Please note that the configuration should be checked.',
        'In order to fix the bug, you must actually update the function.',
        'Make sure to test the application in the environment.',
        'Due to the fact that the dependencies are outdated, you must update them.',
        'At this point the specification is really basically complete.',
        'In addition to the tests, you must simply run the build.',
        'There are a number of options as well as configurations to review.',
        'The directory structure should currently just basically work.',
      ].join('\n');

      const result = service.compress(input);
      const savingsPercent = (1 - result.compressionRatio) * 100;
      expect(savingsPercent).toBeGreaterThanOrEqual(25);
    });
  });

  // --- Mixed content (compressed + protected) ---

  describe('mixed content handling', () => {
    it('should compress text outside protected regions and preserve protected regions', () => {
      const input = [
        'You must review the implementation in the repository.',
        '',
        '```typescript',
        'const the = "value";',
        'function justRun() { return the; }',
        '```',
        '',
        'Make sure to check /src/infrastructure/services/the-service.ts for the configuration.',
        'Visit https://example.com/the/docs for more information.',
        'Set the value to "the implementation details" as described.',
      ].join('\n');

      const result = service.compress(input);

      // Code block preserved
      expect(result.compressed).toContain('const the = "value";');
      expect(result.compressed).toContain('function justRun() { return the; }');

      // File path preserved
      expect(result.compressed).toContain('/src/infrastructure/services/the-service.ts');

      // URL preserved
      expect(result.compressed).toContain('https://example.com/the/docs');

      // Quoted string preserved
      expect(result.compressed).toContain('"the implementation details"');

      // Natural language outside protected regions should be compressed
      // (articles, phrases shortened, terms abbreviated)
      expect(result.compressionRatio).toBeLessThan(1.0);
    });
  });
});
