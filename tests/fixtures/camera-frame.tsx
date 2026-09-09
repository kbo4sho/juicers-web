import React from "react";
import { createRoot } from "react-dom/client";
import { GameCanvas } from "../../src/game/GameCanvas";
import type { TrackingFrame } from "../../src/game/tracking";
import "../../src/styles.css";

const trackingRef: { current: TrackingFrame } = {
  current: {
    source: "camera", updatedAt: performance.now(),
    hands: [
      { id: "left", x: 0.1, y: 0.6, closed: false, confidence: 1 },
      { id: "right", x: 0.9, y: 0.6, closed: false, confidence: 1 },
    ],
  },
};
const selectOrderRef = { current: null as number | null };
const playing = new URLSearchParams(location.search).has("playing");
Object.assign(window, { trackingRef, selectOrderRef });
createRoot(document.getElementById("root")!).render(
  <GameCanvas phase={playing ? "playing" : "practice"} playToken={1} roundNumber={1} roundMode="endless" countdown={0}
    trackingRef={trackingRef} cameraActive={true} selectOrderRef={selectOrderRef}
    onSnapshot={(snapshot) => { Object.assign(window, { snapshot }); document.body.dataset.selected = String(snapshot.aimedOrderId); document.body.dataset.filled = String(snapshot.orders[0]?.filled.filter(Boolean).length ?? 0); }}
    onFinish={() => {}} onAnnounce={() => {}}
    onPracticeComplete={() => { document.body.dataset.practice = "complete"; }} />,
);
