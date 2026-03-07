export const REMOTION_TEMPLATE_IDS = ["typewriter"] as const;

export type RemotionTemplateId = (typeof REMOTION_TEMPLATE_IDS)[number];

export interface RemotionTemplateOption {
  compositionId: string;
  description: string;
  id: RemotionTemplateId;
  label: string;
}

export const DEFAULT_REMOTION_TEMPLATE_ID: RemotionTemplateId = "typewriter";

export const REMOTION_TEMPLATE_OPTIONS: RemotionTemplateOption[] = [
  {
    id: "typewriter",
    compositionId: "AgentNarrationTypewriter",
    label: "打字机",
    description: "逐字展示文本，配合光标闪烁，简洁大气。",
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
