## Agentic Motion Studio

Agentic Motion Studio is a browser-based video builder that lets you design cinematic, gradient-driven storyboards and export a polished 1280×720 MP4 without leaving the page. Every render uses a WebAssembly-powered FFmpeg pipeline so you can iterate quickly and deploy effortlessly to Vercel.

### Features

- Scene designer with live gradient swatches, timing controls, and motion presets
- Real-time canvas preview with smooth easing and ambient lighting effects
- In-browser WASM encoder that produces H.264 MP4 output at 24fps
- Tailwind-crafted responsive UI optimized for desktop and tablet workflows
- Vercel-ready Next.js 15 setup using the App Router and bundled fonts

### Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to explore the app. Edits under `src/app` hot reload automatically.

### Rendering Video

1. Compose or tweak scenes in the sidebar.
2. Use the live preview to iterate on gradients, motion, and pacing.
3. Click **Render Video** to generate a downloadable MP4 entirely in-browser.

Keep the tab focused while rendering so the encoder can run at full speed.

### Production Build

```bash
npm run build
npm run start
```

### Deploy

The project is configured for Vercel. Run the following when you are ready to ship:

```bash
vercel deploy --prod --yes --token $VERCEL_TOKEN --name agentic-dc706e85
```

### License

MIT © Agentic Motion Studio
