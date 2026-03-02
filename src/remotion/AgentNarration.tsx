import { z } from "zod";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const AgentNarrationSchema = z.object({
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundEndColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundStartColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  scriptLines: z.array(z.string().min(1)).min(1),
  subtitle: z.string().optional(),
  title: z.string().min(1),
  audioPath: z.string().optional(),
});

export type AgentNarrationProps = z.infer<typeof AgentNarrationSchema>;

export const AgentNarration = ({
  accentColor,
  backgroundEndColor,
  backgroundStartColor,
  scriptLines,
  subtitle,
  title,
}: AgentNarrationProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lineDuration = Math.max(1, Math.round(fps * 3.2));
  const activeLineIndex = Math.min(
    scriptLines.length - 1,
    Math.floor(frame / lineDuration)
  );

  const frameInLine = frame - activeLineIndex * lineDuration;
  const lineOpacity = interpolate(
    frameInLine,
    [0, Math.round(fps * 0.6), Math.round(fps * 2.5), lineDuration],
    [0, 1, 1, 0.15],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    }
  );

  const titleSpring = spring({
    fps,
    frame,
    config: {
      damping: 14,
      stiffness: 110,
      mass: 0.9,
    },
  });

  const titleTranslate = interpolate(titleSpring, [0, 1], [42, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(140deg, ${backgroundStartColor}, ${backgroundEndColor})`,
        color: "#f8fafc",
        fontFamily:
          '"Geist Variable", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        padding: 72,
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 10,
          marginBottom: 22,
        }}
      >
        <div
          style={{
            backgroundColor: accentColor,
            borderRadius: 999,
            height: 10,
            width: 10,
          }}
        />
        <span
          style={{
            color: "#cbd5e1",
            fontSize: 24,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Agent Narrative Render
        </span>
      </div>

      <h1
        style={{
          fontSize: 70,
          fontWeight: 620,
          letterSpacing: "-0.02em",
          lineHeight: 1.12,
          margin: 0,
          maxWidth: "90%",
          opacity: titleSpring,
          transform: `translateY(${titleTranslate}px)`,
        }}
      >
        {title}
      </h1>

      <div
        style={{
          marginTop: 38,
          maxWidth: "88%",
        }}
      >
        {scriptLines.map((line, index) => {
          const isActive = index === activeLineIndex;
          return (
            <p
              key={`${line}-${index}`}
              style={{
                color: isActive ? "#f8fafc" : "#94a3b8",
                fontSize: isActive ? 40 : 30,
                fontWeight: isActive ? 560 : 440,
                lineHeight: 1.45,
                margin: "0 0 18px 0",
                opacity: isActive ? lineOpacity : 0.24,
              }}
            >
              {line}
            </p>
          );
        })}
      </div>

      {subtitle ? (
        <div
          style={{
            alignItems: "center",
            bottom: 44,
            color: "#cbd5e1",
            display: "flex",
            fontSize: 22,
            left: 72,
            letterSpacing: "0.01em",
            maxWidth: "86%",
            opacity: 0.9,
            position: "absolute",
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
