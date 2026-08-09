// @vitest-environment node

/**
 * Ruby detector Unit Tests
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, afterEach } from 'vitest';
import { detectRuby } from '@/infrastructure/services/deployment/detectors/ruby.detector.js';
import { cleanupFixtures, makeFixture } from '@tests/helpers/detector-fixture.helper.js';

afterEach(() => cleanupFixtures());

describe('detectRuby', () => {
  it('resolves the binstub command with the Rails default port', () => {
    const dir = makeFixture('ruby-binstub', {
      'bin/rails': '#!/usr/bin/env ruby\n',
      Gemfile: 'source "https://rubygems.org"\ngem "rails", "~> 7.1"\n',
    });

    expect(detectRuby(dir)).toMatchObject({
      success: true,
      command: 'bin/rails server',
      framework: 'Rails',
      expectedPort: 3000,
      language: 'Ruby',
      setupCommands: ['bundle install'],
      resolvedDir: dir,
    });
  });

  it('resolves bundle exec when a Gemfile declares rails but no binstub exists', () => {
    const dir = makeFixture('ruby-gemfile', {
      Gemfile: "source 'https://rubygems.org'\ngem 'rails'\n",
    });

    expect(detectRuby(dir)).toMatchObject({
      command: 'bundle exec rails server',
      framework: 'Rails',
      expectedPort: 3000,
      runtime: 'bundle',
    });
  });

  it('includes bundle install only when a Gemfile is present', () => {
    const dir = makeFixture('ruby-nogemfile', { 'bin/rails': '' });

    expect(detectRuby(dir)).toMatchObject({ setupCommands: [], runtime: 'ruby' });
  });
});

describe('detectRuby — fall-through', () => {
  it('falls through for a Gemfile with no rails gem', () => {
    const dir = makeFixture('ruby-sinatra', {
      Gemfile: "source 'https://rubygems.org'\ngem 'sinatra'\n",
    });

    expect(detectRuby(dir).success).toBe(false);
  });

  it('falls through for an empty directory', () => {
    const dir = makeFixture('ruby-none');

    expect(detectRuby(dir).success).toBe(false);
  });

  it('does not match a commented-out rails gem line', () => {
    const dir = makeFixture('ruby-comment', {
      Gemfile: "source 'https://rubygems.org'\n# gem 'rails'\n",
    });

    expect(detectRuby(dir).success).toBe(false);
  });

  it('never reads another ecosystem manifest when no Ruby manifest exists', () => {
    const dir = makeFixture('ruby-gate', { 'package.json': "gem 'rails'\n" });

    expect(detectRuby(dir).success).toBe(false);
  });
});
