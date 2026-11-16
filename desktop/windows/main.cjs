/* eslint-disable @typescript-eslint/no-require-imports -- Electron main process is a CommonJS entry point. */
"use strict";

const path = require("node:path");
const { app, BrowserWindow, shell, session } = require("electron");

const APP_URL = "https://bartika-jeans.vercel.app/";
const OFFLINE_POS_URL = "https://bartika-jeans.vercel.app/offline-pos.html";
const APP_HOST = "bartika-jeans.vercel.app";

let mainWindow = null;

function isTrustedAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === APP_HOST;
  } catch {
    return false;
  }
}

function openExternalSafely(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "mailto:") {
      void shell.openExternal(value);
    }
  } catch {
    // Ignore malformed or unsupported external URLs.
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#000010",
    title: "BARTIKA JEANS",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.once("ready-to-show", () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedAppUrl(url)) return { action: "allow" };
    openExternalSafely(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (isTrustedAppUrl(targetUrl)) return;
    event.preventDefault();
    openExternalSafely(targetUrl);
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, _description, failedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3 || !mainWindow) return;

      if (failedUrl.startsWith(OFFLINE_POS_URL)) {
        void mainWindow.loadFile(path.join(__dirname, "offline.html"));
      } else {
        void mainWindow.loadURL(OFFLINE_POS_URL);
      }
    }
  );

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(APP_URL);
}

app.setAppUserModelId("com.bartika.jeans.desktop");
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
