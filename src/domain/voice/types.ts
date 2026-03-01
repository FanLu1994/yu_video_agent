export type VoiceCloneStatus = "ready" | "failed";

export interface CreateVoiceCloneRequest {
  cloneAudioPath: string;
  model: string;
  promptAudioPath?: string;
  promptText?: string;
  providerId: string;
  sampleText: string;
  voiceId: string;
}

export interface VoiceProfile {
  createdAt: string;
  displayName: string;
  previewAudioPath?: string;
  previewAudioUrl?: string;
  previewText?: string;
  previewUpdatedAt?: string;
  promptAudioPath?: string;
  providerId: string;
  rawResponseSnapshotPath: string;
  sourceAudioPath: string;
  status: VoiceCloneStatus;
  voiceId: string;
}
