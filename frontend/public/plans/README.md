# Plan artwork

Display assets derived from the repository's user-supplied `assets/` materials:

| Display file | Original source |
| --- | --- |
| `pocket-watch.webp` | `IMAGE 2026-10-18 16:01:57.jpg` |
| `top-hat.webp` | `IMAGE 2026-10-18 16:01:52.jpg` |
| `pocket-watch.mp4` | `gemini_generated_video_905bf9c5.mp4` |
| `top-hat.mp4` | `gemini_generated_video_010e8f2a.mp4` |

Images are resized to 720 × 720 and encoded as WebP at quality 85. Videos are unchanged copies. `PlanArt` displays the image first and loads the film only when a mouse enters the plan card on a device with fine-pointer hover support and no reduced-motion preference. Playback is muted and does not loop; leaving the card returns to the still. Touch devices, reduced motion, and playback errors retain the image. There are no media controls in the card.
