"use client";

import type { FaceDetector, HandLandmarker } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceFruits,
  createFruit,
  findCatch,
  FRUIT_META,
  nextTarget,
  scoreForCatch,
  type FallingFruit,
  type FruitKey,
  type Point,
} from "../lib/game";

type Phase = "ready" | "loading" | "playing" | "finished" | "camera-error";
type ControlMode = "camera" | "pointer";
type Cursor = Point & { closed: boolean; source: "hand" | "pointer" };

const ROUND_SECONDS = 45;
const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

const clamp = (value: number, min = 0.04, max = 0.96) =>
  Math.min(max, Math.max(min, value));

export function JuicersGame() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [controlMode, setControlMode] = useState<ControlMode>("pointer");
  const [cameraActive, setCameraActive] = useState(false);
  const [trackingLabel, setTrackingLabel] = useState("Pointer ready");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [target, setTarget] = useState<FruitKey>("orange");
  const [fruits, setFruits] = useState<FallingFruit[]>([]);
  const [cursor, setCursor] = useState<Cursor>({
    x: 0.5,
    y: 0.64,
    closed: false,
    source: "pointer",
  });
  const [badgePoint, setBadgePoint] = useState<Point>({ x: 0.5, y: 0.13 });
  const [feedback, setFeedback] = useState("Grab only the fruit above your head");

  const playfieldRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const faceDetectorRef = useRef<FaceDetector | null>(null);
  const targetRef = useRef<FruitKey>(target);
  const comboRef = useRef(combo);
  const scoreRef = useRef(score);
  const fruitsRef = useRef<FallingFruit[]>(fruits);
  const hitStreakRef = useRef(0);
  const fruitIdRef = useRef(0);
  const lastFrameRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const roundEndsAtRef = useRef(0);
  const wasPinchedRef = useRef(false);
  const lastVideoTimeRef = useRef(-1);
  const faceFrameRef = useRef(0);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    comboRef.current = combo;
  }, [combo]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    fruitsRef.current = fruits;
  }, [fruits]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      handLandmarkerRef.current?.close();
      faceDetectorRef.current?.close();
    };
  }, [stopCamera]);

  const attemptCatch = useCallback((point: Point) => {
    const caught = findCatch(fruitsRef.current, point, targetRef.current);
    if (!caught) return;

    const updated = fruitsRef.current.filter(
      (fruit) => fruit.id !== caught.fruit.id,
    );
    fruitsRef.current = updated;
    setFruits(updated);

    if (caught.matches) {
      const earned = scoreForCatch(true, comboRef.current);
      const nextScore = scoreRef.current + earned;
      const nextCombo = comboRef.current + 1;
      scoreRef.current = nextScore;
      comboRef.current = nextCombo;
      setScore(nextScore);
      setCombo(nextCombo);
      setFeedback(`Juiced! +${earned}`);
      hitStreakRef.current += 1;

      if (hitStreakRef.current >= 3) {
        const next = nextTarget(targetRef.current);
        targetRef.current = next;
        setTarget(next);
        hitStreakRef.current = 0;
        setFeedback(`New order: ${FRUIT_META[next].label}`);
      }
    } else {
      comboRef.current = 0;
      setCombo(0);
      setFeedback(
        `${FRUIT_META[caught.fruit.type].emoji} Not this one — find ${FRUIT_META[targetRef.current].emoji}`,
      );
    }
  }, []);

  const beginRound = useCallback((mode: ControlMode) => {
    const firstTarget: FruitKey = "orange";
    setControlMode(mode);
    setTarget(firstTarget);
    targetRef.current = firstTarget;
    setScore(0);
    scoreRef.current = 0;
    setCombo(0);
    comboRef.current = 0;
    setTimeLeft(ROUND_SECONDS);
    setFruits([]);
    fruitsRef.current = [];
    setFeedback(
      mode === "camera"
        ? "Open and close your hand to grab"
        : "Move, then click or press Space to grab",
    );
    setCursor({
      x: 0.5,
      y: 0.64,
      closed: false,
      source: mode === "camera" ? "hand" : "pointer",
    });
    setBadgePoint({ x: 0.5, y: 0.13 });
    hitStreakRef.current = 0;
    lastFrameRef.current = performance.now();
    lastSpawnRef.current = performance.now() - 700;
    roundEndsAtRef.current = performance.now() + ROUND_SECONDS * 1000;
    wasPinchedRef.current = false;
    setPhase("playing");
  }, []);

  const initializeTracking = useCallback(async () => {
    if (handLandmarkerRef.current && faceDetectorRef.current) return;

    setTrackingLabel("Loading hand tracking…");
    const { FaceDetector, FilesetResolver, HandLandmarker } = await import(
      "@mediapipe/tasks-vision"
    );
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);

    const [handLandmarker, faceDetector] = await Promise.all([
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }),
      FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.5,
      }),
    ]);

    handLandmarkerRef.current = handLandmarker;
    faceDetectorRef.current = faceDetector;
    setTrackingLabel("Hand tracking ready");
  }, []);

  const startWithCamera = useCallback(async () => {
    setPhase("loading");
    setTrackingLabel("Requesting camera…");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      beginRound("camera");
      initializeTracking().catch(() => {
        setTrackingLabel("Tracking unavailable — pointer fallback on");
        setControlMode("pointer");
        setCursor((current) => ({ ...current, source: "pointer" }));
      });
    } catch {
      stopCamera();
      setTrackingLabel("Camera unavailable");
      setFeedback("Camera access did not start. You can still play.");
      setPhase("camera-error");
    }
  }, [beginRound, initializeTracking, stopCamera]);

  useEffect(() => {
    if (phase !== "playing") return;

    let frame = 0;
    const tick = (now: number) => {
      const delta = Math.min(0.08, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      let next = advanceFruits(fruitsRef.current, delta);
      if (now - lastSpawnRef.current >= 720) {
        next = [...next, createFruit(++fruitIdRef.current, targetRef.current)];
        lastSpawnRef.current = now;
      }
      fruitsRef.current = next;
      setFruits(next);

      const remaining = Math.max(
        0,
        Math.ceil((roundEndsAtRef.current - now) / 1000),
      );
      setTimeLeft(remaining);
      if (remaining <= 0) {
        setPhase("finished");
        setFeedback(`Round complete — ${scoreRef.current} points juiced`);
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing" || !cameraActive) return;

    let frame = 0;
    const detect = () => {
      const video = videoRef.current;
      const handLandmarker = handLandmarkerRef.current;
      const faceDetector = faceDetectorRef.current;
      const now = performance.now();

      if (
        video &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTimeRef.current &&
        handLandmarker
      ) {
        lastVideoTimeRef.current = video.currentTime;
        try {
          const handResult = handLandmarker.detectForVideo(video, now);
          const landmarks = handResult.landmarks[0];
          if (landmarks) {
            const thumb = landmarks[4];
            const index = landmarks[8];
            const handPoint = {
              x: clamp(1 - (thumb.x + index.x) / 2),
              y: clamp((thumb.y + index.y) / 2),
            };
            const pinched = Math.hypot(
              thumb.x - index.x,
              thumb.y - index.y,
            ) < 0.065;
            setCursor({ ...handPoint, closed: pinched, source: "hand" });
            setTrackingLabel(pinched ? "Pinch detected" : "Hand tracking ready");
            if (pinched && !wasPinchedRef.current) attemptCatch(handPoint);
            wasPinchedRef.current = pinched;
          } else {
            setTrackingLabel("Show one hand to the camera");
            wasPinchedRef.current = false;
          }

          faceFrameRef.current += 1;
          if (faceDetector && faceFrameRef.current % 6 === 0) {
            const face = faceDetector.detectForVideo(video, now).detections[0];
            const box = face?.boundingBox;
            if (box && video.videoWidth && video.videoHeight) {
              setBadgePoint({
                x: clamp(
                  1 - (box.originX + box.width / 2) / video.videoWidth,
                  0.12,
                  0.88,
                ),
                y: clamp(box.originY / video.videoHeight - 0.08, 0.09, 0.32),
              });
            }
          }
        } catch {
          setTrackingLabel("Tracking paused — pointer fallback on");
          setControlMode("pointer");
        }
      }

      frame = requestAnimationFrame(detect);
    };

    frame = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(frame);
  }, [attemptCatch, cameraActive, phase]);

  useEffect(() => {
    if (phase !== "playing") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key)) {
        return;
      }
      event.preventDefault();
      setControlMode("pointer");
      setCursor((current) => {
        const next = { ...current, source: "pointer" as const };
        if (event.key === "ArrowLeft") next.x = clamp(current.x - 0.055);
        if (event.key === "ArrowRight") next.x = clamp(current.x + 0.055);
        if (event.key === "ArrowUp") next.y = clamp(current.y - 0.055);
        if (event.key === "ArrowDown") next.y = clamp(current.y + 0.055);
        if (event.key === " ") {
          next.closed = true;
          attemptCatch(next);
          window.setTimeout(
            () => setCursor((latest) => ({ ...latest, closed: false })),
            120,
          );
        }
        return next;
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [attemptCatch, phase]);

  const updatePointer = (clientX: number, clientY: number) => {
    const bounds = playfieldRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    const point = {
      x: clamp((clientX - bounds.left) / bounds.width),
      y: clamp((clientY - bounds.top) / bounds.height),
    };
    setControlMode("pointer");
    setCursor({ ...point, closed: false, source: "pointer" });
    return point;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== "playing") return;
    const point = updatePointer(event.clientX, event.clientY);
    if (!point) return;
    setCursor({ ...point, closed: true, source: "pointer" });
    attemptCatch(point);
  };

  const onPointerUp = () => {
    setCursor((current) => ({ ...current, closed: false }));
  };

  const playWithoutCamera = () => {
    stopCamera();
    setTrackingLabel("Pointer and keyboard ready");
    beginRound("pointer");
  };

  const targetMeta = FRUIT_META[target];

  return (
    <main className="game-shell">
      <div
        className={`playfield phase-${phase}`}
        ref={playfieldRef}
        onPointerMove={(event) => {
          if (phase === "playing" && controlMode === "pointer") {
            updatePointer(event.clientX, event.clientY);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <video
          className={`camera-feed ${cameraActive ? "is-active" : ""}`}
          ref={videoRef}
          muted
          playsInline
          aria-hidden="true"
        />
        <div className="camera-tint" aria-hidden="true" />
        <div className="juice-light juice-light-one" aria-hidden="true" />
        <div className="juice-light juice-light-two" aria-hidden="true" />

        <header className="hud">
          <div className="brand-lockup" aria-label="Juicers">
            <span className="brand-mark">J</span>
            <span className="brand-word">JUICERS</span>
            <span className="prototype-pill">prototype 01</span>
          </div>
          <div className="scoreboard" aria-label="Round status">
            <div>
              <span className="stat-label">Score</span>
              <strong>{score.toString().padStart(3, "0")}</strong>
            </div>
            <span className="stat-divider" />
            <div>
              <span className="stat-label">Time</span>
              <strong>{timeLeft}s</strong>
            </div>
            <span className="stat-divider" />
            <div>
              <span className="stat-label">Streak</span>
              <strong>{combo}×</strong>
            </div>
          </div>
        </header>

        {phase === "playing" && (
          <>
            <div
              className="target-badge"
              style={{
                left: `${badgePoint.x * 100}%`,
                top: `${badgePoint.y * 100}%`,
                "--fruit-color": targetMeta.color,
              } as React.CSSProperties}
              aria-label={`Your order is ${targetMeta.label}`}
            >
              <span className="order-kicker">Your order</span>
              <span className="order-fruit">{targetMeta.emoji}</span>
              <span className="order-name">{targetMeta.label}</span>
            </div>

            <div className="fruit-layer" aria-hidden="true">
              {fruits.map((fruit) => (
                <span
                  className="falling-fruit"
                  key={fruit.id}
                  style={{
                    left: `${fruit.x * 100}%`,
                    top: `${fruit.y * 100}%`,
                    transform: `translate(-50%, -50%) rotate(${fruit.rotation}deg)`,
                  }}
                >
                  {FRUIT_META[fruit.type].emoji}
                </span>
              ))}
            </div>

            <div
              className={`grab-cursor ${cursor.closed ? "is-closed" : ""}`}
              style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
              aria-hidden="true"
            >
              <span>{cursor.closed ? "✊" : "🖐️"}</span>
              <i />
            </div>

            <div className="play-status" aria-live="polite">
              <span className="tracking-dot" />
              <span>{trackingLabel}</span>
              <strong>{feedback}</strong>
            </div>
          </>
        )}

        {phase === "ready" && (
          <section className="start-card" aria-labelledby="juicers-title">
            <span className="eyebrow">Camera-powered fruit chaos</span>
            <h1 id="juicers-title">
              Grab the right fruit.
              <em> Juice the high score.</em>
            </h1>
            <p className="intro-copy">
              Your order floats above your head. Pinch the matching fruit before
              it drops out of frame. Three catches and the order changes.
            </p>
            <div className="demo-strip" aria-hidden="true">
              <span>🍊</span><b>→</b><span className="demo-hand">🤏</span><b>→</b><span>+10</span>
            </div>
            <div className="start-actions">
              <button className="primary-button" onClick={startWithCamera}>
                <span>Use my camera</span>
                <small>Best experience</small>
              </button>
              <button className="secondary-button" onClick={playWithoutCamera}>
                Play without camera
              </button>
            </div>
            <p className="privacy-note">
              <span>●</span> Camera processing stays on this device. Nothing is
              recorded or uploaded.
            </p>
          </section>
        )}

        {phase === "loading" && (
          <section className="state-card" aria-live="polite">
            <div className="loader-orbit"><span>🍊</span></div>
            <span className="eyebrow">Warming up the juicer</span>
            <h2>Look alive.</h2>
            <p>{trackingLabel}</p>
          </section>
        )}

        {phase === "camera-error" && (
          <section className="state-card" aria-labelledby="camera-title">
            <span className="state-icon">📷</span>
            <span className="eyebrow">Camera needs attention</span>
            <h2 id="camera-title">No camera? No problem.</h2>
            <p>
              Allow camera access and try again, or play the full round with
              your pointer and Space bar.
            </p>
            <div className="start-actions compact">
              <button className="primary-button" onClick={startWithCamera}>
                Try camera again
              </button>
              <button className="secondary-button" onClick={playWithoutCamera}>
                Use pointer controls
              </button>
            </div>
          </section>
        )}

        {phase === "finished" && (
          <section className="finish-card" aria-labelledby="finish-title">
            <span className="eyebrow">Freshly squeezed</span>
            <h2 id="finish-title">{score} points</h2>
            <p>
              You juiced <strong>{Math.floor(score / 10)}</strong> catches in one
              fast, fruity round.
            </p>
            <div className="finish-fruit" aria-hidden="true">🍓 🍊 🍋‍🟩 🫐</div>
            <div className="start-actions compact">
              <button
                className="primary-button"
                onClick={() =>
                  cameraActive ? beginRound("camera") : playWithoutCamera()
                }
              >
                Play again
              </button>
              {!cameraActive && (
                <button className="secondary-button" onClick={startWithCamera}>
                  Try with camera
                </button>
              )}
            </div>
          </section>
        )}

        <footer className="game-footer">
          <span>Pinch to grab</span>
          <span className="footer-dot">•</span>
          <span>Pointer + click</span>
          <span className="footer-dot">•</span>
          <span>Arrows + Space</span>
        </footer>
      </div>
    </main>
  );
}
