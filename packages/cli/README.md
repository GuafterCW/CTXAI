# @ctxai/cli

Command-line client for a self-hosted [CTXAI](https://github.com/GuafterCW/CTXAI)
instance — generate images, video and audio with your own provider keys, and
render montage timelines, straight from the terminal.

```bash
npx @ctxai/cli login          # paste your instance URL + ctx_… API key once
npx @ctxai/cli models         # see what you can generate
npx @ctxai/cli generate "a fox in the snow, cinematic" -m seedream-image
```

## Commands

| Command | What it does |
| --- | --- |
| `ctxai login` | Save instance URL + platform API key (`~/.config/ctxai/config.json`) |
| `ctxai models` | List providers, models and their parameters |
| `ctxai generate "<prompt>" -m <model>` | Generate, wait, and download the result |
| `ctxai jobs` / `ctxai job <id>` | List / inspect jobs (`--json` for scripts) |
| `ctxai download <job-id>` | Download a job's assets |
| `ctxai compose <timeline.json>` | Render a montage (Shorts/long-form MP4) |

## Examples

```bash
# video with model parameters
ctxai generate "neon city flythrough" -m kling-text-to-video -p duration=10

# image-to-video: @file is read and sent as base64
ctxai generate "animate this" -m kling-image-to-video -p image=@still.png

# fire-and-forget, check later
ctxai generate "moody forest" -m seedream-image --no-wait
ctxai job <id> --wait

# render a montage timeline (see the CTXAI docs for the schema)
ctxai compose short.json --title "My Short" -o renders/
```

Connection resolution: `--url`/`--key` flags → `CTXAI_URL`/`CTXAI_API_KEY`
env vars → `ctxai login` config. API keys are created in your CTXAI instance
under **Settings → API keys**.

MIT — part of the CTXAI monorepo.
