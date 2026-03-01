import { os } from "@orpc/server";
import { app } from "electron";
import { runLoggedIpcHandler } from "../logging";

export const currentPlatfom = os.handler(() => {
  return runLoggedIpcHandler("app.currentPlatform", undefined, () => {
    return process.platform;
  });
});

export const appVersion = os.handler(() => {
  return runLoggedIpcHandler("app.appVersion", undefined, () => {
    return app.getVersion();
  });
});
