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
Object.assign(window, { trackingRef });
createRoot(document.getElementById("root")!).render(
  <GameCanvas phase="practice" playToken={1} roundNumber={1} roundMode="endless" countdown={0}
    trackingRef={trackingRef} cameraActive={true}
    onSnapshot={(snapshot) => { document.body.dataset.filled = String(snapshot.orders[0]?.filled.filter(Boolean).length ?? 0); }}
    onFinish={() => {}} onAnnounce={() => {}}
    onPracticeComplete={() => { document.body.dataset.practice = "complete"; }} />,
);
