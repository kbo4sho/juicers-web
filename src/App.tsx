import { useCallback, useEffect, useRef, useState } from "react";
import { juiceAudio } from "./game/audio";
import { GameCanvas } from "./game/GameCanvas";
import { FRUIT_META, type FruitKind, type RoundResult, type RoundSnapshot } from "./game/model";
import {
  makeDemoFrame,
  startVisionTracking,
  type TrackingFrame,
  type VisionStatus,
} from "./game/tracking";

type Screen = "welcome" | "permission" | "tutorial" | "countdown" | "playing" | "results";
type PlayMode = "camera" | "demo";

const initialSnapshot: RoundSnapshot = {
  score: 0,
  combo: 0,
  bestCombo: 0,
  correct: 0,
  misses: 0,
  timeLeft: 60,
  target: "orange",
  frenzyLeft: 0,
  freezeLeft: 0,
};

function FruitDot({ kind, large = false }: { kind: FruitKind; large?: boolean }) {
  return (
    <span
      className={`fruit-dot fruit-dot--${kind}${large ? " fruit-dot--large" : ""}`}
      style={{ "--fruit": FRUIT_META[kind].color, "--fruit-dark": FRUIT_META[kind].dark } as React.CSSProperties}
      aria-hidden="true"
    >
      <i />
    </span>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? " brand--compact" : ""}`} aria-label="Juicers">
      <span className="brand__drop" aria-hidden="true" />
      <span className="brand__word">JUICERS</span>
      {!compact && <span className="brand__tag">MATCH · SQUEEZE · SPLASH</span>}
    </div>
  );
}

function PrivacyNote() {
  return (
    <div className="privacy-note">
      <span className="privacy-note__icon" aria-hidden="true">◆</span>
      <span><strong>On-device only.</strong> Your camera never leaves this browser. Nothing is recorded or uploaded.</span>
    </div>
  );
}

export function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [mode, setMode] = useState<PlayMode>("demo");
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
  const [, setTrackingPulse] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackingRef = useRef<TrackingFrame>(makeDemoFrame());
  const trackingCleanupRef = useRef<null | (() => void)>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    trackingCleanupRef.current?.();
    trackingCleanupRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setVisionStatus("idle");
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    if (!cameraActive || (screen !== "tutorial" && screen !== "playing")) return;
    const interval = window.setInterval(() => setTrackingPulse((value) => value + 1), 180);
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
      setCameraActive(true);

      trackingCleanupRef.current = await startVisionTracking(videoRef, trackingRef, (status, message) => {
        setVisionStatus(status);
        if (message) setCameraMessage(message);
        if (status === "ready") setScreen("tutorial");
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

  const startRound = useCallback(() => {
    void juiceAudio.unlock();
    setResult(null);
    setSnapshot(initialSnapshot);
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
    setAnnouncement(`Round complete. ${finished.rank}. Score ${finished.score}. Best combo ${finished.bestCombo}.`);
  }, []);

  const replay = useCallback(() => {
    setRoundNumber((round) => round + 1);
    startRound();
  }, [startRound]);

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

  const trackedLeft = trackingRef.current.hands.find((hand) => hand.id === "left");
  const trackedRight = trackingRef.current.hands.find((hand) => hand.id === "right");
  const accuracy = result && result.correct + result.misses > 0
    ? Math.round((result.correct / (result.correct + result.misses)) * 100)
    : 0;
  const canvasPhase = screen === "tutorial" ? "tutorial" : screen === "countdown" ? "countdown" : screen === "playing" ? "playing" : "results";
  const timerWarning = snapshot.timeLeft <= 10;

  return (
    <main className={`app app--${screen}`}>
      <video ref={videoRef} className="camera-feed" muted autoPlay playsInline aria-hidden="true" />

      {screen !== "welcome" && screen !== "permission" && (
        <GameCanvas
          phase={canvasPhase}
          playToken={playToken}
          roundNumber={roundNumber}
          countdown={countdown}
          videoRef={videoRef}
          trackingRef={trackingRef}
          cameraActive={cameraActive}
          onSnapshot={setSnapshot}
          onFinish={handleFinish}
          onAnnounce={setAnnouncement}
        />
      )}

      {screen === "welcome" && (
        <section className="welcome-shell" aria-labelledby="welcome-title">
          <div className="ambient ambient--one" />
          <div className="ambient ambient--two" />
          <div className="welcome-fruit welcome-fruit--orange"><FruitDot kind="orange" large /></div>
          <div className="welcome-fruit welcome-fruit--berry"><FruitDot kind="berry" large /></div>
          <div className="welcome-fruit welcome-fruit--lime"><FruitDot kind="lime" large /></div>
          <div className="welcome-card">
            <div className="welcome-card__topline"><span>60 SECOND MOTION ARCADE</span><span>v1.0</span></div>
            <Brand />
            <h1 id="welcome-title">Your head picks the flavor.<br /><em>Your hands make the splash.</em></h1>
            <p className="welcome-card__lede">Match the fruit above your head, catch it with either hand, then close your fist to juice it. Build the combo. Own the pour.</p>
            <div className="choice-grid">
              <button className="choice-card choice-card--primary" onClick={() => void requestCamera()}>
                <span className="choice-card__icon camera-icon" aria-hidden="true"><i /></span>
                <span className="choice-card__copy"><strong>Play with camera</strong><small>Head + two-hand tracking</small></span>
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
          <div className="permission-card">
            <Brand compact />
            {visionStatus === "loading" ? (
              <>
                <div className="loader-orbit" aria-hidden="true"><span /><span /><span /></div>
                <p className="eyebrow">SETTING UP YOUR JUICE BAR</p>
                <h1 id="permission-title">Look for your browser’s<br />camera prompt.</h1>
                <p>Once approved, we’ll load the face and hand models on this device. First setup can take a moment.</p>
                <div className="setup-steps" aria-label="Setup progress">
                  <span className="is-done">Camera requested</span><span className={cameraActive ? "is-done" : ""}>Video acquired</span><span>Motion tracking</span>
                </div>
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
              <div className="target-chip" aria-label={`Target fruit: ${FRUIT_META[snapshot.target].label}`}>
                <span className="target-chip__caption">HEAD TARGET</span>
                <FruitDot kind={snapshot.target} />
                <strong>{FRUIT_META[snapshot.target].label}</strong>
              </div>
              <div className="score-stack"><span>SCORE</span><strong>{snapshot.score.toLocaleString()}</strong></div>
              <div className={`timer${timerWarning ? " timer--warning" : ""}`} style={{ "--time": `${snapshot.timeLeft / 60}turn` } as React.CSSProperties}>
                <div><strong>{Math.ceil(snapshot.timeLeft)}</strong><span>SEC</span></div>
              </div>
              <div className={`combo-stack${snapshot.combo >= 4 ? " combo-stack--hot" : ""}`}><span>COMBO</span><strong>{snapshot.combo}<i>×</i></strong></div>
            </>
          )}
          <button className="icon-button" onClick={toggleMute} aria-label={muted ? "Turn sound on" : "Mute sound"}>{muted ? "SOUND OFF" : "SOUND ON"}</button>
        </header>
      )}

      {screen === "tutorial" && (
        <section className="tutorial-overlay" aria-labelledby="tutorial-title">
          <div className="tutorial-card">
            <div className="tutorial-card__head">
              <span className={`mode-badge mode-badge--${mode}`}>{mode === "camera" ? "● CAMERA MODE" : "◆ DEMO MODE"}</span>
              <span>ROUND {String(roundNumber).padStart(2, "0")}</span>
            </div>
            <p className="eyebrow">QUICK POUR SCHOOL</p>
            <h1 id="tutorial-title">Three moves. One minute.</h1>
            <div className="tutorial-steps">
              <article><span className="step-number">01</span><FruitDot kind="lime" /><div><strong>Match the target</strong><p>Juice only the fruit shown above your head.</p></div></article>
              <article><span className="step-number">02</span><span className="hand-diagram" aria-hidden="true">✦</span><div><strong>Overlap + squeeze</strong><p>{mode === "camera" ? "Move either hand onto it, then close your fist." : "Move with mouse or keys, then click or press Space."}</p></div></article>
              <article><span className="step-number">03</span><span className="combo-diagram" aria-hidden="true">8×</span><div><strong>Keep the pour going</strong><p>Matches grow your combo. Wrong fruit resets it.</p></div></article>
            </div>
            {mode === "camera" ? (
              <div className="tracking-check">
                <span className={trackingRef.current.head ? "is-seen" : ""}><i /> Head</span>
                <span className={trackedLeft ? "is-seen" : ""}><i /> Left hand</span>
                <span className={trackedRight ? "is-seen" : ""}><i /> Right hand</span>
                <small>Step back until your face and both hands fit in frame.</small>
              </div>
            ) : (
              <div className="demo-controls">
                <span><kbd>MOUSE</kbd> Move right hand</span><span><kbd>CLICK</kbd> Squeeze</span><span><kbd>WASD + Z</kbd> Left hand</span><span><kbd>ARROWS + M</kbd> Right hand</span>
              </div>
            )}
            <button className="button button--primary button--wide" onClick={startRound}>Start 60-second round <span>→</span></button>
            <button className="text-button" onClick={switchMode}>{mode === "camera" ? "Use demo controls instead" : "Back to mode select"}</button>
          </div>
        </section>
      )}

      {screen === "playing" && (
        <>
          <aside className="status-rail" aria-label="Tracking status">
            <span className={trackingRef.current.head ? "is-live" : ""}><i /> HEAD</span>
            <span className={trackedLeft ? "is-live" : ""}><i /> L HAND</span>
            <span className={trackedRight ? "is-live" : ""}><i /> R HAND</span>
          </aside>
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
            <p className="eyebrow">ROUND {String(roundNumber).padStart(2, "0")} COMPLETE</p>
            <h1 id="results-title">{result.rank}</h1>
            <div className="final-score"><span>FINAL POUR</span><strong>{result.score.toLocaleString()}</strong><small>POINTS</small></div>
            <div className="result-stats">
              <div><span>MATCHES</span><strong>{result.correct}</strong></div>
              <div><span>BEST COMBO</span><strong>{result.bestCombo}<i>×</i></strong></div>
              <div><span>ACCURACY</span><strong>{accuracy}<i>%</i></strong></div>
            </div>
            <div className="result-actions">
              <button className="button button--primary" onClick={replay}>Pour another round <span>↻</span></button>
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
