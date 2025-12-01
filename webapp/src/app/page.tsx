"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import classNames from "classnames";
import { getFFmpeg } from "@/lib/ffmpeg";
import { GRADIENTS, drawGradient, type GradientSpec } from "@/lib/palette";
import { ANIMATION_OPTIONS, type SceneAnimation } from "@/lib/animation";

type Scene = {
  id: string;
  title: string;
  description: string;
  duration: number;
  gradientId: string;
  textColor: string;
  accent: string;
  animation: SceneAnimation;
};

type RenderState =
  | { status: "idle"; progress: 0; url?: string }
  | { status: "loading-encoder"; progress: number; url?: string }
  | { status: "encoding"; progress: number; url?: string }
  | { status: "ready"; progress: 1; url: string }
  | { status: "error"; progress: number; url?: string; error: string };

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const FPS = 24;

const MAX_SCENES = 6;
const MIN_DURATION = 2;
const MAX_DURATION = 8;

const fontStyles = {
  title: "700 64px 'Sora', 'Inter', sans-serif",
  description: "400 30px 'Inter', system-ui, sans-serif",
};

const buildInitialScenes = () => [
  {
    id: nanoid(),
    title: "Showcase your ideas in motion",
    description:
      "Craft cinematic storyboards that turn into silky, production-ready clips with zero hassle.",
    duration: 4,
    gradientId: "aurora",
    textColor: "#f8fafc",
    accent: "#facc15",
    animation: "zoom" as SceneAnimation,
  },
  {
    id: nanoid(),
    title: "Scene-aware pacing",
    description:
      "Fine-tune every beat. Dial in timing, gradients, and motion for a smooth narrative arc.",
    duration: 3.5,
    gradientId: "midnight",
    textColor: "#e2e8f0",
    accent: "#38bdf8",
    animation: "slide" as SceneAnimation,
  },
  {
    id: nanoid(),
    title: "Render to share in one click",
    description:
      "Generate studio-grade MP4s in-browser using a fast WASM encoder optimized for Vercel deploys.",
    duration: 3,
    gradientId: "sunset",
    textColor: "#fff7ed",
    accent: "#fb7185",
    animation: "drift" as SceneAnimation,
  },
];

