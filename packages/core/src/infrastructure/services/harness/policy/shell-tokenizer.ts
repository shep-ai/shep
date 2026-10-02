/**
 * Minimal POSIX-ish shell tokenizer for permission inspection (spec 119).
 *
 * Splits a command line into segments joined by control operators
 * (`&&`, `||`, `;`, `|`, `&`) and collects output redirections. It does not
 * execute or expand anything; anything it cannot parse confidently is
 * reported so the inspector can answer "unknown" (never allow-by-default).
 */

export interface ShellSegment {
  argv: string[];
  /** Output redirection targets (`>`, `>>`, `2>`, `&>`). */
  writes: string[];
}

export interface TokenizeResult {
  segments: ShellSegment[];
  /** Command substitution, unbalanced quotes or similar: effects unknowable. */
  opaque: boolean;
}

const OPERATORS = ['&&', '||', ';', '|', '&'];

export function tokenizeShell(command: string): TokenizeResult {
  const segments: ShellSegment[] = [];
  let current: ShellSegment = { argv: [], writes: [] };
  let word = '';
  let inWord = false;
  let quote: '"' | "'" | null = null;
  let opaque = /\$\(|`|<\(|>\(/.test(command);
  let pendingRedirect = false;

  const endWord = () => {
    if (!inWord) return;
    if (pendingRedirect) {
      current.writes.push(word);
      pendingRedirect = false;
    } else {
      current.argv.push(word);
    }
    word = '';
    inWord = false;
  };
  const endSegment = () => {
    endWord();
    if (current.argv.length || current.writes.length) segments.push(current);
    current = { argv: [], writes: [] };
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
      continue;
    }
    if (ch === '\\' && i + 1 < command.length) {
      word += command[++i];
      inWord = true;
      continue;
    }
    if (/\s/.test(ch)) {
      endWord();
      continue;
    }
    const op = OPERATORS.find((o) => command.startsWith(o, i));
    // `2>&1`, `>&2` style fd duplication is not a file write.
    if (command.startsWith('>&', i) || command.startsWith('2>&', i)) {
      endWord();
      i += command.startsWith('2>&', i) ? 3 : 2;
      while (i < command.length && /\d/.test(command[i])) i++;
      i--;
      continue;
    }
    if (ch === '>' || command.startsWith('&>', i) || (/\d/.test(ch) && command[i + 1] === '>')) {
      endWord();
      while (i < command.length && /[\d&>]/.test(command[i])) i++;
      i--;
      pendingRedirect = true;
      continue;
    }
    if (ch === '<') {
      endWord();
      continue;
    }
    if (op) {
      endSegment();
      i += op.length - 1;
      continue;
    }
    word += ch;
    inWord = true;
  }
  if (quote) opaque = true;
  endSegment();
  return { segments, opaque };
}
