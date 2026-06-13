/**
 * Hero Demo Video Renderer
 *
 * Produces a 15-30s looping hero video showing parallel agents working
 * and a feature reaching an open PR. Uses Ken-Burns-style zoompan/crossfade
 * composition from the task-1.2 screenshot set, post-processed with ffmpeg.
 *
 * Output (both dark and light schemes):
 *   scripts/marketing/output/video/hero-loop-{dark,light}.webm  (VP9, <=2.5MB)
 *   scripts/marketing/output/video/hero-loop-{dark,light}.mp4   (H.264 fallback)
 *   scripts/marketing/output/video/hero-poster-{dark,light}.png (first-frame poster)
 *
 * Finals are also copied to:
 *   /home/user/website/public/video/
 *   /home/user/website/specs/012-website-redesign/evidence/after/task-1.3/ (webm only)
 *
 * Usage:
 *   pnpm demo:video
 *
 * Prerequisites:
 *   - ffmpeg must be installed (apt-get install ffmpeg)
 *   - task-1.2 screenshots in scripts/marketing/output/screenshots/
 *     (run pnpm demo:seed && pnpm demo:capture first if missing)
 */

import { execFileSync } from 'node:child_process';
import { statSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─── Configuration ───────────────────────────────────────────────────────────

const SCREENSHOTS_DIR = join(import.meta.dirname, 'output', 'screenshots');
const OUTPUT_DIR = join(import.meta.dirname, 'output', 'video');
const WEBSITE_VIDEO_DIR = '/home/user/website/public/video';
const EVIDENCE_DIR = '/home/user/website/specs/012-website-redesign/evidence/after/task-1.3';

/** Output resolution — 1280px wide, 16:10 (matches the 1440x900 source aspect) */
const OUT_W = 1280;
const OUT_H = 800;

/**
 * Intermediate resolution for zoompan processing.
 * Pre-scaling to 1600x1000 (55% of 2880x1800) is ~3x faster than running zoompan
 * at full source resolution, with negligible quality loss at 1280x800 output.
 */
const PROC_W = 1600;
const PROC_H = 1000;

/** Frames per second. 15fps is sufficient for slow Ken-Burns movement. */
const FPS = 15;

/** VP9 CRF — higher = smaller file / lower quality. 50 gives ~2.2MB for 22s at 1280x800. */
const VP9_CRF = 50;

/** H.264 CRF for MP4 fallback */
const H264_CRF = 26;

/**
 * Video storyboard:
 *
 * Scene 1 (0-5s):   Control center canvas — slow zoom-in to feature nodes.
 *                   Establishes the product overview: 4 parallel agents running.
 * Scene 2 (5-9s):   Parallel features inventory — pan down through all 4 features.
 *                   Shows distinct states: Review, Blocked, In Progress, AwaitingUpstream.
 * Scene 3 (9-14s):  Feature workspace "Add pagination" (Running) — pan right across detail.
 *                   Shows an agent actively implementing. Running badge + branch info.
 * Scene 4 (14-19s): Feature PR status "Fix concurrent deletes" — zoom to the PR section.
 *                   The money shot: PR #7 Open, Passing CI badge. This is the destination.
 * Scene 5 (19-25s): Control center canvas again — slow zoom-out, loop-compatible.
 *                   Clean visual return to the overview; first/last frame match.
 *
 * Total: ~22.6s. Crossfade 0.6s between scenes.
 */

interface SceneSpec {
  /** Duration of this scene in seconds */
  duration: number;
  /** Screenshot filename stem (without scheme suffix and extension) */
  screenshot: string;
  /**
   * ffmpeg zoompan expression for z (zoom level, 1.0 = full frame at PROC_W x PROC_H).
   * 'd' frames are calculated from duration * FPS.
   */
  zoom: string;
  /** X pan expression */
  panX: string;
  /** Y pan expression */
  panY: string;
}

const SCENES: SceneSpec[] = [
  {
    // Scene 1: Control center canvas — zoom in from 1.0 to 1.25, centered
    duration: 5,
    screenshot: 'control-center',
    zoom: `min(zoom+0.0033,1.25)`,
    panX: `iw/2-(iw/zoom/2)`,
    panY: `ih/2-(ih/zoom/2)`,
  },
  {
    // Scene 2: Parallel features inventory — slight zoom + pan down
    duration: 4,
    screenshot: 'parallel-features',
    zoom: `1.15`,
    panX: `iw/2-(iw/zoom/2)`,
    panY: `min(on*(130/${FPS * 4}),130)`,
  },
  {
    // Scene 3: Feature workspace (Running) — pan right across detail panel
    duration: 5,
    screenshot: 'feature-workspace',
    zoom: `1.1`,
    panX: `min(on*(200/${FPS * 5}),200)`,
    panY: `ih/2-(ih/zoom/2)`,
  },
  {
    // Scene 4: PR status (money shot) — zoom in, pan down to PR badge
    duration: 5,
    screenshot: 'feature-pr-status',
    zoom: `min(zoom+0.004,1.35)`,
    panX: `iw/2-(iw/zoom/2)+50`,
    panY: `min(on*(80/${FPS * 5}),80)`,
  },
  {
    // Scene 5: Control center again — slow zoom-out for loop-compatible end
    duration: 6,
    screenshot: 'control-center',
    zoom: `max(zoom-0.0025,1.0)`,
    panX: `iw/2-(iw/zoom/2)`,
    panY: `ih/2-(ih/zoom/2)`,
  },
];

const CROSSFADE_DURATION = 0.6;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDirs(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(WEBSITE_VIDEO_DIR, { recursive: true });
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function checkPrerequisites(): void {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'pipe' });
  } catch {
    throw new Error(
      'ffmpeg not found. Install with: apt-get install ffmpeg  OR  brew install ffmpeg'
    );
  }

  if (!existsSync(SCREENSHOTS_DIR)) {
    throw new Error(
      `Screenshots directory not found: ${SCREENSHOTS_DIR}\n` +
        `Run "pnpm demo:seed && pnpm demo:capture" first.`
    );
  }

  for (const scene of SCENES) {
    for (const scheme of ['dark', 'light'] as const) {
      const p = join(SCREENSHOTS_DIR, `${scene.screenshot}-${scheme}.png`);
      if (!existsSync(p)) {
        throw new Error(`Missing screenshot: ${p}`);
      }
    }
  }
}

