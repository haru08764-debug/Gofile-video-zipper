# Gofile Video Zipper

A small deployable web app for bundling videos visible on a public Gofile share page into a ZIP. It uses the regular public webpage rather than Premium-only API endpoints.

## Deploy to Render

1. Create a GitHub repository and upload these files.
2. In Render, choose **New → Blueprint** and connect the repository.
3. Render reads `render.yaml` and builds the service.
4. Wait for the build to finish, then open the generated `https://...onrender.com` URL.

The free hosting plan may sleep when idle and has resource/time limits. Large videos or large folders can exceed free hosting limits.

## Local test

Requires Node.js 20+.

```bash
npm install
npx playwright install chromium
npm start
```

Open `http://localhost:3000`.

## Important limitations

- Only public share links and files you are authorized to download.
- No Premium API endpoint, authentication bypass, CAPTCHA bypass, or DRM bypass.
- Gofile can change its webpage, restrict access, or require steps that this prototype cannot automate. In those cases, it reports an error rather than bypassing the restriction.
- Free hosting is not suitable for unlimited/very large ZIP jobs. The archive is streamed to the browser to reduce temporary disk use.
- This is a prototype, not an audited production service. Do not use it for private or sensitive files.
