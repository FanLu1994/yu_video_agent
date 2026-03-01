const VOICE_NAME_OVERRIDES_STORAGE_KEY = "voice-name-overrides";

export function loadVoiceNameOverrides() {
  if (typeof localStorage === "undefined") {
    return {} as Record<string, string>;
  }

  try {
    const raw = localStorage.getItem(VOICE_NAME_OVERRIDES_STORAGE_KEY);
    if (!raw) {
      return {} as Record<string, string>;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {} as Record<string, string>;
    }

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) {
        normalized[key] = value.trim();
      }
    }
    return normalized;
  } catch {
    return {} as Record<string, string>;
  }
}

export function resolveVoiceDisplayName(
  voiceId: string,
  defaultDisplayName: string,
  overrides: Record<string, string>
) {
  return overrides[voiceId]?.trim() || defaultDisplayName || voiceId;
}
