/* global process, console, window, document */
// Records a real terminal program — a CLI scene or `shep tui` — the way a
// person sees it: the program runs in a pseudo-terminal (node-pty), its output
// is drawn by xterm.js in Chromium, and Playwright records the window.
//
//   node record-terminal.mjs <name> <command> [steps.json]
//
//   OUT       folder for <name>.mp4, <name>.gif, <name>.txt and screenshots
//   CHROMIUM  a Chromium binary when Playwright's own is not installed
//   COLS/ROWS terminal size (default 132 x 36)
//
// steps.json is a list run in order once the program starts:
//   { "waitFor": "text" }  wait until the screen shows the text
//   { "keys": "d" }        type keys (\r enter, \u001b esc, \t tab, \u001b[A up)
//   { "type": "words" }    type text one character at a time
//   { "wait": 1500 }       pause
//   { "shot": "name" }     save a screenshot of the terminal as <name>.png
// Without steps the recorder waits for the program to exit.
import { chromium } from '@playwright/test';
import { spawn } from 'node-pty';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const [name, command, stepsFile] = process.argv.slice(2);
if (!name || !command) throw new Error('usage: record-terminal.mjs <name> <command> [steps.json]');
const OUT = process.env.OUT ?? 'terminal-evidence';
const COLS = Number(process.env.COLS ?? 132);
const ROWS = Number(process.env.ROWS ?? 36);
const steps = stepsFile ? JSON.parse(readFileSync(stepsFile, 'utf8')) : [];
mkdirSync(OUT, { recursive: true });

// xterm.js is a dependency of the web UI package; run from the repository root.
const require = createRequire(join(process.cwd(), 'src/presentation/web/package.json'));
const xtermDir = dirname(require.resolve('@xterm/xterm/package.json'));
const xtermJs = readFileSync(join(xtermDir, 'lib/xterm.js'), 'utf8');
const xtermCss = readFileSync(join(xtermDir, 'css/xterm.css'), 'utf8');

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
const viewport = { width: Math.round(COLS * 8.45) + 32, height: Math.round(ROWS * 18.5) + 32 };
const context = await browser.newContext({ viewport, recordVideo: { dir: OUT, size: viewport } });
const page = await context.newPage();
await page.setContent(
  `<html><head><style>${xtermCss} body{margin:0;padding:16px;background:#0f1117}</style></head>` +
    `<body><div id="t"></div></body></html>`
);
await page.addScriptTag({ content: xtermJs });
await page.evaluate(
  ({ cols, rows }) => {
    const term = new window.Terminal({
      cols,
      rows,
      fontSize: 14,
      fontFamily: 'DejaVu Sans Mono, Menlo, monospace',
      theme: { background: '#0f1117', foreground: '#e6e6e6' },
      allowProposedApi: true,
    });
    term.open(document.getElementById('t'));
    window.term = term;
    window.screenText = () => {
      const buffer = term.buffer.active;
      const lines = [];
      for (let i = 0; i < term.rows; i++) {
        lines.push(buffer.getLine(buffer.viewportY + i)?.translateToString(true) ?? '');
      }
      return lines.join('\n');
    };
  },
  { cols: COLS, rows: ROWS }
);

let transcript = '';
let pending = Promise.resolve();
const pty = spawn('bash', ['-c', command], {
  name: 'xterm-256color',
  cols: COLS,
  rows: ROWS,
  cwd: process.cwd(),
  env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
});
pty.onData((data) => {
  transcript += data;
  pending = pending
    .then(() => page.evaluate((d) => window.term.write(d), data))
    .catch(() => undefined);
});
const exited = new Promise((resolve) => pty.onExit(resolve));

async function waitFor(text, timeout = 60_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    await pending;
    if ((await page.evaluate(() => window.screenText())).includes(text)) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`"${text}" never appeared:\n${await page.evaluate(() => window.screenText())}`);
}

async function shot(file) {
  await pending;
  await page.waitForTimeout(300);
  await page.locator('#t').screenshot({ path: join(OUT, `${file}.png`) });
  console.log(join(OUT, `${file}.png`));
}

await page.waitForTimeout(800);
for (const step of steps) {
  if (step.waitFor) await waitFor(step.waitFor, step.timeout);
  if (step.keys) pty.write(step.keys);
  if (step.type) {
    for (const ch of step.type) {
      pty.write(ch);
      await page.waitForTimeout(45);
    }
  }
  if (step.wait) await page.waitForTimeout(step.wait);
  if (step.shot) await shot(step.shot);
}
if (steps.length === 0) await exited;
else pty.kill();
await pending;
await page.waitForTimeout(1500);
if (steps.length === 0) await shot(name);

const video = page.video();
await context.close();
await browser.close();
const webm = join(OUT, `${name}.webm`);
renameSync(await video.path(), webm);
const plain = transcript
  // eslint-disable-next-line no-control-regex
  .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007|\u001b[()][0-9A-B]/g, '')
  .replace(/\r/g, '');
writeFileSync(join(OUT, `${name}.txt`), plain);
const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
ffmpeg([
  '-i',
  webm,
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  '-crf',
  '28',
  join(OUT, `${name}.mp4`),
]);
ffmpeg([
  '-i',
  webm,
  '-vf',
  'fps=8,scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer',
  join(OUT, `${name}.gif`),
]);
rmSync(webm);
console.log(join(OUT, `${name}.mp4`));
process.exit(0);
