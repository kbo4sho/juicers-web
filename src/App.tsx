import { useCallback, useEffect, useRef, useState } from "react";
import { juiceAudio } from "./game/audio";
import type { AudioScene } from "./game/audioScore";
import { GameCanvas } from "./game/GameCanvas";
import {
  FRUIT_META,
  rankForScore,
  type CustomerOrderSnapshot,
  type FruitKind,
  type RoundMode,
  type RoundResult,
  type RoundSnapshot,
} from "./game/model";
import {
  makeDemoFrame,
  startVisionTracking,
  type TrackingFrame,
  type VisionStatus,
} from "./game/tracking";

type Screen = "welcome" | "permission" | "tutorial" | "countdown" | "playing" | "results";
type PlayMode = "camera" | "demo";
type HandTrackingStatus = "waiting" | "both" | "one" | "missing";

const initialSnapshot: RoundSnapshot = {
  score: 0,
  combo: 0,
  bestCombo: 0,
  correct: 0,
  misses: 0,
  timeLeft: 60,
  orders: [],
  ordersCompleted: 0,
  orderStreak: 0,
  frenzyLeft: 0,
  freezeLeft: 0,
};

const CUSTOMER_UI: Record<string, { portrait: string; quote: string }> = {
  Maya: { portrait: "portraits/maya.webp", quote: "Make it bright!" },
  Theo: { portrait: "portraits/theo.webp", quote: "No rush. Mostly." },
  Pip: { portrait: "portraits/pip.webp", quote: "Make it sing!" },
  Mina: { portrait: "portraits/mina.webp", quote: "Tart and bright!" },
  Zara: { portrait: "portraits/zara.webp", quote: "Surprise me." },
  Dax: { portrait: "portraits/dax.webp", quote: "Go big!" },
};

const customerPortraits = Object.entries(CUSTOMER_UI);

function FruitDot({ kind, large = false }: { kind: FruitKind; large?: boolean }) {
  return (
    <span
      className={`fruit-dot fruit-dot--${kind}${large ? " fruit-dot--large" : ""}`}
      style={{ "--fruit": FRUIT_META[kind].color } as React.CSSProperties}
      aria-hidden="true"
    >
      <img src={`${import.meta.env.BASE_URL}fruits/${kind}.webp`} alt="" />
    </span>
  );
}

