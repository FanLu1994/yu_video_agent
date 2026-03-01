import { os } from "@orpc/server";
import { ipcContext } from "../context";
import { runLoggedIpcHandler } from "../logging";

export const minimizeWindow = os
  .use(ipcContext.mainWindowContext)
  .handler(({ context }) => {
    return runLoggedIpcHandler("window.minimizeWindow", undefined, () => {
      const { window } = context;

      window.minimize();
    });
  });

export const maximizeWindow = os
  .use(ipcContext.mainWindowContext)
  .handler(({ context }) => {
    return runLoggedIpcHandler("window.maximizeWindow", undefined, () => {
      const { window } = context;

      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
    });
  });

export const closeWindow = os
  .use(ipcContext.mainWindowContext)
  .handler(({ context }) => {
    return runLoggedIpcHandler("window.closeWindow", undefined, () => {
      const { window } = context;

      window.close();
    });
  });
