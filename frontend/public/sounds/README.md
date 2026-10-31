# Startup sound

`startup.m4a` comes from the reference video supplied by the user on 2026-10-31, who identified the eFootball opening cue starting around 00:17. The audible portion at 17.6–23.6 seconds is kept at its original speed for the six-second intro, with a short fade at either end. It replaces the rejected synthesized cue.

Recreate from the supplied recording with FFmpeg 7.1 (the private source video is not stored in this repository):

```sh
ffmpeg -i reference.mp4 -vn \
  -af 'atrim=start=17.6:end=23.6,asetpts=PTS-STARTPTS,volume=1.5,afade=t=in:d=0.01,afade=t=out:st=5.8:d=0.2,apad=whole_dur=6,atrim=duration=6' \
  -ar 48000 -c:a aac -b:a 160k -map_metadata -1 -movflags +faststart startup.m4a
```

The stereo AAC clip uses 48 kHz / 160 kbps (about 120 KiB). The intro audio element has `preload="none"`, no looping, and no controls; returning visits do not request it. The head script starts playback on the overlay's native `animationstart` event, before React hydration. Playback follows the existing six-second visual timeline, at 60% element volume, and ends on dismissal, hidden tabs, reduced motion, or removal from the page.

Autoplay is attempted immediately without requiring a tap. A browser can still reject it with `NotAllowedError`; website code cannot override that browser policy. An intro tap remains a best-effort retry while the existing 500 ms dismissal delay runs. Enabling sound/autoplay for the site in browser settings allows the no-tap path where the browser supports it.

The mounted audio element participates in the site's existing media pause/resume behavior for background music.