function drinkAssetPath(drink: string) {
  const slug = drink.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${import.meta.env.BASE_URL}drinks/${slug}.webp`;
}

function CustomerOrderCard({ order, index }: { order: CustomerOrderSnapshot; index: number }) {
  const filledCount = order.filled.filter(Boolean).length;
  const progress = filledCount / order.ingredients.length;
  const customer = CUSTOMER_UI[order.customer] ?? CUSTOMER_UI.Maya;
  return (
    <article
      className={`order-card${order.completed ? " order-card--complete" : ""}`}
      style={{ "--order-accent": order.accent, "--order-progress": `${progress * 100}%` } as React.CSSProperties}
      aria-label={`${order.customer}'s ${order.drink}: ${filledCount} of ${order.ingredients.length} fruits added${order.completed ? ", complete" : ""}`}
    >
      <div className="order-card__topline">
        <span className="customer-avatar" aria-hidden="true"><img src={customer.portrait} alt="" /></span>
        <span className="order-card__customer">
          <small>COUNTER {String(index + 1).padStart(2, "0")}</small>
          <strong>{order.customer}</strong>
          <em>{order.completed ? "Perfect!" : customer.quote}</em>
        </span>
        <span className="order-card__ticket">#{String(order.id).padStart(2, "0")}</span>
      </div>
      <div className="order-card__recipe">
        <div className="order-card__recipe-copy">
          <div className="order-card__drink">{order.drink}</div>
          <div className={`order-card__ingredients${order.ingredients.length >= 4 ? " order-card__ingredients--dense" : ""}`} aria-hidden="true">
            {order.ingredients.map((kind, ingredientIndex) => (
              <span className={order.filled[ingredientIndex] ? "is-filled" : ""} key={`${kind}-${ingredientIndex}`}>
                <FruitDot kind={kind} />
                <i>{order.filled[ingredientIndex] ? "✓" : "+"}</i>
              </span>
            ))}
          </div>
        </div>
        <img className="order-card__drink-art" src={drinkAssetPath(order.drink)} alt="" aria-hidden="true" />
      </div>
      <div className="order-card__progress"><i /></div>
      {order.completed && <div className="order-card__stamp" aria-hidden="true">ORDER UP!</div>}
    </article>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? " brand--compact" : ""}`} role="img" aria-label="Juicers">
      <span className="brand__sign" aria-hidden="true">
        <span className="brand__drop"><i /></span>
        <span className="brand__word">
          {"JUICERS".split("").map((letter, index) => <i key={`${letter}-${index}`}>{letter}</i>)}
        </span>
        <span className="brand__shine" />
      </span>
      {!compact && <span className="brand__tag">MATCH · SQUEEZE · SPLASH</span>}
    </div>
  );
}

function DinerBackdrop() {
  return (
    <div className="diner-set" aria-hidden="true">
      <span className="diner-lamp diner-lamp--left"><i /></span>
      <span className="diner-lamp diner-lamp--right"><i /></span>
      <span className="diner-menu diner-menu--left"><i /><i /><i /><i /></span>
      <span className="diner-menu diner-menu--right"><i /><i /><i /><i /></span>
      <span className="diner-shelf"><i /><i /><i /><i /><i /></span>
      <span className="diner-counter"><i /><i /><i /></span>
    </div>
  );
}

function PrivacyNote() {
  return (
    <div className="privacy-note">
      <span className="privacy-note__icon" aria-hidden="true">◆</span>
      <span><strong>On-device only.</strong> Video is never shown, recorded, stored, or uploaded.</span>
    </div>
  );
}

export function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [mode, setMode] = useState<PlayMode>("demo");
  const [roundMode, setRoundMode] = useState<RoundMode>("timed");
  const [cameraActive, setCameraActive] = useState(false);
  const [visionStatus, setVisionStatus] = useState<VisionStatus>("idle");
  const [cameraMessage, setCameraMessage] = useState("");
  const [countdown, setCountdown] = useState(3);
  const [snapshot, setSnapshot] = useState<RoundSnapshot>(initialSnapshot);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [playToken, setPlayToken] = useState(0);
  const [roundNumber, setRoundNumber] = useState(1);
  const [muted, setMuted] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [trackedHandMask, setTrackedHandMask] = useState(0);
  const [handTrackingStatus, setHandTrackingStatus] = useState<HandTrackingStatus>("waiting");
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackingRef = useRef<TrackingFrame>(makeDemoFrame());
  const trackingCleanupRef = useRef<null | (() => void)>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handsMissingSinceRef = useRef<number | null>(null);
  const setupReadyTimerRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (setupReadyTimerRef.current !== null) {
      window.clearTimeout(setupReadyTimerRef.current);
      setupReadyTimerRef.current = null;
    }
    trackingCleanupRef.current?.();
    trackingCleanupRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    handsMissingSinceRef.current = null;
    setTrackedHandMask(0);
    setHandTrackingStatus("waiting");
    setCameraActive(false);
    setVisionStatus("idle");
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    let diagnosticsTimer: number | null = null;
    let lastDiagnosticsSignature = "";
    const diagnosticsHistory: Array<Record<string, unknown>> = [];
    const handleVisibility = () => juiceAudio.setVisible(!document.hidden);
    const resumeFromGesture = () => {
      if (!document.hidden) void juiceAudio.unlock();
    };
    if (import.meta.env.DEV) {
      const writeDiagnostics = () => {
        const diagnostics = juiceAudio.getDiagnostics();
        const signature = [
          diagnostics.scene,
          diagnostics.muted,
          diagnostics.visible,
          diagnostics.contextState,
          diagnostics.schedulerActive,
          diagnostics.schedulerGeneration,
          diagnostics.transport,
        ].join(":");
        document.documentElement.dataset.juicersAudioDiagnostics = JSON.stringify(diagnostics);
        if (signature !== lastDiagnosticsSignature) {
          lastDiagnosticsSignature = signature;
          diagnosticsHistory.push({ at: performance.now(), ...diagnostics });
          document.documentElement.dataset.juicersAudioHistory = JSON.stringify(diagnosticsHistory.slice(-40));
        }
      };
      writeDiagnostics();
      diagnosticsTimer = window.setInterval(writeDiagnostics, 120);
    }
    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pointerdown", resumeFromGesture, { capture: true });
    window.addEventListener("keydown", resumeFromGesture, { capture: true });
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pointerdown", resumeFromGesture, { capture: true });
      window.removeEventListener("keydown", resumeFromGesture, { capture: true });
      if (diagnosticsTimer !== null) window.clearInterval(diagnosticsTimer);
      if (import.meta.env.DEV) {
        delete document.documentElement.dataset.juicersAudioDiagnostics;
        delete document.documentElement.dataset.juicersAudioHistory;
      }
      juiceAudio.setScene("silent");
    };
  }, []);

  useEffect(() => {
    if (!cameraActive || (screen !== "tutorial" && screen !== "playing")) {
      handsMissingSinceRef.current = null;
      return;
    }
    const updateTrackingStatus = () => {
      const hands = trackingRef.current.hands;
      const left = hands.some((hand) => hand.id === "left");
      const right = hands.some((hand) => hand.id === "right");
      const mask = (left ? 1 : 0) | (right ? 2 : 0);
      setTrackedHandMask(mask);

      if (mask === 0) {
        const now = performance.now();
        handsMissingSinceRef.current ??= now;
        setHandTrackingStatus(now - handsMissingSinceRef.current >= 700 ? "missing" : "waiting");
      } else {
        handsMissingSinceRef.current = null;
        setHandTrackingStatus(mask === 3 ? "both" : "one");
      }
    };
    updateTrackingStatus();
    const interval = window.setInterval(updateTrackingStatus, 180);
    return () => window.clearInterval(interval);
  }, [cameraActive, screen]);

  const enterDemo = useCallback(async () => {
    stopCamera();
    await juiceAudio.unlock();
    setMode("demo");
    trackingRef.current = makeDemoFrame();
    setCameraMessage("");
    setScreen("tutorial");
  }, [stopCamera]);

  const requestCamera = useCallback(async () => {
    await juiceAudio.unlock();
    if (setupReadyTimerRef.current !== null) {
      window.clearTimeout(setupReadyTimerRef.current);
      setupReadyTimerRef.current = null;
    }
    setMode("camera");
    setScreen("permission");
    setCameraMessage("");
    setVisionStatus("loading");
    trackingCleanupRef.current?.();
    streamRef.current?.getTracks().forEach((track) => track.stop());

    if (!navigator.mediaDevices?.getUserMedia) {
      setVisionStatus("error");
      setCameraMessage("This browser cannot open a webcam. Chrome or Edge on desktop works best.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("The camera preview could not start.");
      video.srcObject = stream;
      await video.play();
      trackingRef.current = { source: "camera", hands: [], updatedAt: performance.now() };
      setCameraActive(true);

      trackingCleanupRef.current = await startVisionTracking(videoRef, trackingRef, (status, message) => {
        setVisionStatus(status);
        if (message) setCameraMessage(message);
        if (status === "ready" && setupReadyTimerRef.current === null) {
          setupReadyTimerRef.current = window.setTimeout(() => {
            setupReadyTimerRef.current = null;
            setScreen("tutorial");
          }, 650);
        } else if (status === "error" && setupReadyTimerRef.current !== null) {
          window.clearTimeout(setupReadyTimerRef.current);
          setupReadyTimerRef.current = null;
        }
      });
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraActive(false);
      setVisionStatus("error");
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");
      setCameraMessage(
        denied
          ? "Camera access was blocked. You can allow it in the address bar and try again, or jump straight into demo mode."
          : "We couldn’t start motion tracking. Demo mode has the complete game and needs no camera.",
      );
    }
  }, []);

  const startRound = useCallback((nextRoundMode: RoundMode) => {
    void juiceAudio.unlock();
    setRoundMode(nextRoundMode);
    setResult(null);
    setSnapshot({
      ...initialSnapshot,
      timeLeft: nextRoundMode === "timed" ? 60 : null,
    });
    setAnnouncement("");
    setCountdown(3);
    setScreen("countdown");
  }, []);

  useEffect(() => {
    if (screen !== "countdown") return;
    const timers: number[] = [];
    const cue = (after: number, value: number) => {
      timers.push(
        window.setTimeout(() => {
          setCountdown(value);
          juiceAudio.play(value === 0 ? "start" : "tick");
        }, after),
      );
    };
    juiceAudio.play("tick");
    cue(720, 2);
    cue(1440, 1);
    cue(2160, 0);
    timers.push(
      window.setTimeout(() => {
        setPlayToken((token) => token + 1);
        setScreen("playing");
      }, 2720),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [screen]);

  const handleFinish = useCallback((finished: RoundResult) => {
    setResult(finished);
    setScreen("results");
    setAnnouncement(`${roundMode === "endless" ? "Free play session" : "Round"} complete. ${finished.rank}. Score ${finished.score}. Best combo ${finished.bestCombo}.`);
  }, [roundMode]);

  const finishEndless = useCallback(() => {
    if (roundMode !== "endless" || screen !== "playing") return;
    juiceAudio.play("finish");
    handleFinish({
      score: snapshot.score,
      combo: snapshot.combo,
      bestCombo: snapshot.bestCombo,
      correct: snapshot.correct,
      misses: snapshot.misses,
      ordersCompleted: snapshot.ordersCompleted,
      rank: rankForScore(snapshot.score),
    });
  }, [handleFinish, roundMode, screen, snapshot]);

  const replay = useCallback(() => {
    setRoundNumber((round) => round + 1);
    startRound(roundMode);
  }, [roundMode, startRound]);

  const switchMode = useCallback(() => {
    if (mode === "camera") void enterDemo();
    else {
      stopCamera();
      setScreen("welcome");
    }
  }, [enterDemo, mode, stopCamera]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      juiceAudio.setMuted(!current);
      return !current;
    });
  }, []);

  const trackedLeft = Boolean(trackedHandMask & 1);
  const trackedRight = Boolean(trackedHandMask & 2);
  const accuracy = result && result.correct + result.misses > 0
    ? Math.round((result.correct / (result.correct + result.misses)) * 100)
    : 0;
  const canvasPhase = screen === "tutorial" ? "tutorial" : screen === "countdown" ? "countdown" : screen === "playing" ? "playing" : "results";
  const timerWarning = roundMode === "timed" && snapshot.timeLeft !== null && snapshot.timeLeft <= 10;
  const setupStage = visionStatus === "ready" ? "ready" : cameraActive ? "tracking" : "camera";

  useEffect(() => {
    const audioScene: AudioScene = screen === "tutorial"
      ? "tutorial"
      : screen === "countdown"
        ? "countdown"
        : screen === "playing"
          ? timerWarning ? "urgent" : "playing"
          : screen === "results"
            ? "results"
            : "silent";
    juiceAudio.setScene(audioScene);
  }, [screen, timerWarning]);

  return (
    <main className={`app app--${screen} app--round-${roundMode}`}>
      <video ref={videoRef} className="camera-feed" muted autoPlay playsInline aria-hidden="true" />

      {screen !== "welcome" && screen !== "permission" && (
        <GameCanvas
          phase={canvasPhase}
          playToken={playToken}
          roundNumber={roundNumber}
          roundMode={roundMode}
          countdown={countdown}
          trackingRef={trackingRef}
          cameraActive={cameraActive}
          onSnapshot={setSnapshot}
          onFinish={handleFinish}
          onAnnounce={setAnnouncement}
        />
      )}

      {screen === "welcome" && (
        <section className="welcome-shell" aria-labelledby="welcome-title">
          <DinerBackdrop />
          <div className="diner-awning" aria-hidden="true" />
          <div className="diner-checker diner-checker--welcome" aria-hidden="true" />
          <div className="welcome-cast" aria-hidden="true">
            {customerPortraits.map(([name, customer], index) => (
              <img src={customer.portrait} alt="" className={`welcome-cast__portrait welcome-cast__portrait--${index + 1}`} key={name} />
            ))}
          </div>
          <div className="ambient ambient--one" />
          <div className="ambient ambient--two" />
          <div className="welcome-fruit welcome-fruit--orange"><FruitDot kind="orange" large /></div>
          <div className="welcome-fruit welcome-fruit--berry"><FruitDot kind="berry" large /></div>
          <div className="welcome-fruit welcome-fruit--lime"><FruitDot kind="lime" large /></div>
          <div className="welcome-card">
            <div className="welcome-card__topline"><span>THE NEIGHBORHOOD JUICE COUNTER</span><span>OPEN LATE</span></div>
            <Brand />
            <h1 id="welcome-title">The orders keep coming.<br /><em>Your hands make the splash.</em></h1>
            <p className="welcome-card__lede">Catch the fruit your customers need, squeeze it into their tickets, and serve colorful drinks in a one-minute rush or for as long as you like.</p>
            <div className="choice-grid">
              <button className="choice-card choice-card--primary" onClick={() => void requestCamera()}>
                <span className="choice-card__icon camera-icon" aria-hidden="true"><i /></span>
                <span className="choice-card__copy"><strong>Play with camera</strong><small>Two-hand tracking</small></span>
                <span className="choice-card__arrow" aria-hidden="true">→</span>
              </button>
              <button className="choice-card" onClick={() => void enterDemo()}>
                <span className="choice-card__icon cursor-icon" aria-hidden="true">↗</span>
                <span className="choice-card__copy"><strong>Play demo mode</strong><small>Mouse + keyboard · no camera</small></span>
                <span className="choice-card__arrow" aria-hidden="true">→</span>
              </button>
            </div>
            <PrivacyNote />
          </div>
          <p className="welcome-footer">BEST ON DESKTOP CHROME OR EDGE · HEADPHONES ON</p>
        </section>
      )}

      {screen === "permission" && (
        <section className="permission-shell" aria-labelledby="permission-title">
          <DinerBackdrop />
          <div className="diner-awning" aria-hidden="true" />
          <div className="diner-checker diner-checker--welcome" aria-hidden="true" />
          <div className="permission-card">
            <Brand compact />
            {visionStatus === "loading" || visionStatus === "ready" ? (
              <>
                <div className={`setup-ritual setup-ritual--${setupStage}`} aria-hidden="true">
                  <div className="setup-ticket">
                    <span>ORDER 01</span>
                    <span className="setup-ticket__camera"><i /></span>
                    <strong>CAMERA</strong>
                    <small>REQUESTED</small>
                  </div>
                  <span className="setup-ritual__arrow">➜</span>
                  <div className="setup-blender">
                    <span className="setup-blender__cap" />
                    <span className="setup-blender__jar"><i /><b /><b /></span>
                    <span className="setup-blender__base" />
                  </div>
                  <div className="setup-ready-burst"><span>COUNTER</span><strong>READY!</strong></div>
                </div>
                <p className="eyebrow">SETTING UP YOUR JUICE BAR</p>
                <h1 id="permission-title">
                  {setupStage === "camera" && <>Say yes at the camera prompt.</>}
                  {setupStage === "tracking" && <>Warming up the hand tracker.</>}
                  {setupStage === "ready" && <>Counter ready. Aprons on.</>}
                </h1>
                <p>
                  {setupStage === "camera" && "We only use the camera to find your hands. The video stays hidden and never leaves this device."}
                  {setupStage === "tracking" && "The hand model is loading on this device. Your hidden video is never recorded, stored, or uploaded."}
                  {setupStage === "ready" && "Tracking is ready. You’ll only see the cartoon hands the game detects — never your camera video."}
                </p>
                <ol className="setup-steps" aria-label="Camera setup progress" aria-live="polite" aria-atomic="true">
                  <li className={`is-done${setupStage === "camera" ? " is-active" : ""}`} aria-current={setupStage === "camera" ? "step" : undefined}>
                    <span>01</span><div><strong>Camera requested</strong><small>Approve the browser prompt</small></div>
                  </li>
                  <li className={`${setupStage !== "camera" ? "is-done" : ""}${setupStage === "tracking" ? " is-active" : ""}`} aria-current={setupStage === "tracking" ? "step" : undefined}>
                    <span>02</span><div><strong>Hand model loading</strong><small>Runs only on this device</small></div>
                  </li>
                  <li className={`${setupStage === "ready" ? "is-done is-active" : ""}`} aria-current={setupStage === "ready" ? "step" : undefined}>
                    <span>03</span><div><strong>Counter ready</strong><small>Cartoon hands, no video</small></div>
                  </li>
                </ol>
              </>
            ) : (
              <>
                <div className="denied-mark" aria-hidden="true">!</div>
                <p className="eyebrow eyebrow--pink">CAMERA DIDN’T OPEN</p>
                <h1 id="permission-title">No camera? No dead end.</h1>
                <p>{cameraMessage}</p>
                <div className="permission-actions">
                  <button className="button button--primary" onClick={() => void enterDemo()}>Play demo mode <span>→</span></button>
                  <button className="button button--quiet" onClick={() => void requestCamera()}>Try camera again</button>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {(screen === "tutorial" || screen === "countdown" || screen === "playing" || screen === "results") && (
        <header className="game-header">
          <Brand compact />
          {screen === "playing" && (
            <>
              <div className="served-stack">
                <span>SERVED</span><strong>{snapshot.ordersCompleted}</strong>
                {snapshot.orderStreak > 1 && <small>{snapshot.orderStreak} order streak</small>}
              </div>
              <div className="score-stack"><span>SCORE</span><strong>{snapshot.score.toLocaleString()}</strong></div>
              {roundMode === "timed" && snapshot.timeLeft !== null ? (
                <div className={`timer${timerWarning ? " timer--warning" : ""}`} style={{ "--time": `${snapshot.timeLeft / 60}turn` } as React.CSSProperties}>
                  <div><strong>{Math.ceil(snapshot.timeLeft)}</strong><span>SEC</span></div>
                </div>
              ) : (
                <div className="endless-badge" aria-label="Endless free play, no timer">
                  <strong>∞</strong><span>FREE PLAY</span>
                </div>
              )}
              <div className={`combo-stack${snapshot.combo >= 4 ? " combo-stack--hot" : ""}`}><span>COMBO</span><strong>{snapshot.combo}<i>×</i></strong></div>
            </>
          )}
          <div className="header-actions">
            {screen === "playing" && roundMode === "endless" && (
              <button className="icon-button icon-button--endless" onClick={finishEndless}>END SESSION</button>
            )}
            <button className="icon-button" onClick={toggleMute} aria-label={muted ? "Turn sound on" : "Mute sound"}>{muted ? "SOUND OFF" : "SOUND ON"}</button>
          </div>
        </header>
      )}

      {screen === "tutorial" && (
        <section className="tutorial-overlay" aria-labelledby="tutorial-title">
          <div className="tutorial-card">
            <div className="tutorial-card__head">
              <span className={`mode-badge mode-badge--${mode}`}>{mode === "camera" ? "● CAMERA MODE" : "◆ DEMO MODE"}</span>
              <span>{roundMode === "endless" ? "SESSION" : "ROUND"} {String(roundNumber).padStart(2, "0")}</span>
            </div>
            <p className="eyebrow">QUICK POUR SCHOOL</p>
            <div className="tutorial-host">
              <img src={CUSTOMER_UI.Maya.portrait} alt="Maya, a Juicers customer" />
              <div><span>MAYA SAYS</span><h1 id="tutorial-title">Three moves. Two ways to pour.</h1></div>
            </div>
            <div className="tutorial-steps">
              <article><span className="step-number">01</span><FruitDot kind="lime" /><div><strong>Read the tickets</strong><p>Squeeze any fruit a customer still needs. It fills the first matching order.</p></div></article>
              <article><span className="step-number">02</span><span className="hand-diagram" aria-hidden="true">✦</span><div><strong>Overlap + squeeze</strong><p>{mode === "camera" ? "Move either hand onto it, then close your fist." : "Move with mouse or keys, then click or press Space."}</p></div></article>
              <article><span className="step-number">03</span><span className="combo-diagram" aria-hidden="true">8×</span><div><strong>Call “order up!”</strong><p>Finish recipes for big bonuses. New customers keep joining the queue.</p></div></article>
            </div>
            {mode === "camera" ? (
              <div className="tracking-check">
                <span className="is-private"><i /> Camera on</span>
                <span className={trackedLeft ? "is-seen" : ""}><i /> Left hand</span>
                <span className={trackedRight ? "is-seen" : ""}><i /> Right hand</span>
                <small>Video hidden · bring both hands into view.</small>
              </div>
            ) : (
              <div className="demo-controls">
                <span><kbd>MOUSE</kbd> Move right hand</span><span><kbd>CLICK</kbd> Squeeze</span><span><kbd>WASD + Z</kbd> Left hand</span><span><kbd>ARROWS + M</kbd> Right hand</span>
              </div>
            )}
            <div className="round-choice" aria-label="Choose a game mode">
              <span className="round-choice__label">CHOOSE YOUR SHIFT</span>
              <div className="round-choice__grid">
                <button className="round-choice__card round-choice__card--timed" onClick={() => startRound("timed")}>
                  <span className="round-choice__icon" aria-hidden="true">60</span>
                  <span><strong>60-SECOND RUSH</strong><small>Beat the clock · ranked finish</small></span>
                  <i aria-hidden="true">→</i>
                </button>
                <button className="round-choice__card round-choice__card--endless" onClick={() => startRound("endless")}>
                  <span className="round-choice__icon" aria-hidden="true">∞</span>
                  <span><strong>ENDLESS COUNTER</strong><small>No timer · play your way</small></span>
                  <i aria-hidden="true">→</i>
                </button>
              </div>
            </div>
            <button className="text-button" onClick={switchMode}>{mode === "camera" ? "Use demo controls instead" : "Back to mode select"}</button>
          </div>
        </section>
      )}

      {screen === "playing" && (
        <>
          <section className="order-rail" aria-label="Customer orders">
            {snapshot.orders.map((order, index) => <CustomerOrderCard order={order} index={index} key={order.id} />)}
          </section>
          {mode === "camera" && (
            <aside className="status-rail" aria-label="Tracking status">
              <span className="is-private"><i /> CAMERA ON · VIDEO HIDDEN</span>
              <span className={trackedLeft ? "is-live" : ""}><i /> L HAND</span>
              <span className={trackedRight ? "is-live" : ""}><i /> R HAND</span>
            </aside>
          )}
          {mode === "camera" && handTrackingStatus === "missing" && (
            <div className="tracking-nudge" role="status" aria-live="polite">
              <span className="tracking-nudge__burst" aria-hidden="true">✦</span>
              <span className="tracking-nudge__copy">
                <small>TRACKING CHECK</small>
                <strong>HANDS NOT DETECTED</strong>
                <span>Lift both hands into view — pouring resumes automatically.</span>
              </span>
            </div>
          )}
          {(snapshot.frenzyLeft > 0 || snapshot.freezeLeft > 0) && (
            <div className="power-status">
              {snapshot.frenzyLeft > 0 && <span className="power-status__frenzy">JUICE RUSH · {Math.ceil(snapshot.frenzyLeft)}s</span>}
              {snapshot.freezeLeft > 0 && <span className="power-status__freeze">CHILL FLOW · {Math.ceil(snapshot.freezeLeft)}s</span>}
            </div>
          )}
          <div className="control-hint">{mode === "camera" ? "OVERLAP FRUIT · CLOSE FIST · REOPEN TO SQUEEZE AGAIN" : "MOVE: MOUSE / ARROWS  ·  SQUEEZE: CLICK / SPACE"}</div>
        </>
      )}

      {screen === "results" && result && (
        <section className="results-overlay" aria-labelledby="results-title">
          <div className="result-splash result-splash--one" />
          <div className="result-splash result-splash--two" />
          <div className="results-card">
            <p className="eyebrow">{roundMode === "endless" ? "FREE PLAY COMPLETE" : `ROUND ${String(roundNumber).padStart(2, "0")} COMPLETE`}</p>
            <h1 id="results-title">{result.rank}</h1>
            <div className="final-score"><span>FINAL POUR</span><strong>{result.score.toLocaleString()}</strong><small>POINTS</small></div>
            <div className="result-stats">
              <div><span>ORDERS SERVED</span><strong>{result.ordersCompleted}</strong></div>
              <div><span>BEST COMBO</span><strong>{result.bestCombo}<i>×</i></strong></div>
              <div><span>ACCURACY</span><strong>{accuracy}<i>%</i></strong></div>
            </div>
            <div className="happy-customers" aria-label={`${result.ordersCompleted} happy ${result.ordersCompleted === 1 ? "customer" : "customers"} served`}>
              <span>HAPPY REGULARS</span>
              <div>
                {customerPortraits.slice(0, Math.max(1, Math.min(customerPortraits.length, result.ordersCompleted))).map(([name, customer]) => (
                  <img src={customer.portrait} alt={name} title={name} key={name} />
                ))}
              </div>
            </div>
            <div className="result-actions">
              <button className="button button--primary" onClick={replay}>{roundMode === "endless" ? "Keep free playing" : "Pour another round"} <span>↻</span></button>
              <button className="button button--quiet" onClick={() => setScreen("tutorial")}>How to play</button>
            </div>
            <button className="text-button" onClick={switchMode}>{mode === "camera" ? "Switch to demo controls" : "Choose camera mode"}</button>
            <p className="local-note">No score was sent anywhere — this result lives only on this screen.</p>
          </div>
        </section>
      )}

      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
    </main>
  );
}
