/**
 * Language Enum Unit Tests
 *
 * Verifies the Language enum generated from TypeSpec contains all
 * 9 supported language values with correct ISO 639-1 codes.
 */

import { describe, it, expect } from 'vitest';
import { Language } from '@/domain/generated/output.js';

describe('Language enum', () => {
  it('should have exactly 9 values', () => {
    const values = Object.values(Language);
    expect(values).toHaveLength(9);
  });

  it('should map English to "en"', () => {
    expect(Language.English).toBe('en');
  });

  it('should map Ukrainian to "uk"', () => {
    expect(Language.Ukrainian).toBe('uk');
  });

  it('should map Russian to "ru"', () => {
    expect(Language.Russian).toBe('ru');
  });

  it('should map Portuguese to "pt"', () => {
    expect(Language.Portuguese).toBe('pt');
  });

  it('should map Spanish to "es"', () => {
    expect(Language.Spanish).toBe('es');
  });

  it('should map Arabic to "ar"', () => {
    expect(Language.Arabic).toBe('ar');
  });

  it('should map Hebrew to "he"', () => {
    expect(Language.Hebrew).toBe('he');
  });

  it('should map French to "fr"', () => {
    expect(Language.French).toBe('fr');
  });

  it('should map German to "de"', () => {
    expect(Language.German).toBe('de');
  });

  it('should contain all expected ISO 639-1 codes', () => {
    const values = Object.values(Language);
    expect(values).toEqual(
      expect.arrayContaining(['en', 'uk', 'ru', 'pt', 'es', 'ar', 'he', 'fr', 'de'])
    );
  });
});
