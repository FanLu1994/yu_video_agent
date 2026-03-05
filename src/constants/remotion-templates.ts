export const REMOTION_TEMPLATE_IDS = [
  "classic",
  "spotlight",
  "bulletin",
] as const;

export type RemotionTemplateId = (typeof REMOTION_TEMPLATE_IDS)[number];

export interface RemotionTemplateOption {
  compositionId: string;
  description: string;
  id: RemotionTemplateId;
  label: string;
}

export const DEFAULT_REMOTION_TEMPLATE_ID: RemotionTemplateId = "classic";

export const REMOTION_TEMPLATE_OPTIONS: RemotionTemplateOption[] = [
  {
    id: "classic",
    compositionId: "AgentNarrationClassic",
    label: "经典叙事",
    description: "大标题 + 段落递进，适合通用解说视频。",
  },
  {
    id: "spotlight",
    compositionId: "AgentNarrationSpotlight",
    label: "聚焦高亮",
    description: "中心高亮当前句，适合观点强调和节奏感表达。",
  },
  {
    id: "bulletin",
    compositionId: "AgentNarrationBulletin",
    label: "信息简报",
    description: "卡片 + 时间线分段，适合新闻和资讯播报。",
  },
];

export function resolveRemotionTemplateById(templateId?: string) {
  const found = REMOTION_TEMPLATE_OPTIONS.find(
    (template) => template.id === templateId
  );
  if (found) {
    return found;
  }

  return (
    REMOTION_TEMPLATE_OPTIONS.find(
      (template) => template.id === DEFAULT_REMOTION_TEMPLATE_ID
    ) ?? REMOTION_TEMPLATE_OPTIONS[0]
  );
}