export default function Home() {
  const [scenes, setScenes] = useState<Scene[]>(() => buildInitialScenes());
  const [selectedSceneId, setSelectedSceneId] = useState<string>(
    () => scenes[0]?.id,
  );
  const [previewTime, setPreviewTime] = useState(0);
  const [isPreviewPlaying, setPreviewPlaying] = useState(true);
  const [renderState, setRenderState] = useState<RenderState>({
    status: "idle",
    progress: 0,
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number>();
  const previousUrlRef = useRef<string>();

  const totalDuration = useMemo(
    () => scenes.reduce((total, scene) => total + scene.duration, 0),
    [scenes],
  );

  useEffect(() => {
    if (!isPreviewPlaying) {
      return;
    }

    let startTimestamp: number | null = null;

    const raf = (timestamp: number) => {
      if (startTimestamp === null) {
        startTimestamp = timestamp - previewTime * 1000;
      }

      const elapsed = (timestamp - startTimestamp) / 1000;

      if (elapsed >= totalDuration) {
        setPreviewTime(0);
        startTimestamp = timestamp;
      } else {
        setPreviewTime(elapsed);
      }

      requestRef.current = requestAnimationFrame(raf);
    };

    requestRef.current = requestAnimationFrame(raf);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isPreviewPlaying, totalDuration, previewTime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    renderPreviewFrame(context, scenes, previewTime);
  }, [previewTime, scenes]);

  useEffect(() => {
    return () => {
      if (previousUrlRef.current) {
        URL.revokeObjectURL(previousUrlRef.current);
      }
    };
  }, []);

  const activeScene = useMemo(
    () => scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0],
    [scenes, selectedSceneId],
  );

  const updateScene = (id: string, updater: (scene: Scene) => Scene) => {
    setScenes((current) =>
      current.map((scene) => (scene.id === id ? updater(scene) : scene)),
    );
  };

  const addScene = () => {
    if (scenes.length >= MAX_SCENES) return;

    const template = scenes[scenes.length - 1] ?? buildInitialScenes()[0];
    const gradient =
      GRADIENTS[(GRADIENTS.findIndex((g) => g.id === template.gradientId) + 1) %
        GRADIENTS.length];

    const newScene: Scene = {
      id: nanoid(),
      title: "New Narrative Moment",
      description:
        "Swap in your copy and colors, then keep sculpting the flow.",
      duration: clamp(template.duration, MIN_DURATION, MAX_DURATION),
      gradientId: gradient.id,
      textColor: template.textColor,
      accent: template.accent,
      animation: template.animation,
    };

    setScenes((current) => [...current, newScene]);
    setSelectedSceneId(newScene.id);
  };

  const removeScene = (id: string) => {
    if (scenes.length === 1) return;
    setScenes((current) => current.filter((scene) => scene.id !== id));
    if (selectedSceneId === id) {
      const nextScene = scenes.find((scene) => scene.id !== id);
      if (nextScene) {
        setSelectedSceneId(nextScene.id);
      }
    }
  };

  const handleRender = async () => {
    if (previousUrlRef.current) {
      URL.revokeObjectURL(previousUrlRef.current);
      previousUrlRef.current = undefined;
    }

    setRenderState({ status: "loading-encoder", progress: 0.05 });

    try {
      const blob = await synthesizeVideo(scenes, {
        onStage: (stage, progress) => {
          if (stage === "loading") {
            setRenderState({
              status: "loading-encoder",
              progress: 0.05 + progress * 0.15,
            });
          } else if (stage === "frames") {
            setRenderState({
              status: "encoding",
              progress: 0.2 + progress * 0.6,
            });
          } else if (stage === "muxing") {
            setRenderState({
              status: "encoding",
              progress: 0.8 + progress * 0.2,
            });
          }
        },
      });

      const url = URL.createObjectURL(blob);
      previousUrlRef.current = url;
      setRenderState({ status: "ready", progress: 1, url });
    } catch (error) {
      setRenderState({
        status: "error",
        progress: 0,
        error:
          error instanceof Error ? error.message : "Something went wrong.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 pb-24 pt-12 lg:px-12">
        <header className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-4xl">
            Agentic Motion Studio
          </h1>
          <p className="max-w-3xl text-base text-slate-300 sm:text-lg">
            Compose cinematic storyboards, preview fluid motion, and export a
            polished MP4 without leaving your browser. Every render uses a
            wasm-accelerated pipeline tuned for smooth, high-fidelity output.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
          <aside className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-white/[0.01] p-6 backdrop-blur">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-200">
                Scenes ({scenes.length}/{MAX_SCENES})
              </span>
              <button
                type="button"
                disabled={scenes.length >= MAX_SCENES}
                onClick={addScene}
                className={classNames(
                  "rounded-full border border-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition hover:border-white/30 hover:text-white",
                  scenes.length >= MAX_SCENES && "opacity-40",
                )}
              >
                Add Scene
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {scenes.map((scene, index) => (
                <button
                  key={scene.id}
                  onClick={() => setSelectedSceneId(scene.id)}
                  className={classNames(
                    "group relative flex flex-col gap-1 rounded-xl border border-white/[0.08] p-4 text-left transition hover:border-white/30",
                    selectedSceneId === scene.id &&
                      "border-white/50 bg-white/[0.05] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]",
                  )}
                >
                  <span className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                    <span>Scene {index + 1}</span>
                    <span>{scene.duration.toFixed(1)}s</span>
                  </span>
                  <span className="line-clamp-2 text-sm font-medium text-white">
                    {scene.title}
                  </span>
                  <span className="line-clamp-2 text-xs text-slate-400">
                    {scene.description}
                  </span>
                  <span className="absolute inset-y-0 right-3 flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-white hover:bg-white/20"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeScene(scene.id);
                      }}
                    >
                      Remove
                    </button>
                  </span>
                </button>
              ))}
            </div>

            {activeScene && (
              <SceneEditor
                key={activeScene.id}
                scene={activeScene}
                onChange={(updated) => updateScene(activeScene.id, () => updated)}
              />
            )}
          </aside>

          <main className="flex flex-col gap-6">
            <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-slate-950/50 p-6 shadow-2xl shadow-blue-500/10">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Live Motion Preview
                  </h2>
                  <p className="text-sm text-slate-400">
                    {totalDuration.toFixed(1)}s total runtime · {FPS}fps render
                    target
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewPlaying((state) => !state)}
                    className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white/50 hover:bg-white/10"
                  >
                    {isPreviewPlaying ? "Pause" : "Play"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTime(0)}
                    className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white/80 transition hover:border-white/50 hover:text-white"
                  >
                    Restart
                  </button>
                </div>
              </div>

              <div className="relative rounded-2xl border border-white/5 bg-slate-900/40 p-3">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  className="aspect-video w-full rounded-xl bg-black"
                />
                <Timeline
                  scenes={scenes}
                  currentTime={previewTime}
                  totalDuration={totalDuration}
                />
              </div>
            </div>

            <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Render Export
                  </h3>
                  <p className="text-sm text-slate-400">
                    Generates a smooth 1280×720 MP4 with a buttery 24fps cadence.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRender}
                  className="rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-slate-950 transition hover:shadow-[0_12px_35px_-15px_rgba(59,130,246,0.8)]"
                >
                  Render Video
                </button>
              </div>

              <RenderStatus status={renderState} />
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

function SceneEditor({
  scene,
  onChange,
}: {
  scene: Scene;
  onChange: (scene: Scene) => void;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-slate-900/40 p-5 text-sm">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Title
        </label>
        <input
          value={scene.title}
          onChange={(event) => onChange({ ...scene, title: event.target.value })}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition focus:border-white/50 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Description
        </label>
        <textarea
          value={scene.description}
          rows={4}
          onChange={(event) =>
            onChange({ ...scene, description: event.target.value })
          }
          className="resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition focus:border-white/50 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Duration
          </label>
          <input
            type="number"
            min={MIN_DURATION}
            max={MAX_DURATION}
            step={0.5}
            value={scene.duration}
            onChange={(event) =>
              onChange({
                ...scene,
                duration: clamp(
                  Number(event.target.value),
                  MIN_DURATION,
                  MAX_DURATION,
                ),
              })
            }
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition focus:border-white/50 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Text Color
          </label>
          <input
            type="color"
            value={scene.textColor}
            onChange={(event) =>
              onChange({ ...scene, textColor: event.target.value })
            }
            className="h-10 w-full cursor-pointer rounded-xl border border-white/10 bg-white/5"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Accent Color
        </label>
        <input
          type="color"
          value={scene.accent}
          onChange={(event) =>
            onChange({ ...scene, accent: event.target.value })
          }
          className="h-10 w-full cursor-pointer rounded-xl border border-white/10 bg-white/5"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Gradient
        </label>
        <div className="grid grid-cols-3 gap-2">
          {GRADIENTS.map((gradient) => (
            <button
              type="button"
              key={gradient.id}
              onClick={() => onChange({ ...scene, gradientId: gradient.id })}
              className={classNames(
                "relative h-16 overflow-hidden rounded-xl border border-white/10 transition hover:border-white/40",
                scene.gradientId === gradient.id && "border-white/60",
              )}
            >
              <GradientSwatch gradient={gradient} />
              <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-2 text-[10px] font-medium uppercase tracking-wide text-white">
                {gradient.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Motion System
        </label>
        <div className="grid grid-cols-3 gap-2">
          {ANIMATION_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.id}
              onClick={() => onChange({ ...scene, animation: option.id })}
              className={classNames(
                "rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/40 hover:text-white",
                scene.animation === option.id && "border-white/60 bg-white/10",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GradientSwatch({ gradient }: { gradient: GradientSpec }) {
  return (
    <svg className="h-full w-full" role="presentation">
      <defs>
        <linearGradient
          id={`${gradient.id}-swatch`}
          gradientUnits="userSpaceOnUse"
          x1="0%"
          y1="0%"
          x2={`${50 + 50 * Math.cos((gradient.angle * Math.PI) / 180)}%`}
          y2={`${50 + 50 * Math.sin((gradient.angle * Math.PI) / 180)}%`}
        >
          {gradient.stops.map((stop) => (
            <stop
              key={stop.at}
              offset={`${stop.at * 100}%`}
              stopColor={stop.color}
            />
          ))}
        </linearGradient>
      </defs>
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill={`url(#${gradient.id}-swatch)`}
      />
    </svg>
  );
}

function Timeline({
  scenes,
  currentTime,
  totalDuration,
}: {
  scenes: Scene[];
  currentTime: number;
  totalDuration: number;
}) {
  let elapsed = 0;

  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="relative h-1 rounded-full bg-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500"
          style={{
            width: `${totalDuration ? (currentTime / totalDuration) * 100 : 0}%`,
          }}
        />
      </div>
      <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-slate-400">
        {scenes.map((scene, index) => {
          const width = totalDuration
            ? (scene.duration / totalDuration) * 100
            : 0;
          const start = elapsed;
          elapsed += scene.duration;
          const span = Math.max(
            1,
            Math.round(((width || (100 / scenes.length)) / 100) * 12),
          );

          return (
            <div
              key={scene.id}
              className="relative rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-center font-semibold text-slate-300"
              style={{ gridColumn: `span ${span} / span ${span}` }}
            >
              Scene {index + 1} · {scene.duration.toFixed(1)}s
              <span className="pointer-events-none absolute inset-x-0 -bottom-2 text-[9px] font-medium text-blue-400/80">
                {start.toFixed(1)}s
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RenderStatus({ status }: { status: RenderState }) {
  if (status.status === "idle") {
    return (
      <p className="mt-4 text-sm text-slate-400">
        No render yet. Tune your scenes, then export whenever you&apos;re ready.
      </p>
    );
  }

  if (status.status === "error") {
    return (
      <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
        {status.error}
      </div>
    );
  }

  if (status.status === "ready") {
    return (
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
        <p className="text-sm font-medium text-emerald-200">
          Render complete. Download your MP4 below.
        </p>
        <a
          href={status.url}
          download="agentic-motion-studio.mp4"
          className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold uppercase tracking-wide text-emerald-950 transition hover:bg-emerald-300"
        >
          Download video
        </a>
        <video
          controls
          src={status.url}
          className="mt-2 w-full rounded-xl border border-white/10"
        />
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-300">
        <span>
          {status.status === "loading-encoder"
            ? "Loading encoder"
            : "Encoding frames"}
        </span>
        <span>{Math.round(status.progress * 100)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 transition-all"
          style={{
            width: `${Math.min(100, Math.round(status.progress * 100))}%`,
          }}
        />
      </div>
      <p className="text-xs text-slate-400">
        Rendering happens entirely in-browser with WebAssembly acceleration.
        Keep this tab focused for the fastest result.
      </p>
    </div>
  );
}

type Stage = "loading" | "frames" | "muxing";

type FFmpegInstance = Awaited<ReturnType<typeof getFFmpeg>>;

async function synthesizeVideo(
  scenes: Scene[],
  options: {
    onStage?: (stage: Stage, progress: number) => void;
  } = {},
) {
  if (!scenes.length) {
    throw new Error("Add at least one scene before rendering.");
  }

  const onStage = options.onStage ?? (() => undefined);
  const ffmpeg = await loadEncoder(onStage);
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to access 2D context for rendering.");
  }

  const totalFrames = Math.max(1, Math.round(totalDurationForScenes(scenes) * FPS));
  const writtenFiles: string[] = [];
  let frameIndex = 0;

  for (const scene of scenes) {
    const framesForScene = Math.max(1, Math.round(scene.duration * FPS));

    for (let frame = 0; frame < framesForScene; frame += 1) {
      const progress = framesForScene <= 1 ? 1 : frame / (framesForScene - 1);
      renderSceneFrame(context, scene, progress);
      const filename = `frame_${String(frameIndex).padStart(5, "0")}.png`;
      const pixels = canvasToUint8(canvas);
      await ffmpeg.writeFile(filename, pixels);
      writtenFiles.push(filename);
      frameIndex += 1;
      onStage("frames", frameIndex / totalFrames);
    }
  }

  onStage("muxing", 0.1);

  let data: Uint8Array | null = null;

  try {
    await ffmpeg.exec([
      "-framerate",
      String(FPS),
      "-i",
      "frame_%05d.png",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "output.mp4",
    ]);

    onStage("muxing", 0.9);
    const fileData = await ffmpeg.readFile("output.mp4");
    if (!(fileData instanceof Uint8Array)) {
      throw new Error("Unexpected encoder output format.");
    }
    data = fileData;
    onStage("muxing", 1);
  } finally {
    await cleanupFfmpeg(ffmpeg, writtenFiles);
  }

  if (!data) {
    throw new Error("Failed to read rendered video output.");
  }

  const copy = new Uint8Array(data.length);
  copy.set(data);

  return new Blob([copy.buffer], { type: "video/mp4" });
}

async function loadEncoder(
  onStage: (stage: Stage, progress: number) => void,
): Promise<FFmpegInstance> {
  onStage("loading", 0.1);
  const ffmpeg = await getFFmpeg();
  onStage("loading", 1);
  return ffmpeg;
}

function totalDurationForScenes(scenes: Scene[]) {
  return scenes.reduce((total, scene) => total + scene.duration, 0);
}

function renderPreviewFrame(
  context: CanvasRenderingContext2D,
  scenes: Scene[],
  time: number,
) {
  const totalDuration = totalDurationForScenes(scenes);
  if (totalDuration === 0) return;

  let elapsed = 0;

  for (const scene of scenes) {
    const start = elapsed;
    const end = start + scene.duration;
    elapsed = end;

    if (time >= start && time < end) {
      const progress = (time - start) / scene.duration;
      renderSceneFrame(context, scene, progress);
      return;
    }
  }

  renderSceneFrame(context, scenes[scenes.length - 1], 1);
}

function renderSceneFrame(
  context: CanvasRenderingContext2D,
  scene: Scene,
  progress: number,
) {
  const gradient = GRADIENTS.find((entry) => entry.id === scene.gradientId);
  if (!gradient) {
    throw new Error(`Missing gradient "${scene.gradientId}".`);
  }

  context.save();
  drawGradient(context, CANVAS_WIDTH, CANVAS_HEIGHT, gradient);

  drawMist(context);
  drawAccent(context, scene.accent, progress, scene.animation);
  drawTextBlock(context, scene, progress);

  context.restore();
}

function drawMist(context: CanvasRenderingContext2D) {
  const gradient = context.createRadialGradient(
    CANVAS_WIDTH * 0.3,
    CANVAS_HEIGHT * 0.2,
    0,
    CANVAS_WIDTH * 0.4,
    CANVAS_HEIGHT * 0.3,
    CANVAS_WIDTH * 0.8,
  );
  gradient.addColorStop(0, "rgba(255,255,255,0.18)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawAccent(
  context: CanvasRenderingContext2D,
  accent: string,
  progress: number,
  animation: SceneAnimation,
) {
  const eased = easeInOut(progress);
  const baseOpacity = 0.35 + 0.15 * Math.sin(progress * Math.PI);
  context.save();
  context.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

  const scale =
    animation === "zoom"
      ? 1 + eased * 0.08
      : animation === "slide"
        ? 1.05 + Math.sin(progress * Math.PI) * 0.05
        : 1 + Math.cos(progress * Math.PI * 2) * 0.04;

  context.scale(scale, scale);

  const rotation =
    animation === "slide"
      ? (easeOut(progress) - 0.5) * 0.4
      : animation === "drift"
        ? Math.sin(progress * Math.PI * 2) * 0.2
        : easeInOut(progress) * 0.15;

  context.rotate(rotation);

  const rectWidth = CANVAS_WIDTH * 0.65;
  const rectHeight = CANVAS_HEIGHT * 0.65;

  const gradient = context.createLinearGradient(
    -rectWidth / 2,
    -rectHeight / 2,
    rectWidth / 2,
    rectHeight / 2,
  );

  gradient.addColorStop(0, `${accent}30`);
  gradient.addColorStop(1, `${accent}00`);

  context.fillStyle = gradient;
  context.globalAlpha = baseOpacity;
  roundedRect(
    context,
    -rectWidth / 2,
    -rectHeight / 2,
    rectWidth,
    rectHeight,
    48,
  );
  context.fill();
  context.restore();
}

function drawTextBlock(
  context: CanvasRenderingContext2D,
  scene: Scene,
  progress: number,
) {
  const padding = 120;
  const textWidth = CANVAS_WIDTH - padding * 2;
  context.save();
  context.translate(padding, padding);

  const offset =
    scene.animation === "slide"
      ? (1 - easeOut(progress)) * 80
      : scene.animation === "drift"
        ? Math.sin(progress * Math.PI * 2) * 20
        : (1 - easeOut(progress)) * 40;

  context.translate(0, offset);
  context.globalAlpha = easeIn(progress);

  context.fillStyle = scene.textColor;

  context.font = fontStyles.title;
  context.textBaseline = "top";

  const titleLines = wrapText(context, scene.title, textWidth);

  let currentY = 0;

  titleLines.forEach((line) => {
    context.fillText(line, 0, currentY);
    currentY += 70;
  });

  context.globalAlpha = easeIn(progress) * 0.9;
  context.font = fontStyles.description;

  const bodyLines = wrapText(context, scene.description, textWidth);
  currentY += 20;

  bodyLines.forEach((line) => {
    context.fillText(line, 0, currentY);
    currentY += 44;
  });

  context.restore();
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = context.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function easeInOut(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function easeOut(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function easeIn(value: number) {
  return value * value;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height,
  );
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function canvasToUint8(canvas: HTMLCanvasElement) {
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  const decoder =
    typeof window !== "undefined" && typeof window.atob === "function"
      ? window.atob.bind(window)
      : null;

  if (!decoder) {
    throw new Error("Base64 decoding is not available in this environment.");
  }

  const binary = decoder(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function cleanupFfmpeg(ffmpeg: FFmpegInstance, files: string[]) {
  for (const file of files) {
    try {
      await ffmpeg.deleteFile(file);
    } catch {
      // ignore
    }
  }

  try {
    await ffmpeg.deleteFile("output.mp4");
  } catch {
    // ignore
  }
}
