import { os } from "@orpc/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { dialog, shell } from "electron";
import { getDataRootPath } from "@/services/storage/runtime-paths";
import { ipcContext } from "../context";
import { runLoggedIpcHandler } from "../logging";
import {
  openExternalLinkInputSchema,
  pickAudioFileInputSchema,
  saveRecordedAudioInputSchema,
} from "./schemas";

export const openExternalLink = os
  .input(openExternalLinkInputSchema)
  .handler(({ input }) => {
    return runLoggedIpcHandler("shell.openExternalLink", input, () => {
      const { url } = input;
      return shell.openExternal(url);
    });
  });

export const pickAudioFile = os
  .use(ipcContext.mainWindowContext)
  .input(pickAudioFileInputSchema)
  .handler(({ context, input }) => {
    return runLoggedIpcHandler("shell.pickAudioFile", input, async () => {
      const result = await dialog.showOpenDialog(context.window, {
        title: input.title ?? "选择音频文件",
        properties: ["openFile"],
        filters: [
          {
            name: "Audio",
            extensions: ["mp3", "m4a", "wav"],
          },
        ],
      });

      if (result.canceled) {
        return null;
      }

      return result.filePaths[0] ?? null;
    });
  });

export const saveRecordedAudio = os
  .input(saveRecordedAudioInputSchema)
  .handler(({ input }) => {
    return runLoggedIpcHandler("shell.saveRecordedAudio", input, async () => {
      const extension = input.extension ?? "wav";
      const prefix = input.fileNamePrefix?.trim() || "recorded-voice";
      const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "_");
      const recordingsDir = path.join(getDataRootPath(), "voice", "recordings");
      await mkdir(recordingsDir, { recursive: true });

      const fileName = `${safePrefix}-${Date.now()}.${extension}`;
      const filePath = path.join(recordingsDir, fileName);
      const audioBuffer = Buffer.from(input.base64Audio, "base64");
      await writeFile(filePath, audioBuffer);

      return filePath;
    });
  });
