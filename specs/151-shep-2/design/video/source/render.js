// Renders frames [a, b) of the film to an H.264 segment by seeking the paused timeline frame by frame.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const [,, a, b, out, fpsArg] = process.argv; const fps = Number(fpsArg || 30);
(async () => {
  const br = await chromium.launch(); const p = await br.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('http://localhost:8766/film.html'); await p.waitForFunction(() => window.READY, null, { timeout: 60000 });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = Number(a); f < Number(b); f++) {
    await p.evaluate(t => window.seek(t), f / fps);
    const buf = await p.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 300 === 0) console.log(out, 'frame', f, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await br.close(); console.log('done', out);
})();
