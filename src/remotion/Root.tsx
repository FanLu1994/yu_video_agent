import { z } from "zod";
import { type CalculateMetadataFunction, Composition } from "remotion";
import {
  AgentNarrationTypewriter,
  AgentNarrationTypewriterSchema,
} from "./AgentNarrationTypewriter";
import { AgentNarrationSubtitle } from "./AgentNarrationSubtitle";
import { AgentNarrationCards } from "./AgentNarrationCards";

export const AgentCompositionInputSchema = AgentNarrationTypewriterSchema.extend({
  durationSec: z.number().min(4).max(600),
  fps: z.number().int().min(12).max(60),
  height: z.number().int().min(360).max(4096),
  width: z.number().int().min(640).max(4096),
});

export type AgentCompositionInput = z.infer<typeof AgentCompositionInputSchema>;

const calculateMetadata: CalculateMetadataFunction<AgentCompositionInput> = ({
  props,
}) => {
  const estimatedByLines = Math.max(
    Math.ceil(props.scriptLines.length * props.fps * 4),
    Math.ceil(props.durationSec * props.fps)
  );

  return {
    durationInFrames: estimatedByLines,
    fps: props.fps,
    width: props.width,
    height: props.height,
    props,
  };
};

export const RemotionRoot = () => {
  const commonDefaultProps = {
    title: "Video Agent 默认叙事视频",
    subtitle: "Remotion Render",
    scriptLines: [
      "这是一个默认脚本片段，用于本地验证渲染链路。",
      "可以在任务创建时配置 prompt 与渲染参数，生成定制视频。",
    ],
    accentColor: "#38bdf8",
    backgroundStartColor: "#0f172a",
    backgroundEndColor: "#1e293b",
    durationSec: 24,
    fps: 30,
    width: 1920,
    height: 1080,
  } satisfies AgentCompositionInput;

  return (
    <>
      <Composition
        id="AgentNarrationTypewriter"
        component={AgentNarrationTypewriter}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={commonDefaultProps}
        schema={AgentCompositionInputSchema}
        calculateMetadata={calculateMetadata}
      />
      <Composition
        id="AgentNarrationSubtitle"
        component={AgentNarrationSubtitle}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={commonDefaultProps}
        schema={AgentCompositionInputSchema}
        calculateMetadata={calculateMetadata}
      />
      <Composition
        id="AgentNarrationCards"
        component={AgentNarrationCards}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={commonDefaultProps}
        schema={AgentCompositionInputSchema}
        calculateMetadata={calculateMetadata}
      />
    </>
  );
};
