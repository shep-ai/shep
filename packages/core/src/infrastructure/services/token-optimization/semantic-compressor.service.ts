/**
 * Semantic Compressor Service
 *
 * Rule-based caveman compression for non-code prompt sections. Uses a
 * protect-then-compress strategy: extract protected regions (code blocks,
 * file paths, URLs, JSON, quoted strings) as placeholders, apply compression
 * rules to the remaining natural language, then restore protected regions.
 *
 * Compression rules (in order):
 * 1. Phrase shortening (multi-word → shorter equivalent)
 * 2. Filler word removal (just, simply, basically, actually, really, currently)
 * 3. Article removal (a, an, the)
 * 4. Technical term abbreviation (repository → repo, etc.)
 * 5. Whitespace collapsing (multiple blanks → single)
 */

import type {
  ISemanticCompressorService,
  SemanticCompressionResult,
} from '@/application/ports/output/services/semantic-compressor.interface.js';

/** Placeholder prefix used for protected regions. */
const PLACEHOLDER_PREFIX = '\x00PROT_';
const PLACEHOLDER_SUFFIX = '\x00';

/**
 * Multi-word phrase replacements. Order matters: longer phrases first to
 * prevent partial matches. Applied case-insensitively.
 */
const PHRASE_REPLACEMENTS: readonly [RegExp, string][] = [
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bit is important to\b/gi, 'important:'],
  [/\bplease note that\b/gi, 'note:'],
  [/\bin addition to\b/gi, 'besides'],
  [/\ba number of\b/gi, 'several'],
  [/\bat this point\b/gi, 'now'],
  [/\bmake sure to\b/gi, 'ensure'],
  [/\bin order to\b/gi, 'to'],
  [/\bas well as\b/gi, 'and'],
  [/\byou must\b/gi, 'must'],
  [/\byou should\b/gi, 'should'],
];

/**
 * Filler words removed entirely (with surrounding space normalization).
 */
const FILLER_WORDS: readonly RegExp[] = [
  /\bjust\b/gi,
  /\bsimply\b/gi,
  /\bbasically\b/gi,
  /\bactually\b/gi,
  /\breally\b/gi,
  /\bcurrently\b/gi,
];

/**
 * Articles removed (with word boundary awareness).
 */
const ARTICLES: readonly RegExp[] = [/\bthe\b/gi, /\ban\b/gi, /\ba\b(?=\s)/gi];

/**
 * Technical term abbreviations. Applied with word boundaries.
 */
const TERM_ABBREVIATIONS: readonly [RegExp, string][] = [
  [/\bimplementation\b/gi, 'impl'],
  [/\bconfiguration\b/gi, 'config'],
  [/\bspecification\b/gi, 'spec'],
  [/\benvironment\b/gi, 'env'],
  [/\bapplication\b/gi, 'app'],
  [/\brepository\b/gi, 'repo'],
  [/\bdependencies\b/gi, 'deps'],
  [/\bdependency\b/gi, 'dep'],
  [/\bdirectory\b/gi, 'dir'],
  [/\bfunction\b/gi, 'fn'],
];

/**
 * Regex patterns for detecting protected regions in the prompt text.
 */

/** Fenced code blocks: ```...``` (with optional language tag) */
const FENCED_CODE_BLOCK_RE = /```[\s\S]*?```/g;

/** Indented code blocks: lines starting with 4+ spaces (consecutive) */
const INDENTED_CODE_BLOCK_RE = /(?:^|\n)((?:[ ]{4,}[^\n]*\n?)+)/g;

/** URLs: http(s)://... */
const URL_RE = /https?:\/\/[^\s)>\]]+/g;

/** Absolute file paths: /path/to/file or ./path/to/file */
const UNIX_PATH_RE = /(?:\.\/|\/)[a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+/g;

/** Windows file paths: C:\path\to\file */
const WINDOWS_PATH_RE = /[A-Z]:\\[^\s]+/g;

/** Double-quoted strings */
const DOUBLE_QUOTE_RE = /"[^"]*"/g;

/** Single-quoted strings */
const SINGLE_QUOTE_RE = /'[^']*'/g;

/** Backtick-quoted inline code */
const BACKTICK_RE = /`[^`]+`/g;

/** Inline JSON objects */
const INLINE_JSON_RE = /\{[^{}]*"[^"]*"[^{}]*\}/g;

export class SemanticCompressorService implements ISemanticCompressorService {
  /**
   * Compress natural language text in a prompt.
   *
   * Strategy:
   * 1. Extract all protected regions and replace with placeholders
   * 2. Apply compression rules to remaining text
   * 3. Restore protected regions from placeholders
   * 4. Calculate compression ratio
   */
  compress(text: string): SemanticCompressionResult {
    if (text === '') {
      return { compressed: '', compressionRatio: 1.0 };
    }

    const originalLength = text.length;

    // Step 1: Extract protected regions
    const protectedRegions: string[] = [];
    let working = text;

    const protect = (regex: RegExp): void => {
      working = working.replace(regex, (match) => {
        const index = protectedRegions.length;
        protectedRegions.push(match);
        return `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
      });
    };

    // Order matters: code blocks first (they may contain other patterns)
    protect(FENCED_CODE_BLOCK_RE);
    protect(INDENTED_CODE_BLOCK_RE);
    protect(URL_RE);
    protect(WINDOWS_PATH_RE);
    protect(UNIX_PATH_RE);
    protect(INLINE_JSON_RE);
    protect(DOUBLE_QUOTE_RE);
    protect(SINGLE_QUOTE_RE);
    protect(BACKTICK_RE);

    // Step 2: Apply compression rules
    working = this.applyPhraseShortening(working);
    working = this.removeFillerWords(working);
    working = this.removeArticles(working);
    working = this.abbreviateTerms(working);
    working = this.collapseWhitespace(working);

    // Step 3: Restore protected regions
    working = working.replace(
      new RegExp(`${escapeRegex(PLACEHOLDER_PREFIX)}(\\d+)${escapeRegex(PLACEHOLDER_SUFFIX)}`, 'g'),
      (_, indexStr) => {
        const index = parseInt(indexStr, 10);
        return protectedRegions[index] ?? '';
      }
    );

    const compressedLength = working.length;
    const compressionRatio = originalLength === 0 ? 1.0 : compressedLength / originalLength;

    return { compressed: working, compressionRatio };
  }

  private applyPhraseShortening(text: string): string {
    let result = text;
    for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }

  private removeFillerWords(text: string): string {
    let result = text;
    for (const pattern of FILLER_WORDS) {
      result = result.replace(pattern, '');
    }
    return result;
  }

  private removeArticles(text: string): string {
    let result = text;
    for (const pattern of ARTICLES) {
      result = result.replace(pattern, '');
    }
    return result;
  }

  private abbreviateTerms(text: string): string {
    let result = text;
    for (const [pattern, replacement] of TERM_ABBREVIATIONS) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }

  private collapseWhitespace(text: string): string {
    let result = text;
    // Collapse multiple blank lines to a single blank line
    result = result.replace(/\n{3,}/g, '\n\n');
    // Collapse multiple spaces within lines to a single space
    result = result.replace(/ {2,}/g, ' ');
    // Trim leading/trailing spaces on each line (but keep indentation for protected restored content)
    result = result
      .split('\n')
      .map((line) => {
        // Only trim if line doesn't start with a placeholder
        if (line.includes(PLACEHOLDER_PREFIX)) {
          return line;
        }
        return line.replace(/^ +/, '').replace(/ +$/, '');
      })
      .join('\n');
    return result;
  }
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
