import { FaceLandmarker, FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { RefObject } from "react";

export type TrackedPoint = { x: number; y: number };
export type TrackedHand = TrackedPoint & {
  id: "left" | "right";
  closed: boolean;
  confidence: number;
};
export type TrackingFrame = {
  source: "camera" | "demo";
  head: TrackedPoint | null;
  hands: TrackedHand[];
  updatedAt: number;
};

export type VisionStatus = "idle" | "loading" | "ready" | "error";

export const makeDemoFrame = (): TrackingFrame => ({
  source: "demo",
  head: { x: 0.5, y: 0.16 },
  hands: [
    { id: "left", x: 0.32, y: 0.68, closed: false, confidence: 1 },
    { id: "right", x: 0.68, y: 0.68, closed: false, confidence: 1 },
  ],
  updatedAt: performance.now(),
});

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

type Landmark = { x: number; y: number; z: number };

function palmCenter(points: Landmark[]) {
  const indexes = [0, 5, 9, 13, 17];
  return indexes.reduce(
    (sum, index) => ({ x: sum.x + points[index].x / indexes.length, y: sum.y + points[index].y / indexes.length }),
    { x: 0, y: 0 },
  );
}

function fistRatio(points: Landmark[]) {
  const palm = palmCenter(points);
  const palmSpan = Math.hypot(points[5].x - points[17].x, points[5].y - points[17].y) || 0.08;
  return (
    [8, 12, 16, 20].reduce(
      (sum, index) => sum + Math.hypot(points[index].x - palm.x, points[index].y - palm.y) / palmSpan,
      0,
    ) / 4
  );
}

export async function startVisionTracking(
  videoRef: RefObject<HTMLVideoElement | null>,
  frameRef: RefObject<TrackingFrame>,
  onStatus: (status: VisionStatus, message?: string) => void,
): Promise<() => void> {
  const video = videoRef.current;
  if (!video) throw new Error("Camera preview was not available.");
  onStatus("loading");

  let hands: HandLandmarker | null = null;
  let face: FaceLandmarker | null = null;
  let animationFrame = 0;
  let stopped = false;
  const originalConsoleError = console.error;
  const filteredConsoleError: typeof console.error = (...args) => {
    // MediaPipe's WASM runtime reports this successful CPU-delegate setup through
    // printErr. Keep real runtime failures visible while dropping the mislabeled INFO.
    if (String(args[0] ?? "").startsWith("INFO: Created TensorFlow Lite XNNPACK delegate for CPU")) return;
    originalConsoleError(...args);
  };
  console.error = filteredConsoleError;

  try {
    const vision = await FilesetResolver.forVisionTasks(assetPath("wasm"));
    [hands, face] = await Promise.all([
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: assetPath("models/hand_landmarker.task"), delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      }),
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: assetPath("models/face_landmarker.task"), delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.45,
        minFacePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      }),
    ]);
  } catch (error) {
    hands?.close();
    face?.close();
    if (console.error === filteredConsoleError) console.error = originalConsoleError;
    onStatus("error", error instanceof Error ? error.message : "Vision models could not start.");
    throw error;
  }

  onStatus("ready");
  let lastInference = 0;
  const rememberedClosed: Record<string, boolean> = { left: false, right: false };

  const loop = (now: number) => {
    if (stopped) return;
    // Landmark work is intentionally capped at 24 Hz; canvas presentation stays at display refresh rate.
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && now - lastInference >= 42) {
      lastInference = now;
      try {
        const handResult = hands?.detectForVideo(video, now);
        const faceResult = face?.detectForVideo(video, now);
        const previous = frameRef.current;
        const nextHands: TrackedHand[] = [];

        handResult?.landmarks.forEach((points, index) => {
          const palm = palmCenter(points);
          const labelRaw = handResult.handedness[index]?.[0]?.categoryName?.toLowerCase();
          const id: "left" | "right" = labelRaw === "left" ? "left" : "right";
          const old = previous.hands.find((hand) => hand.id === id);
          const ratio = fistRatio(points);
          const closed = rememberedClosed[id] ? ratio < 1.05 : ratio < 0.82;
          rememberedClosed[id] = closed;
          nextHands.push({
            id,
            x: mix(old?.x ?? 1 - palm.x, 1 - palm.x, 0.46),
            y: mix(old?.y ?? palm.y, palm.y, 0.46),
            closed,
            confidence: handResult.handedness[index]?.[0]?.score ?? 0.7,
          });
        });

        const forehead = faceResult?.faceLandmarks[0]?.[10];
        const oldHead = previous.head;
        const head = forehead
          ? {
              x: mix(oldHead?.x ?? 1 - forehead.x, 1 - forehead.x, 0.24),
              y: mix(oldHead?.y ?? Math.max(0.07, forehead.y - 0.055), Math.max(0.07, forehead.y - 0.055), 0.24),
            }
          : oldHead;

        frameRef.current = {
          source: "camera",
          head,
          hands: nextHands,
          updatedAt: now,
        };
      } catch (error) {
        // A transient bad video frame should not end the round.
        console.debug("Skipped one tracking frame", error);
      }
    }
    animationFrame = requestAnimationFrame(loop);
  };

  animationFrame = requestAnimationFrame(loop);
  return () => {
    stopped = true;
    cancelAnimationFrame(animationFrame);
    hands?.close();
    face?.close();
    if (console.error === filteredConsoleError) console.error = originalConsoleError;
  };
}
