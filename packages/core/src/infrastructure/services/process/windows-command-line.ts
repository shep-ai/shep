/**
 * Building a cmd.exe command line that survives BOTH parsers.
 *
 * A Windows command line is read twice. cmd.exe scans it first: `"` toggles
 * quote state, `^` escapes the next character, and `& | < > ( )` separate
 * commands when they are NOT inside quotes. The program then applies the
 * CommandLineToArgvW rules, where `\"` is an escaped quote and backslashes
 * are only special immediately before a quote.
 *
 * The previous implementation quoted with `"${a.replace(/(["\\])/g, '\\$1')}"`,
 * which is valid for CommandLineToArgvW alone and wrong for cmd.exe: cmd does
 * not recognise `\"`, so it closed the quote at that `"` and everything up to
 * the next one — `&whoami&` for the input `a"&whoami&"b` — became command
 * syntax. Raw LLM output reaches this path as `gh pr create --title/--body`.
 *
 * The encoding here is the one Rust's standard library adopted for the same
 * class of bug (CVE-2024-24576):
 *
 *   - force-quote every argument, so there is no "is this one safe?" predicate
 *     to get wrong;
 *   - escape an embedded `"` by DOUBLING it. `""` is a literal quote to
 *     CommandLineToArgvW, and to cmd it is quote-off immediately followed by
 *     quote-on, so nothing between them is ever exposed;
 *   - double a run of backslashes when it precedes a quote (including the
 *     closing one), which is the CommandLineToArgvW rule;
 *   - replace every `%` with `%%cd:~,%`. cmd.exe expands `%VAR%` even inside
 *     quotes and before it scans them, so an argument naming a variable whose
 *     value holds a `"` could reopen command syntax. `%cd:~,%` is a
 *     zero-length substring of `%cd%`: it expands to nothing, leaves the
 *     literal `%` in front of it, and consumes the `%` that a following
 *     `NAME%` would have paired with. This needs command extensions, so the
 *     launcher passes `/e:on` (and `/v:off` so `!VAR!` is never expanded);
 *   - refuse CR, LF and NUL. cmd.exe ends the command line at a line break,
 *     so the rest would be silently dropped, and no quoting can carry one.
 *
 * Arguments that need a line break (a prompt) must travel over stdin or a
 * file instead — every one-shot agent executor except Copilot and Cline
 * already pipes its prompt.
 *
 * NOT VERIFIED ON A WINDOWS HOST — there is none in this environment. The
 * unit tests assert the exact strings produced and run them through an
 * explicit model of cmd.exe's quote state and percent expansion, so the
 * claim is checkable.
 */

/** Characters no cmd.exe command line can carry inside an argument. */
const UNREPRESENTABLE_CHARACTERS = /[\r\n\0]/;

/** `%` followed by an empty `%cd%` substring, so it can never open `%VAR%`. */
const ESCAPED_PERCENT = '%%cd:~,%';

/**
 * Quote one argument for a cmd.exe command line.
 *
 * @param arg - The argument, exactly as the caller wants the program to see it.
 * @throws Error when the argument holds a character cmd.exe cannot carry.
 */
export function quoteWindowsShellArgument(arg: string): string {
  if (UNREPRESENTABLE_CHARACTERS.test(arg)) {
    throw new Error(
      'Cannot pass an argument containing a newline or NUL through cmd.exe: ' +
        'cmd ends the command line there. Pass it over stdin or a file instead.'
    );
  }

  let quoted = '"';
  let backslashes = 0;

  for (const char of arg) {
    if (char === '\\') {
      backslashes += 1;
      continue;
    }

    if (char === '"') {
      // Backslashes before a quote are halved by CommandLineToArgvW, so emit
      // twice as many, then the doubled quote that both parsers read as one.
      quoted += '\\'.repeat(backslashes * 2);
      quoted += '""';
      backslashes = 0;
      continue;
    }

    quoted += '\\'.repeat(backslashes);
    quoted += char === '%' ? ESCAPED_PERCENT : char;
    backslashes = 0;
  }

  // The closing quote is a quote too: trailing backslashes must be doubled
  // so they are not read as escaping it.
  quoted += '\\'.repeat(backslashes * 2);
  return `${quoted}"`;
}

/**
 * Join an executable and its arguments into a single cmd.exe command line.
 *
 * @param file - Path to the executable or script.
 * @param args - Argument vector, in order.
 */
export function buildWindowsCommandLine(file: string, args: readonly string[]): string {
  return [file, ...args].map(quoteWindowsShellArgument).join(' ');
}
