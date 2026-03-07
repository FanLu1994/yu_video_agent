import { z } from "zod";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { RemotionAudioTrack } from "./audio";

export const AgentNarrationTypewriterSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  scriptLines: z.array(z.string()),
  accentColor: z.string(),
  backgroundStartColor: z.string(),
  backgroundEndColor: z.string(),
  audioPath: z.string().optional(),
});

export type AgentNarrationTypewriterProps = z.infer<
  typeof AgentNarrationTypewriterSchema
>;

/**
 * 打字机风格模板
 * - 逐字显示当前行文本
 * - 旧行淡出，新行淡入
 * - 简洁大气的居中排版
 */
export const AgentNarrationTypewriter = ({
  accentColor,
  backgroundEndColor,
  backgroundStartColor,
  scriptLines,
  subtitle,
  title,
  audioPath,
}: AgentNarrationTypewriterProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 每行持续时间（秒），根据文本长度动态调整
  const baseLineDurationSec = 3.5;
  const charDurationSec = 0.08; // 每个字符额外时间

  // 计算每行的持续时间
  const lineDurations = scriptLines.map(
    (line) =>
      Math.round(
        fps *
          (baseLineDurationSec +
            Math.min(line.length * charDurationSec, 2.5)) // 上限 2.5 秒额外时间
      )
  );

  // 计算累计帧数，确定当前行
  const cumulativeFrames = lineDurations.reduce(
    (acc, duration, index) => {
      acc.push(index === 0 ? duration : acc[index - 1] + duration);
      return acc;
    },
    [] as number[]
  );

  const activeLineIndex = Math.min(
    scriptLines.length - 1,
    cumulativeFrames.findIndex((cumFrame) => frame < cumFrame)
  );

  const frameInLine =
    activeLineIndex === 0
      ? frame
      : frame - cumulativeFrames[activeLineIndex - 1];

  const currentLineDuration = lineDurations[activeLineIndex] || fps * 4;

  // 打字机效果：计算当前应该显示的字符数
  const typingDuration = Math.min(
    currentLineDuration * 0.6, // 用 60% 的时间打字
    fps * 2.5 // 最多 2.5 秒打完
  );

  const visibleChars = interpolate(
    frameInLine,
    [0, typingDuration],
    [0, scriptLines[activeLineIndex]?.length || 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.quad),
    }
  );

  // 当前行淡入淡出
  const fadeInDuration = Math.round(fps * 0.4);
  const fadeOutStart = currentLineDuration - Math.round(fps * 0.5);

  const lineOpacity = interpolate(
    frameInLine,
    [0, fadeInDuration, fadeOutStart, currentLineDuration],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  // 行入场动画（Y轴位移）
  const lineY = interpolate(
    frameInLine,
    [0, fadeInDuration],
    [30, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }
  );

  // 标题入场动画
  const titleSpring = spring({
    fps,
    frame,
    config: {
      damping: 15,
      stiffness: 100,
      mass: 0.8,
    },
  });

  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const titleY = interpolate(titleSpring, [0, 1], [-20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 光标闪烁
  const cursorBlink = Math.sin(frame * 0.15) > 0;

  // 进度条
  const totalFrames = cumulativeFrames[cumulativeFrames.length - 1] || fps * 10;
  const progress = Math.min(1, frame / totalFrames);

  // 当前行文本
  const currentText = scriptLines[activeLineIndex] || "";
  const visibleText = currentText.slice(0, Math.round(visibleChars));

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(145deg, ${backgroundStartColor}, ${backgroundEndColor})`,
        color: "#f1f5f9",
        fontFamily:
          '"Geist Variable", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        display: "flex",
        flexDirection: "column",
        padding: 80,
      }}
    >
      {/* 顶部标题区域 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 60,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        <div
          style={{
            backgroundColor: accentColor,
            borderRadius: 6,
            width: 6,
            height: 32,
          }}
        />
        <div>
          <h1
            style={{
              fontSize: 52,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              lineHeight: 1.15,
              margin: 0,
              color: "#ffffff",
            }}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              style={{
                fontSize: 22,
                color: "#94a3b8",
                margin: "8px 0 0 0",
                letterSpacing: "0.02em",
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      {/* 主文本区域 - 居中 */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            opacity: lineOpacity,
            transform: `translateY(${lineY}px)`,
            maxWidth: "85%",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: 56,
              fontWeight: 500,
              lineHeight: 1.5,
              margin: 0,
              color: "#f8fafc",
              textShadow: `0 4px 24px ${accentColor}30`,
            }}
          >
            {visibleText}
            <span
              style={{
                display: "inline-block",
                width: 4,
                height: 52,
                backgroundColor: cursorBlink ? accentColor : "transparent",
                marginLeft: 4,
                verticalAlign: "middle",
                borderRadius: 2,
              }}
            />
          </p>
        </div>
      </div>

      {/* 底部信息 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* 行号指示器 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#64748b",
            fontSize: 16,
          }}
        >
          <span
            style={{
              color: accentColor,
              fontWeight: 600,
            }}
          >
            {String(activeLineIndex + 1).padStart(2, "0")}
          </span>
          <span>/</span>
          <span>{String(scriptLines.length).padStart(2, "0")}</span>
        </div>

        {/* 进度条 */}
        <div
          style={{
            width: 240,
            height: 4,
            backgroundColor: "#1e293b",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress * 100}%`,
              height: "100%",
              backgroundColor: accentColor,
              borderRadius: 999,
              transition: "width 0.1s ease-out",
            }}
          />
        </div>
      </div>

      <RemotionAudioTrack audioPath={audioPath} />
    </AbsoluteFill>
  );
};
