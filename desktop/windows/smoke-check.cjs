"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const main = fs.readFileSync(path.join(root, "main.cjs"), "utf8");
const startup = fs.readFileSync(path.join(root, "startup.html"), "utf8");
const offline = fs.readFileSync(path.join(root, "offline.html"), "utf8");

assert.equal(packageJson.devDependencies.electron, "22.3.27", "Windows 7 build must use the last Electron major supporting Windows 7");
assert.ok(packageJson.build.files.includes("startup.html"), "startup.html must be packaged");
assert.ok(packageJson.build.files.includes("offline.html"), "offline.html must be packaged");
assert.equal(packageJson.build.nsis.createDesktopShortcut, true, "installer must create a desktop shortcut");
assert.equal(packageJson.build.nsis.createStartMenuShortcut, true, "installer must create a Start Menu shortcut");
assert.match(main, /app\.disableHardwareAcceleration\(\)/, "legacy GPU acceleration must be disabled");
assert.match(main, /REMOTE_LOAD_TIMEOUT_MS\s*=\s*30000/, "remote startup must have a bounded timeout");
assert.match(main, /isTrustedLocalPage/, "only packaged local startup pages must be allow-listed");
assert.match(main, /render-process-gone/, "renderer crashes must be diagnosed");
assert.match(main, /startup\.log/, "startup diagnostics must be written to a log file");
assert.ok(
  main.indexOf('mainWindow.show();', main.indexOf('loadFile(path.join(__dirname, "startup.html"))')) <
    main.indexOf("setTimeout(startRemoteNavigation"),
  "window must be shown before the remote website is opened"
);
assert.match(startup, /جاري تشغيل البرنامج/, "startup screen must be Arabic and local");
assert.match(offline, /تعذر الاتصال بالمتجر/, "offline fallback must be bundled locally");

console.log("Windows desktop smoke checks passed.");