/**
 * Compute total output duration after xfade deductions.
 */
function computeTotalDuration(): number {
  const rawSum = SCENES.reduce((acc, s) => acc + s.duration, 0);
  return rawSum - (SCENES.length - 1) * CROSSFADE_DURATION;
}

/**
 * Build ffmpeg args for the Ken-Burns composition.
 *
 * Pipeline per scene:
 *   scale to PROC_W x PROC_H  →  fps filter  →  zoompan at PROC resolution
 *   →  scale to OUT_W x OUT_H
 *
 * Scenes are stitched with xfade=fade transitions.
 */
function buildArgs(scheme: 'dark' | 'light', outputPath: string, codec: 'vp9' | 'h264'): string[] {
  const inputs: string[] = [];
  const filterParts: string[] = [];

  // Calculate xfade offsets
  let cumulativeDuration = 0;
  const xfadeOffsets: number[] = [];
  for (let i = 0; i < SCENES.length - 1; i++) {
    cumulativeDuration += SCENES[i].duration;
    xfadeOffsets.push(cumulativeDuration - CROSSFADE_DURATION);
  }

  // Input declarations (with overlap for xfade)
  for (let i = 0; i < SCENES.length; i++) {
    const scene = SCENES[i];
    const imgPath = join(SCREENSHOTS_DIR, `${scene.screenshot}-${scheme}.png`);
    const inputDuration =
      i < SCENES.length - 1 ? scene.duration + CROSSFADE_DURATION : scene.duration;
    inputs.push('-loop', '1', '-t', String(inputDuration), '-i', imgPath);
  }

  // Zoompan filter chains
  for (let i = 0; i < SCENES.length; i++) {
    const scene = SCENES[i];
    const inputDuration =
      i < SCENES.length - 1 ? scene.duration + CROSSFADE_DURATION : scene.duration;
    const frames = Math.ceil(inputDuration * FPS);

    filterParts.push(
      `[${i}:v]scale=${PROC_W}:${PROC_H},` +
        `fps=${FPS},` +
        `zoompan=z='${scene.zoom}':d=${frames}:` +
        `x='${scene.panX}':y='${scene.panY}':` +
        `s=${PROC_W}x${PROC_H}:fps=${FPS},` +
        `scale=${OUT_W}:${OUT_H}[v${i}]`
    );
  }

  // xfade chain
  let prevOutput = '[v0]';
  for (let i = 0; i < SCENES.length - 1; i++) {
    const next = `[v${i + 1}]`;
    const out = i < SCENES.length - 2 ? `[xf${i}]` : '[out]';
    filterParts.push(
      `${prevOutput}${next}xfade=transition=fade:duration=${CROSSFADE_DURATION}:offset=${xfadeOffsets[i]}${out}`
    );
    prevOutput = `[xf${i}]`;
  }

  const filterComplex = filterParts.join('; ');

  const codecArgs =
    codec === 'vp9'
      ? ['-c:v', 'libvpx-vp9', '-crf', String(VP9_CRF), '-b:v', '0', '-pix_fmt', 'yuv420p']
      : [
          '-c:v',
          'libx264',
          '-crf',
          String(H264_CRF),
          '-preset',
          'slow',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
        ];

  const totalDuration = computeTotalDuration();

  return [
    '-y',
    ...inputs,
    '-filter_complex',
    filterComplex,
    '-map',
    '[out]',
    // Limit output to the exact computed duration to prevent xfade/zoompan
    // from emitting residual frames after the last scene ends.
    '-t',
    String(totalDuration.toFixed(3)),
    ...codecArgs,
    '-an',
    outputPath,
  ];
}

/**
 * Render one scheme: webm + mp4 + poster.
 */
