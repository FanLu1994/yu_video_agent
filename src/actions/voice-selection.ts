import { LOCAL_STORAGE_KEYS } from "@/constants";

export function getLastSelectedVoiceId() {
  if (typeof localStorage === "undefined") {
    return "";
  }

  return (
    localStorage.getItem(LOCAL_STORAGE_KEYS.LAST_SELECTED_VOICE_ID)?.trim() ||
    ""
  );
}

export function saveLastSelectedVoiceId(voiceId: string) {
  if (typeof localStorage === "undefined") {
    return;
  }

  const normalizedVoiceId = voiceId.trim();
  if (!normalizedVoiceId) {
    return;
  }

  localStorage.setItem(
    LOCAL_STORAGE_KEYS.LAST_SELECTED_VOICE_ID,
    normalizedVoiceId
  );
}
