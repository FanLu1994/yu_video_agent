import { ipc } from "@/ipc/manager";

export function createVoiceClone(
  input: Parameters<typeof ipc.client.voiceClone.createVoiceClone>[0]
) {
  return ipc.client.voiceClone.createVoiceClone(input);
}

export function listVoiceProfiles() {
  return ipc.client.voiceClone.listVoices();
}

export function getVoiceProfile(voiceId: string) {
  return ipc.client.voiceClone.getVoice({ voiceId });
}

export function synthesizePreviewVoice(input: {
  voiceId: string;
  text: string;
}) {
  return ipc.client.voiceClone.synthesizePreviewVoice(input);
}

export function getCachedPreviewVoice(voiceId: string) {
  return ipc.client.voiceClone.getCachedPreviewVoice({ voiceId });
}
