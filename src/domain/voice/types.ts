export type VoiceCloneStatus = "ready" | "failed";

export interface CreateVoiceCloneRequest {
  providerId: string;
  voiceId: string;
  cloneAudioPath: string;
  promptAudioPath?: string;
  promptText?: string;
  sampleText: string;
  model: string;
}

export interface VoiceProfile {
  voiceId: string;
  providerId: string;
  status: VoiceCloneStatus;
  sourceAudioPath: string;
  promptAudioPath?: string;
  previewAudioPath?: string;
  previewAudioUrl?: string;
  rawResponseSnapshotPath: string;
  createdAt: string;
}
