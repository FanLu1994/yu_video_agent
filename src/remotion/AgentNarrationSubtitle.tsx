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

export const AgentNarrationSubtitleSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  scriptLines: z.array(z.string()),
  accentColor: z.string(),
  backgroundStartColor: z.string(),
  backgroundEndColor: z.string(),
  audioPath: z.string().optional(),
});

export type AgentNarrationSubtitleProps = z.infer<
  typeof AgentNarrationSubtitleSchema
>;

/**
 * 字幕滚动模板 - 底部固定字幕，类似短视频风格
 * - 大面积背景展示
 * - 底部字幕条逐字显示
 * - 适合配合图片/视频背景使用
 */
export const AgentNarrationSubtitle = ({
  accentColor,
  backgroundEndColor,
  backgroundStartColor,
  scriptLines,
  subtitle,
  title,
  audioPath,
}: AgentNarrationSubtitleProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 每行持续时间
  const lineDuration = Math.max(1, Math.round(fps * 4));
  const activeLineIndex = Math.min(
    scriptLines.length - 1,
    Math.floor(frame / lineDuration)
  );
  const frameInLine = frame - activeLineIndex * lineDuration;

  // 打字机效果
  const typingDuration = lineDuration * 0.7;
  const visibleChars = interpolate(
    frameInLine,
    [Math.round(fps * 0.2), typingDuration],
    [0, scriptLines[activeLineIndex]?.length || 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.quad),
    }
  );

  // 字幕条淡入淡出
  const barOpacity = interpolate(
    frameInLine,
    [0, Math.round(fps * 0.15), lineDuration - Math.round(fps * 0.3), lineDuration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // 标题入场
  const titleSpring = spring({
    fps,
    frame,
    config: { damping: 20, stiffness: 100, mass: 0.6 },
  });

  const currentText = scriptLines[activeLineIndex] || "";
  const visibleText = currentText.slice(0, Math.round(visibleChars));

  // 进度
  const totalFrames = scriptLines.length * lineDuration;
  const progress = Math.min(1, frame / totalFrames);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${backgroundStartColor} 0%, ${backgroundEndColor} 100%)`,
        fontFamily:
          '"Geist Variable", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
      }}
    >
      {/* 主内容区域 */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 180,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: 60,
        }}
      >
        {/* 装饰元素 */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${accentColor}15 0%, transparent 70%)`,
          }}
        />

        {/* 标题 */}
        <div
          style={{
            textAlign: "center",
            opacity: titleSpring,
            transform: `translateY(${interpolate(titleSpring, [0, 1], [30, 0])}px)`,
          }}
        >
          <h1
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: "#ffffff",
              margin: 0,
              letterSpacing: "-0.03em",
              textShadow: `0 4px 30px ${accentColor}40`,
            }}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              style={{
                fontSize: 26,
                color: "#94a3b8",
                margin: "16px 0 0 0",
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>

        {/* 行号指示 */}
        <div
          style={{
            position: "absolute",
            right: 60,
            bottom: 40,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 50,
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
              }}
            />
          </div>
          <span
            style={{
              color: "#64748b",
              fontSize: 14,
              fontFamily: "monospace",
            }}
          >
            {String(activeLineIndex + 1).padStart(2, "0")}/{String(scriptLines.length).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* 底部字幕条 */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "24px 40px",
          background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 70%, transparent 100%)",
          opacity: barOpacity,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          {/* 语音波纹指示器 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              height: 32,
            }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  width: 4,
                  height: 12 + Math.sin((frame * 0.3 + i * 0.8)) * 10,
                  backgroundColor: accentColor,
                  borderRadius: 2,
                }}
              />
            ))}
          </div>

          {/* 字幕文本 */}
          <p
            style={{
              fontSize: 32,
              fontWeight: 500,
              color: "#ffffff",
              margin: 0,
              lineHeight: 1.4,
              flex: 1,
            }}
          >
            {visibleText}
          </p>
        </div>
      </div>

      <RemotionAudioTrack audioPath={audioPath} />
    </AbsoluteFill>
  );
};
