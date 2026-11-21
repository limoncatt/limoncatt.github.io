# Material3Custom

My take on material 3 expressive

## Development

Material Web is bundled locally (`vendor/material.js`), so the site makes no requests to any CDN at runtime.

The bundle is built from `src/material.js`. After changing it or updating `@material/web`:

```
npm install
npm run build
```

Then commit the updated `vendor/material.js`. GitHub Pages serves the repo as-is, so no other build step is needed.
