/* eslint-disable @typescript-eslint/no-require-imports -- Electron preload is CommonJS. */
"use strict";

const { contextBridge, ipcRenderer, webFrame } = require("electron");

// Only the hosted BARTIKA app gets the silent-print bridge.
if (location.protocol === "https:" && location.hostname === "bartika-jeans.vercel.app") {
  contextBridge.exposeInMainWorld("bartikaDesktop", {
    print: () => ipcRenderer.send("bartika:print")
  });
  // Replace window.print() in the page so receipts print without a dialog.
  void webFrame.executeJavaScript(
    "(function(){var native=window.print;window.print=function(){" +
      "try{window.bartikaDesktop.print();}catch(e){native.call(window);}};})();"
  );
}
