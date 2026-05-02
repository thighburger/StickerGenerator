# Tasks

## MVP Sequence
1. Scaffold project structure.
2. Add product, architecture, API, task, and commit docs.
3. Add config and env loading.
4. Add background-removal provider abstraction and remove.bg provider.
5. Add sticker border and cutline generation.
6. Add A6 non-overlapping layout.
7. Add Gradio UI.
8. Wire full upload-to-export pipeline.
9. Improve validation and error handling.
10. Finalize README.

## Validation
- Run `python -m compileall .`.
- Run `python app.py` and confirm the local Gradio server starts.
- Verify `.env`, generated images, caches, virtual environments, `temp/`, and `outputs/` are not committed.

