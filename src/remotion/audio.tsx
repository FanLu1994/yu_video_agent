import { Audio } from "remotion";

export const normalizeAudioSrc = (audioPath: string) => {
  if (/^(https?:\/\/|data:|blob:|file:\/\/)/i.test(audioPath)) {
    return audioPath;
  }

  if (/^[a-zA-Z]:[\\/]/.test(audioPath)) {
    const windowsPath = audioPath.replace(/\\/g, "/");
    return encodeURI(`file:///${windowsPath}`);
  }

  if (audioPath.startsWith("/")) {
    return encodeURI(`file://${audioPath}`);
  }

  return audioPath;
};

export const RemotionAudioTrack = ({
  audioPath,
}: {
  audioPath?: string;
}) => {
  const audioSrc = audioPath ? normalizeAudioSrc(audioPath) : undefined;
  return audioSrc ? <Audio src={audioSrc} /> : null;
};
