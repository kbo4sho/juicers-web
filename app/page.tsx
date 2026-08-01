import type { Metadata } from "next";
import { JuicersGame } from "./JuicersGame";

export const metadata: Metadata = {
  title: { absolute: "Juicers — Camera-powered fruit chaos" },
  description:
    "Grab matching falling fruit with a hand pinch and juice the high score.",
};

export default function Home() {
  return <JuicersGame />;
}
