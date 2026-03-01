import { os } from "@orpc/server";
import { nativeTheme } from "electron";
import { runLoggedIpcHandler } from "../logging";
import { setThemeModeInputSchema } from "./schemas";

export const getCurrentThemeMode = os.handler(() => {
  return runLoggedIpcHandler("theme.getCurrentThemeMode", undefined, () => {
    return nativeTheme.themeSource;
  });
});

export const toggleThemeMode = os.handler(() => {
  return runLoggedIpcHandler("theme.toggleThemeMode", undefined, () => {
    if (nativeTheme.shouldUseDarkColors) {
      nativeTheme.themeSource = "light";
    } else {
      nativeTheme.themeSource = "dark";
    }

    return nativeTheme.shouldUseDarkColors;
  });
});

export const setThemeMode = os
  .input(setThemeModeInputSchema)
  .handler(({ input: mode }) => {
    return runLoggedIpcHandler("theme.setThemeMode", mode, () => {
      switch (mode) {
        case "light":
          nativeTheme.themeSource = "light";
          break;
        case "dark":
          nativeTheme.themeSource = "dark";
          break;
        case "system":
          nativeTheme.themeSource = "system";
          break;
        default:
          nativeTheme.themeSource = "system";
          break;
      }

      return nativeTheme.themeSource;
    });
  });
