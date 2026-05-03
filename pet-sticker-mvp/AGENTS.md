# Agent Guidelines

This project is a fast MVP for generating A6 dog sticker sheet PNGs.

- Do not commit `.env`, API keys, generated images, temp files, outputs, caches, or virtual environments.
- Do not add GPU inference, local AI models, SAM2, BiRefNet, inpainting, outpainting, or generative dog transformations.
- Preserve uploaded dog appearance and texture as much as possible.
- Keep background removal behind the provider abstraction in `services/bg_remove.py`.
- Prefer simple, readable MVP code over advanced editors, queues, auth, payments, databases, or PDF export.

