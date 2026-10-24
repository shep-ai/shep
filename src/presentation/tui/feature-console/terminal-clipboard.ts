/**
 * Clipboard over the terminal (spec 145).
 *
 * OSC 52 asks the terminal to put text on the system clipboard. It works over
 * ssh and through tmux (`set-clipboard`), in iTerm2, WezTerm, kitty, Ghostty,
 * Windows Terminal and Alacritty, where per-OS tools (pbcopy, xclip) do not.
 */

const OSC_52_CLIPBOARD = '\x1b]52;c;';
const BEL = '\x07';

export function clipboardSequence(text: string): string {
  return `${OSC_52_CLIPBOARD}${Buffer.from(text, 'utf8').toString('base64')}${BEL}`;
}
