import { os } from "@orpc/server";
import { dialog, shell } from "electron";
import { ipcContext } from "../context";
import { runLoggedIpcHandler } from "../logging";
import {
  openExternalLinkInputSchema,
  pickAudioFileInputSchema,
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
