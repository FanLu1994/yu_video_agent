import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  shell,
} from "electron";
import { ipcMain } from "electron/main";
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer";
import { UpdateSourceType, updateElectronApp } from "update-electron-app";
import { ipcContext } from "@/ipc/context";
import {
  appLogger,
  getCurrentLogFilePath,
  getLogDirectoryPath,
} from "@/services/logging/app-logger";
import { IPC_CHANNELS } from "./constants";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const inDevelopment = process.env.NODE_ENV === "development";

function logRendererConsole(
  level: number,
  message: string,
  line: number,
  sourceId: string,
  windowId: number
) {
  const meta = {
    level,
    line,
    sourceId,
    windowId,
  };
  if (level >= 2) {
    appLogger.error(`Renderer console: ${message}`, meta);
    return;
  }
  if (level === 1) {
    appLogger.warn(`Renderer console: ${message}`, meta);
    return;
  }

  appLogger.info(`Renderer console: ${message}`, meta);
}

function registerWindowDiagnostics(window: BrowserWindow) {
  const windowId = window.id;
  const { webContents } = window;

  appLogger.info("Main window created", {
    inDevelopment,
    windowId,
  });

  webContents.on(
    "console-message",
    (_event, level, message, line, sourceId) => {
      logRendererConsole(level, message, line, sourceId, windowId);
    }
  );

  webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      appLogger.error("Renderer failed to load", {
        errorCode,
        errorDescription,
        validatedURL,
        windowId,
      });
    }
  );

  webContents.on("render-process-gone", (_event, details) => {
    appLogger.error("Renderer process gone", {
      details,
      windowId,
    });
  });

  window.on("unresponsive", () => {
    appLogger.warn("Window became unresponsive", { windowId });
  });

  window.on("responsive", () => {
    appLogger.info("Window became responsive again", { windowId });
  });

  window.on("closed", () => {
    appLogger.info("Window closed", { windowId });
  });
}

function registerGlobalDiagnostics() {
  process.on("uncaughtException", (error) => {
    appLogger.error("Uncaught exception in main process", { error });
  });

  process.on("unhandledRejection", (reason) => {
    appLogger.error("Unhandled rejection in main process", { reason });
  });

  app.on("child-process-gone", (_event, details) => {
    appLogger.error("Child process gone", { details });
  });

  app.on("render-process-gone", (_event, webContents, details) => {
    appLogger.error("App-level render-process-gone event", {
      details,
      webContentsId: webContents.id,
    });
  });
}

function registerGlobalContextMenu(window: BrowserWindow) {
  const { webContents } = window;

  webContents.on("context-menu", (_event, params) => {
    const template: MenuItemConstructorOptions[] = [
      { label: "撤销", role: "undo" },
      { label: "重做", role: "redo" },
      { type: "separator" },
      { label: "剪切", role: "cut" },
      { label: "复制", role: "copy" },
      { label: "粘贴", role: "paste" },
      { label: "全选", role: "selectAll" },
      { type: "separator" },
      {
        label: "刷新渲染进程",
        click: () => {
          webContents.reload();
        },
      },
      { type: "separator" },
      {
        label: "打开日志文件夹",
        click: () => {
          const logDirectory = getLogDirectoryPath();
          shell.openPath(logDirectory).then((errorMessage) => {
            if (errorMessage) {
              appLogger.error("Failed to open log directory", {
                errorMessage,
                logDirectory,
              });
            }
          });
        },
      },
      { type: "separator" },
      {
        label: "打开开发者工具",
        click: () => {
          webContents.openDevTools({ mode: "detach" });
        },
      },
      {
        label: "检查元素",
        click: () => {
          webContents.openDevTools({ mode: "detach" });
          webContents.inspectElement(params.x, params.y);
        },
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window });
  });
}

function createWindow() {
  const preload = path.join(__dirname, "preload.js");
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,
      webSecurity: false,
      preload,
    },
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition:
      process.platform === "darwin" ? { x: 5, y: 5 } : undefined,
  });
  ipcContext.setMainWindow(mainWindow);
  registerGlobalContextMenu(mainWindow);
  registerWindowDiagnostics(mainWindow);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
}

async function installExtensions() {
  try {
    const result = await installExtension(REACT_DEVELOPER_TOOLS);
    appLogger.info("Extensions installed successfully", {
      extensionName: result.name,
    });
  } catch (error) {
    appLogger.warn("Failed to install extensions", { error });
  }
}

function checkForUpdates() {
  appLogger.info("Checking for updates");
  updateElectronApp({
    updateSource: {
      type: UpdateSourceType.ElectronPublicUpdateService,
      repo: "LuanRoger/electron-shadcn",
    },
  });
}

async function setupORPC() {
  const { rpcHandler } = await import("./ipc/handler");

  ipcMain.on(IPC_CHANNELS.START_ORPC_SERVER, (event) => {
    const [serverPort] = event.ports;
    if (!serverPort) {
      appLogger.error("ORPC server start requested without a message port");
      return;
    }

    serverPort.start();
    rpcHandler.upgrade(serverPort);
    appLogger.info("ORPC server upgraded with a new message port");
  });
}

registerGlobalDiagnostics();

app.whenReady().then(async () => {
  try {
    appLogger.info("App is ready", {
      logFilePath: getCurrentLogFilePath(),
    });
    createWindow();
    await installExtensions();
    checkForUpdates();
    await setupORPC();
  } catch (error) {
    appLogger.error("Error during app initialization", { error });
  }
});

//osX only
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    appLogger.info("All windows closed, quitting app");
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    appLogger.info("App activated with no windows, recreating main window");
    createWindow();
  }
});
//osX only ends
