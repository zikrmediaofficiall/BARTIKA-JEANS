/* eslint-disable @typescript-eslint/no-require-imports -- Electron main process is a CommonJS entry point. */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  shell,
  session
} = require("electron");

const APP_URL = "https://bartika-jeans.vercel.app/";
const OFFLINE_POS_URL = "https://bartika-jeans.vercel.app/offline-pos.html";
const APP_HOST = "bartika-jeans.vercel.app";
const REMOTE_LOAD_TIMEOUT_MS = 30000;
const REMOTE_START_DELAY_MS = 500;

let mainWindow = null;
let remoteLoadTimer = null;
let remotePageLoaded = false;
let fallbackShown = false;
let logFilePath = null;

function writeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\r\n`;
  try {
    if (logFilePath) {
      fs.appendFileSync(logFilePath, line, "utf8");
    } else {
      process.stderr.write(line);
    }
  } catch (_error) {
    process.stderr.write(line);
  }
}

function initializeDiagnostics() {
  try {
    const logDirectory = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logDirectory, { recursive: true });
    logFilePath = path.join(logDirectory, "startup.log");
    writeLog("--------------------------------------------------");
    writeLog(`Starting BARTIKA JEANS desktop ${app.getVersion()}`);
    writeLog(`Electron: ${process.versions.electron || "unknown"}`);
    writeLog(`Chromium: ${process.versions.chrome || "unknown"}`);
    writeLog(`Node: ${process.versions.node || "unknown"}`);
    writeLog(`Platform: ${process.platform} ${process.arch}`);
    writeLog(`Windows release: ${process.getSystemVersion ? process.getSystemVersion() : "unknown"}`);
    writeLog(`User data: ${app.getPath("userData")}`);
  } catch (error) {
    writeLog(`Could not initialize diagnostics: ${error && error.message ? error.message : error}`);
  }
}

function isTrustedAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === APP_HOST;
  } catch (_error) {
    return false;
  }
}

function openExternalSafely(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "mailto:") {
      void shell.openExternal(value);
    }
  } catch (_error) {
    writeLog(`Blocked malformed external URL: ${value}`);
  }
}

function clearRemoteLoadTimer() {
  if (remoteLoadTimer) {
    clearTimeout(remoteLoadTimer);
    remoteLoadTimer = null;
  }
}

function showLocalOfflinePage(reason) {
  if (!mainWindow || mainWindow.isDestroyed() || fallbackShown) return;
  fallbackShown = true;
  clearRemoteLoadTimer();
  writeLog(`Showing local offline/help screen: ${reason}`);
  void mainWindow.loadFile(path.join(__dirname, "offline.html")).catch((error) => {
    writeLog(`Failed to load local offline page: ${error && error.message ? error.message : error}`);
  });
}

function startRemoteNavigation() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  remotePageLoaded = false;
  fallbackShown = false;
  clearRemoteLoadTimer();

  writeLog(`Opening hosted application: ${APP_URL}`);
  remoteLoadTimer = setTimeout(() => {
    if (!remotePageLoaded) {
      showLocalOfflinePage(`Hosted application did not finish loading within ${REMOTE_LOAD_TIMEOUT_MS}ms`);
    }
  }, REMOTE_LOAD_TIMEOUT_MS);

  void mainWindow.loadURL(APP_URL).catch((error) => {
    writeLog(`Hosted application navigation failed: ${error && error.message ? error.message : error}`);
    showLocalOfflinePage("The hosted application could not be opened");
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 900,
    minWidth: 800,
    minHeight: 560,
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
      devTools: false,
      backgroundThrottling: false
    }
  });

  mainWindow.removeMenu();

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

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, description, failedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || !mainWindow) return;
    writeLog(`Main-frame load failed (${errorCode}): ${description}; URL: ${failedUrl}`);

    if (failedUrl.indexOf(APP_HOST) !== -1 || failedUrl.indexOf(OFFLINE_POS_URL) === 0) {
      showLocalOfflinePage(`Network/navigation error ${errorCode}`);
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (!mainWindow) return;
    const currentUrl = mainWindow.webContents.getURL();
    writeLog(`Page finished loading: ${currentUrl}`);
    if (isTrustedAppUrl(currentUrl)) {
      remotePageLoaded = true;
      fallbackShown = false;
      clearRemoteLoadTimer();
    }
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeLog(`Renderer process exited: ${JSON.stringify(details)}`);
    showLocalOfflinePage("The application display process stopped unexpectedly");
  });

  mainWindow.on("unresponsive", () => {
    writeLog("Application window became unresponsive");
  });

  mainWindow.on("responsive", () => {
    writeLog("Application window responded again");
  });

  mainWindow.on("closed", () => {
    writeLog("Application window closed");
    clearRemoteLoadTimer();
    mainWindow = null;
  });

  // Load local content first and reveal the window before starting any network request.
  void mainWindow.loadFile(path.join(__dirname, "startup.html")).then(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    writeLog("Local startup screen displayed");
    setTimeout(startRemoteNavigation, REMOTE_START_DELAY_MS);
  }).catch((error) => {
    writeLog(`Local startup screen failed: ${error && error.message ? error.message : error}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      startRemoteNavigation();
    }
  });
}

app.setAppUserModelId("com.bartika.jeans.desktop");

// Legacy Windows 7 machines commonly have unsupported/unstable GPU drivers.
// Disable GPU acceleration before app readiness so the UI uses Chromium's software path.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-rasterization");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");

process.on("uncaughtException", (error) => {
  writeLog(`Uncaught exception: ${error && error.stack ? error.stack : error}`);
});

process.on("unhandledRejection", (reason) => {
  writeLog(`Unhandled promise rejection: ${reason && reason.stack ? reason.stack : reason}`);
});

app.on("render-process-gone", (_event, _webContents, details) => {
  writeLog(`App renderer process gone: ${JSON.stringify(details)}`);
});

app.whenReady().then(() => {
  initializeDiagnostics();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  app.on("child-process-gone", (_event, details) => {
    writeLog(`Child process exited: ${JSON.stringify(details)}`);
  });

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}).catch((error) => {
  writeLog(`Application initialization failed: ${error && error.stack ? error.stack : error}`);
  app.quit();
});

app.on("window-all-closed", () => {
  clearRemoteLoadTimer();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  clearRemoteLoadTimer();
  writeLog("Application is closing");
});
