import { ipc } from "@/ipc/manager";

export function openExternalLink(url: string) {
  return ipc.client.shell.openExternalLink({ url });
}

export function pickAudioFile(title?: string) {
  return ipc.client.shell.pickAudioFile({ title });
}

export function saveRecordedAudio(input: {
  base64Audio: string;
  extension?: "wav" | "mp3" | "m4a";
  fileNamePrefix?: string;
}) {
  return ipc.client.shell.saveRecordedAudio(input);
}
