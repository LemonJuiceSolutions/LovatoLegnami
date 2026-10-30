import { Easing } from "remotion";
import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadDMSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Token da ../style-guide.md
export const C = {
  ink: "#0B0C14",
  ink2: "#1C1E2E",
  night: "#0A0A14",
  paper: "#FFFFFF",
  cream: "#F6F5F1",
  cyan: "#00B8E0",
  purple: "#6E20C2",
  magenta: "#C230D6",
  green: "#0F9D6B",
  red: "#E40014",
  mutedOnInk: "rgba(255,255,255,0.62)",
  lineOnInk: "rgba(255,255,255,0.10)",
  mutedOnCream: "rgba(11,12,20,0.68)",
  lineOnCream: "rgba(11,12,20,0.12)",
};

// accent-gradient di brand (#0096C9 → #6E2BD0 → #C230D6) e la sua variante per testo su fondo ink
export const GRADIENT = "linear-gradient(100deg, #0096C9 0%, #6E2BD0 55%, #C230D6 100%)";
export const GRADIENT_ON_INK = "linear-gradient(100deg, #38D6FF 0%, #9D7BFF 55%, #EE6BFF 100%)";

export const EASE = Easing.bezier(0.22, 1, 0.36, 1);

const display = loadBricolage("normal", { weights: ["400", "600", "700", "800"], subsets: ["latin"] });
const body = loadDMSans("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });

export const F = {
  display: display.fontFamily,
  body: body.fontFamily,
  mono: mono.fontFamily,
};

export type Layout = "16:9" | "9:16";
