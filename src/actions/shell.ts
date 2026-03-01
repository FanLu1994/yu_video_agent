import { ipc } from "@/ipc/manager";

export function openExternalLink(url: string) {
  return ipc.client.shell.openExternalLink({ url });
}

export function pickAudioFile(title?: string) {
  return ipc.client.shell.pickAudioFile({ title });
}
