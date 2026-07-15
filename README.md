# The Workshop

Static GitHub Pages deployment pack.

## Deploy

1. Upload the contents of this folder to the root of a GitHub repository.
2. In **Settings → Pages**, select **Deploy from a branch**.
3. Choose the branch containing these files and the repository root.

No build command is required. Keep the `assets` folder beside `index.html`.

For local testing, run a small static server in this folder, for example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
