import { z } from "zod";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { RemotionAudioTrack } from "./audio";

export const AgentNarrationCardsSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  scriptLines: z.array(z.string()),
  accentColor: z.string(),
  backgroundStartColor: z.string(),
  backgroundEndColor: z.string(),
  audioPath: z.string().optional(),
});

export type AgentNarrationCardsProps = z.infer<
  typeof AgentNarrationCardsSchema
>;

/**
 * 卡片切换模板
 * - 每行文本以卡片形式展示
 * - 3D 翻转/滑动动画
 * - 支持多条文本堆叠显示历史
 */
export const AgentNarrationCards = ({
  accentColor,
  backgroundEndColor,
  backgroundStartColor,
  scriptLines,
  subtitle,
  title,
  audioPath,
}: AgentNarrationCardsProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 每行持续时间
  const lineDuration = Math.max(1, Math.round(fps * 4.5));
  const activeLineIndex = Math.min(
    scriptLines.length - 1,
    Math.floor(frame / lineDuration)
  );
  const frameInLine = frame - activeLineIndex * lineDuration;

  // 卡片入场动画
  const cardEnter = spring({
    fps,
    frame: frameInLine,
    config: { damping: 18, stiffness: 120, mass: 0.7 },
  });

  // 标题入场
  const titleSpring = spring({
    fps,
    frame,
    config: { damping: 15, stiffness: 80, mass: 0.8 },
  });

  // 计算可见卡片（当前 + 前两行）
  const visibleCards: { index: number; text: string }[] = [];
  for (let i = Math.max(0, activeLineIndex - 2); i <= activeLineIndex; i++) {
    visibleCards.push({ index: i, text: scriptLines[i] });
  }

  // 进度
  const progress = (activeLineIndex + 1) / scriptLines.length;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${backgroundStartColor} 0%, ${backgroundEndColor} 100%)`,
        fontFamily:
          '"Geist Variable", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        padding: 56,
      }}
    >
      {/* 顶部标题栏 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 32,
        }}
      >
        <div
          style={{
            opacity: titleSpring,
            transform: `translateY(${interpolate(titleSpring, [0, 1], [-20, 0])}px)`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                backgroundColor: accentColor,
                borderRadius: 2,
              }}
            />
            <span
              style={{
                color: "#64748b",
                fontSize: 14,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Cards View
            </span>
          </div>
          <h1
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: "#ffffff",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              style={{
                fontSize: 20,
                color: "#94a3b8",
                margin: "8px 0 0 0",
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>

        {/* 进度环 */}
        <div
          style={{
            position: "relative",
            width: 64,
            height: 64,
          }}
        >
          <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%" }}>
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="#1e293b"
              strokeWidth="2"
            />
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke={accentColor}
              strokeWidth="2"
              strokeDasharray={`${progress * 100} ${100 - progress * 100}`}
              strokeLinecap="round"
              transform="rotate(-90 18 18)"
            />
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {Math.round(progress * 100)}%
          </div>
        </div>
      </div>

      {/* 卡片区域 */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: 16,
          paddingBottom: 20,
        }}
      >
        {visibleCards.map((card, offset) => {
          const isActive = card.index === activeLineIndex;
          const cardIndex = visibleCards.length - 1 - offset;
          const isTop = cardIndex === visibleCards.length - 1;

          // 基于位置计算样式
          const scale = isTop ? 1 : 0.96 - cardIndex * 0.02;
          const opacity = isTop ? 1 : 0.5 - cardIndex * 0.15;
          const translateY = cardIndex * -20;
          const zIndex = visibleCards.length - cardIndex;

          // 当前卡片入场动画
          const enterProgress = isTop ? cardEnter : 1;
          const enterScale = interpolate(enterProgress, [0, 1], [0.9, scale]);
          const enterOpacity = interpolate(enterProgress, [0, 1], [0, opacity]);
          const enterY = interpolate(enterProgress, [0, 1], [40, 0]);

          return (
            <div
              key={card.index}
              style={{
                position: isTop ? "relative" : "absolute",
                bottom: isTop ? "auto" : 0,
                left: 0,
                right: 0,
                zIndex,
                transform: `translateY(${translateY + (isTop ? enterY : 0)}px) scale(${isTop ? enterScale : scale})`,
                opacity: isTop ? enterOpacity : opacity,
              }}
            >
              <div
                style={{
                  background: isTop
                    ? `linear-gradient(135deg, ${accentColor}20 0%, rgba(15, 23, 42, 0.8) 100%)`
                    : "rgba(15, 23, 42, 0.5)",
                  border: `1px solid ${isTop ? accentColor + "40" : "#ffffff10"}`,
                  borderRadius: 20,
                  padding: "28px 32px",
                  boxShadow: isTop
                    ? `0 20px 60px ${accentColor}20, 0 0 0 1px ${accentColor}10`
                    : "0 10px 30px rgba(0,0,0,0.2)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 16,
                  }}
                >
                  {/* 卡片编号 */}
                  <div
                    style={{
                      minWidth: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: isTop ? accentColor : "#334155",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#ffffff",
                      fontSize: 16,
                      fontWeight: 600,
                    }}
                  >
                    {card.index + 1}
                  </div>

                  {/* 文本内容 */}
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        fontSize: isTop ? 28 : 22,
                        fontWeight: isTop ? 500 : 400,
                        color: isTop ? "#ffffff" : "#94a3b8",
                        margin: 0,
                        lineHeight: 1.5,
                      }}
                    >
                      {card.text}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部装饰线 */}
      <div
        style={{
          position: "absolute",
          bottom: 56,
          left: 56,
          right: 56,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${accentColor}50, transparent)`,
          opacity: 0.5,
        }}
      />

      <RemotionAudioTrack audioPath={audioPath} />
    </AbsoluteFill>
  );
};
