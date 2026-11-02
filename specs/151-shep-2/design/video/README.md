# Shep 2 overview video

[![Shep 2 overview](poster.jpg)](shep-2-overview.mp4)

**[shep-2-overview.mp4](shep-2-overview.mp4)**: 4 min 7 s, 1080p, narrated, captions burned in
(also as [`shep-2-overview.srt`](shep-2-overview.srt)). It explains the product, how you work
with it and how you start, with no internals.

| Time | Chapter |
| ---- | ------- |
| 0:00 | Go to sleep with issues. Wake up with pull requests. |
| 0:09 | The idea: one task, five states |
| 0:38 | Evening: hand it over in Linear, Jira, Slack, GitHub, the terminal or your agent |
| 1:09 | Night: the sky is the progress bar; Shep fixes CI, asks once, stays quiet |
| 1:53 | Morning: one notification, review with proof, M to merge, S to send back |
| 2:42 | Getting started: install, where tasks come from, connect, first tasks |
| 3:29 | Everywhere you work: terminal, Mac app, your agent, your team's tools |
| 3:43 | Look and feel |

## How it was made

`source/` holds everything needed to rebuild it:

- `script.json`: narration lines and the shot list (board + start/end crop for slow pans).
- `gen_audio.py`: speaks each line with Piper TTS (voice `en_US-lessac-high`) and writes
  `timeline.json` (when each line starts) and `narration.wav`.
- `gen_music.py`: the ambient music bed (pure numpy, no samples).
- `film.html`: every scene, animated on one timeline from `timeline.json`.
- `render.js`: seeks the paused timeline frame by frame (30 fps) and pipes frames to ffmpeg.
- `render-2x.js`: renders the atlas boards at 2x into `img/` (needs the canvas runtime, see
  the design README); the generated images from `../atlas/assets/` go in `img/` too.

Rebuild: serve `source/` on port 8766, run `gen_audio.py <voice.onnx>`, `gen_music.py`, then
`node render.js 0 <frames> video.mp4`, and mix `narration.wav` (ducking `music.wav`) to -16 LUFS
with ffmpeg.
