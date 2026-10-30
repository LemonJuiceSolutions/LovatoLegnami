import React from "react";
import { Composition, getStaticFiles, staticFile, type CalculateMetadataFunction } from "remotion";
import { Main, type MainProps } from "./Main";
import { TOTAL_FRAMES, totalFramesFor } from "./data/scenes";
import { parseSrt } from "./components/Subtitles";

const FPS = 30;

const calculateMetadata: CalculateMetadataFunction<MainProps> = async ({ props }) => {
  const recordings = getStaticFiles()
    .map((f) => f.name)
    .filter((n) => n.startsWith("recordings/"));
  const lang = props.lang ?? "it";
  // versione inglese: voce inglese, sottotitoli italiani allineati alle frasi inglesi
  const srt = await fetch(staticFile(lang === "en" ? "subtitles.en-it.srt" : "subtitles.srt")).then((r) => r.text());
  return { durationInFrames: totalFramesFor(lang), props: { ...props, recordings, cues: parseSrt(srt) } };
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Espeiria16x9"
      component={Main}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={TOTAL_FRAMES}
      defaultProps={{ layout: "16:9", recordings: [], cues: [] } satisfies MainProps}
      calculateMetadata={calculateMetadata}
    />
    <Composition
      id="Espeiria9x16"
      component={Main}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={TOTAL_FRAMES}
      defaultProps={{ layout: "9:16", recordings: [], cues: [] } satisfies MainProps}
      calculateMetadata={calculateMetadata}
    />
    <Composition
      id="EspeiriaEN16x9"
      component={Main}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={totalFramesFor("en")}
      defaultProps={{ layout: "16:9", recordings: [], cues: [], lang: "en" } satisfies MainProps}
      calculateMetadata={calculateMetadata}
    />
  </>
);
