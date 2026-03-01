export interface RemotionPracticeSection {
  details: string[];
  title: string;
}

export const REMOTION_BEST_PRACTICES: RemotionPracticeSection[] = [
  {
    title: "1. 参数化 Composition（Zod Schema）",
    details: [
      "在 Composition 上声明 `schema`，把可调参数（标题、颜色、文案、时长）都收敛为结构化输入。",
      "顶层必须是 `z.object()`，这样 Remotion Studio 和渲染入口都能保持一致参数契约。",
    ],
  },
  {
    title: "2. 使用 calculateMetadata 动态计算输出",
    details: [
      "根据 props 动态返回 `durationInFrames / fps / width / height`，避免硬编码时长。",
      "当脚本长度变化时，渲染元信息会自动同步，减少手工维护。",
    ],
  },
  {
    title: "3. 动画只用时间轴驱动",
    details: [
      "所有动画基于 `useCurrentFrame()` + `useVideoConfig()` + `interpolate()`/`spring()`。",
      "避免 CSS transition 或 Tailwind 动画类，保证离线渲染与预览一致。",
    ],
  },
  {
    title: "4. 资源引用规范",
    details: [
      "静态资源统一放在 `public/` 并通过 `staticFile()` 引用。",
      "远程资源可直接 URL 引用，但要注意网络稳定性与可复现性。",
    ],
  },
  {
    title: "5. FFmpeg 与二进制策略",
    details: [
      "优先走 Remotion Renderer 内置二进制能力，不要求用户单独安装全局 ffmpeg。",
      "需要额外媒体处理时，可调用 `remotion ffmpeg/ffprobe`，保持工具链一致。",
    ],
  },
  {
    title: "6. 渲染链路建议",
    details: [
      "先 `bundle` 再 `selectComposition` 再 `renderMedia`，并在作业日志中记录阶段信息。",
      "渲染输出时同时落地 `manifest.json` 与 `timeline`，便于复跑与追溯。",
    ],
  },
];
