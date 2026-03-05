import { z } from "zod";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AgentNarrationSchema } from "./AgentNarration";
import { RemotionAudioTrack } from "./audio";

export const AgentNarrationBulletinSchema = AgentNarrationSchema;

export type AgentNarrationBulletinProps = z.infer<
  typeof AgentNarrationBulletinSchema
>;

export const AgentNarrationBulletin = ({
  accentColor,
  backgroundEndColor,
  backgroundStartColor,
  scriptLines,
  subtitle,
  title,
  audioPath,
}: AgentNarrationBulletinProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lineDuration = Math.max(1, Math.round(fps * 3.1));
  const activeLineIndex = Math.min(
    scriptLines.length - 1,
    Math.floor(frame / lineDuration)
  );
  const progress = (activeLineIndex + 1) / scriptLines.length;

  const enterSpring = spring({
    fps,
    frame,
    config: { damping: 14, stiffness: 95, mass: 1 },
  });

  const cardY = interpolate(enterSpring, [0, 1], [26, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(155deg, ${backgroundStartColor}, ${backgroundEndColor})`,
        color: "#e2e8f0",
        fontFamily:
          '"Geist Variable", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        padding: 62,
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <p
            style={{
              color: accentColor,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: "0.16em",
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            Bulletin
          </p>
          <h1
            style={{
              color: "#f8fafc",
              fontSize: 56,
              letterSpacing: "-0.02em",
              lineHeight: 1.12,
              margin: "10px 0 0 0",
              maxWidth: 1200,
            }}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              style={{
                color: "#cbd5e1",
                fontSize: 24,
                margin: "10px 0 0 0",
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        <div
          style={{
            border: "1px solid #ffffff24",
            borderRadius: 999,
            color: "#f8fafc",
            fontSize: 18,
            fontWeight: 600,
            padding: "8px 14px",
          }}
        >
          {activeLineIndex + 1}/{scriptLines.length}
        </div>
      </div>

      <div
        style={{
          background: "#0f172a6b",
          border: "1px solid #ffffff1a",
          borderRadius: 22,
          minHeight: 520,
          padding: "30px 34px",
          transform: `translateY(${cardY}px)`,
        }}
      >
        {scriptLines.map((line, index) => {
          const isActive = index === activeLineIndex;
          return (
            <div
              key={`${line}-${index}`}
              style={{
                alignItems: "flex-start",
                display: "flex",
                gap: 14,
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  backgroundColor: isActive ? accentColor : "#475569",
                  borderRadius: 999,
                  flexShrink: 0,
                  height: 10,
                  marginTop: 14,
                  width: 10,
                }}
              />
              <p
                style={{
                  color: isActive ? "#f8fafc" : "#94a3b8",
                  fontSize: isActive ? 37 : 29,
                  fontWeight: isActive ? 600 : 430,
                  lineHeight: 1.4,
                  margin: 0,
                  opacity: isActive ? 1 : 0.52,
                }}
              >
                {line}
              </p>
            </div>
          );
        })}
      </div>

      <div
        style={{
          background: "#0f172a80",
          borderRadius: 999,
          bottom: 44,
          height: 10,
          left: 62,
          overflow: "hidden",
          position: "absolute",
          right: 62,
        }}
      >
        <div
          style={{
            backgroundColor: accentColor,
            height: "100%",
            width: `${Math.min(100, Math.max(0, progress * 100))}%`,
          }}
        />
      </div>
      <RemotionAudioTrack audioPath={audioPath} />
    </AbsoluteFill>
  );
};
