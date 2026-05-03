# Commit Guidelines

Use small atomic commits with Conventional Commit messages.

## Required Sequence
1. `chore(project): scaffold pet sticker MVP structure`
2. `docs(product): add MVP product architecture and workflow docs`
3. `feat(bg-remove): add external provider abstraction`
4. `feat(sticker): generate white border and pink cutline`
5. `feat(layout): compose A6 non-overlapping sticker sheet`
6. `feat(ui): wire Gradio upload preview and download flow`
7. `feat(pipeline): connect upload to sticker sheet export`
8. `fix(pipeline): improve validation and error handling`
9. `docs(readme): add local setup and usage instructions`

## Never Commit
- `.env` or API keys.
- Generated PNG files.
- Temporary files.
- Python caches.
- Virtual environments.