function renderScheme(scheme: 'dark' | 'light', totalDuration: number): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`RENDERING: ${scheme.toUpperCase()} scheme`);
  console.log('═'.repeat(60));

  const webmPath = join(OUTPUT_DIR, `hero-loop-${scheme}.webm`);
  const mp4Path = join(OUTPUT_DIR, `hero-loop-${scheme}.mp4`);
  const posterPath = join(OUTPUT_DIR, `hero-poster-${scheme}.png`);

  // WebM (VP9)
  console.log('\n[1/3] Encoding WebM (VP9)...');
  execFileSync('ffmpeg', buildArgs(scheme, webmPath, 'vp9'), { stdio: 'inherit' });

  // MP4 (H.264 fallback)
  console.log('\n[2/3] Encoding MP4 (H.264 fallback)...');
  execFileSync('ffmpeg', buildArgs(scheme, mp4Path, 'h264'), { stdio: 'inherit' });

  // Poster (first frame from WebM at 0.1s)
  console.log('\n[3/3] Extracting poster frame...');
  execFileSync(
    'ffmpeg',
    ['-y', '-ss', '0.1', '-i', webmPath, '-vframes', '1', '-q:v', '2', posterPath],
    { stdio: 'inherit' }
  );

  const webmKB = Math.round(statSync(webmPath).size / 1024);
  const mp4KB = Math.round(statSync(mp4Path).size / 1024);
  console.log(`\n  webm: ${webmKB}KB  mp4: ${mp4KB}KB  duration: ~${totalDuration.toFixed(1)}s`);

  if (webmKB > 2500) {
    console.warn(
      `  [WARN] WebM ${webmKB}KB exceeds 2.5MB target. Increase VP9_CRF or reduce duration.`
    );
  } else {
    console.log(`  [OK] WebM within 2.5MB target`);
  }
}

/**
 * Extract 7 evenly-spaced frames for QA review.
 */
function extractQaFrames(scheme: 'dark' | 'light', totalDuration: number): string[] {
  const webmPath = join(OUTPUT_DIR, `hero-loop-${scheme}.webm`);
  const framesDir = join(OUTPUT_DIR, `frames-${scheme}`);
  mkdirSync(framesDir, { recursive: true });

  const count = 7;
  const paths: string[] = [];
  console.log(`\n[QA] Extracting ${count} frames from ${scheme} video...`);

  for (let i = 0; i < count; i++) {
    const t = (totalDuration / (count + 1)) * (i + 1);
    const p = join(framesDir, `frame-${String(i + 1).padStart(2, '0')}-t${t.toFixed(1)}s.png`);
    try {
      execFileSync(
        'ffmpeg',
        ['-y', '-ss', String(t), '-i', webmPath, '-vframes', '1', '-q:v', '2', p],
        {
          stdio: 'pipe',
        }
      );
      paths.push(p);
    } catch {
      console.warn(`  [warn] frame at t=${t.toFixed(1)}s failed`);
    }
  }
  return paths;
}

/**
 * Copy final assets to website public dir and evidence dir.
 */
function copyFinalAssets(): void {
  console.log('\n[copy] Distributing final assets...');
  const files = readdirSync(OUTPUT_DIR).filter(
    (f) =>
      (f.startsWith('hero-loop-') || f.startsWith('hero-poster-')) &&
      (f.endsWith('.webm') || f.endsWith('.mp4') || f.endsWith('.png'))
  );

  for (const file of files) {
    copyFileSync(join(OUTPUT_DIR, file), join(WEBSITE_VIDEO_DIR, file));
    console.log(`  website/public/video/${file}`);
  }

  for (const file of files.filter((f) => f.endsWith('.webm'))) {
    copyFileSync(join(OUTPUT_DIR, file), join(EVIDENCE_DIR, file));
    console.log(`  evidence/after/task-1.3/${file}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n=== Shep Hero Video Renderer ===\n');
  console.log(`Approach: Ken-Burns zoompan + xfade composition (task-1.2 screenshots)`);
  console.log(
    `Scenes: ${SCENES.length}  FPS: ${FPS}  Proc: ${PROC_W}x${PROC_H} → ${OUT_W}x${OUT_H}`
  );

  const totalDuration = computeTotalDuration();
  console.log(`Duration: ~${totalDuration.toFixed(1)}s  Crossfade: ${CROSSFADE_DURATION}s`);

  ensureDirs();
  checkPrerequisites();

  for (const scheme of ['dark', 'light'] as const) {
    renderScheme(scheme, totalDuration);
  }

  // QA frame extraction
  console.log('\n=== QA Frame Extraction ===');
  for (const scheme of ['dark', 'light'] as const) {
    extractQaFrames(scheme, totalDuration);
  }

  copyFinalAssets();

  console.log('\n=== Render complete ===');
  console.log(`\nAssets:`);
  console.log(`  Working files: ${OUTPUT_DIR}`);
  console.log(`  Website:       ${WEBSITE_VIDEO_DIR}`);
  console.log(`  Evidence:      ${EVIDENCE_DIR}`);
  console.log(`\nTotal video duration: ~${totalDuration.toFixed(1)}s per scheme`);
}

main().catch((err: unknown) => {
  console.error('Render failed:', err);
  process.exit(1);
});
