import { z } from "zod";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AgentNarrationSchema } from "./AgentNarration";

export const AgentNarrationSpotlightSchema = AgentNarrationSchema;

export type AgentNarrationSpotlightProps = z.infer<
  typeof AgentNarrationSpotlightSchema
>;

export const AgentNarrationSpotlight = ({
  accentColor,
  backgroundEndColor,
  backgroundStartColor,
  scriptLines,
  subtitle,
  title,
}: AgentNarrationSpotlightProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lineDuration = Math.max(1, Math.round(fps * 3));
  const activeLineIndex = Math.min(
    scriptLines.length - 1,
    Math.floor(frame / lineDuration)
  );
  const frameInLine = frame - activeLineIndex * lineDuration;

  const activeLineOpacity = interpolate(
    frameInLine,
    [0, Math.round(fps * 0.4), Math.round(fps * 2.1), lineDuration],
    [0.35, 1, 1, 0.35],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }
  );

  const cardSpring = spring({
    fps,
    frame,
    config: { damping: 16, stiffness: 120, mass: 0.8 },
  });

  const cardScale = interpolate(cardSpring, [0, 1], [0.97, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 25%, ${accentColor}25 0%, ${backgroundEndColor} 45%, ${backgroundStartColor} 100%)`,
        color: "#e2e8f0",
        fontFamily:
          '"Geist Variable", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        padding: 64,
      }}
    >
      <div
        style={{
          border: "1px solid #ffffff20",
          borderRadius: 28,
          boxShadow: `0 20px 80px ${accentColor}30`,
          margin: "auto",
          maxWidth: "88%",
          padding: "48px 52px",
          transform: `scale(${cardScale})`,
          backdropFilter: "blur(4px)",
          background: "#0f172a66",
        }}
      >
        <p
          style={{
            color: accentColor,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "0.14em",
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          Spotlight
        </p>
        <h1
          style={{
            color: "#f8fafc",
            fontSize: 64,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            margin: "14px 0 0 0",
          }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            style={{
              color: "#cbd5e1",
              fontSize: 24,
              margin: "14px 0 0 0",
            }}
          >
            {subtitle}
          </p>
        ) : null}

        <div style={{ marginTop: 38 }}>
          {scriptLines.map((line, index) => {
            const isActive = index === activeLineIndex;
            return (
              <p
                key={`${line}-${index}`}
                style={{
                  color: isActive ? "#ffffff" : "#94a3b8",
                  fontSize: isActive ? 42 : 29,
                  fontWeight: isActive ? 620 : 450,
                  lineHeight: 1.42,
                  margin: "0 0 16px 0",
                  opacity: isActive ? activeLineOpacity : 0.36,
                  textShadow: isActive ? `0 0 22px ${accentColor}90` : "none",
                }}
              >
                {line}
              </p>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
