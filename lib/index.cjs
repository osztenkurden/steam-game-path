"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// tsc/index.ts
var tsc_exports = {};
__export(tsc_exports, {
  getGamePath: () => getGamePath,
  getSteamLibraries: () => getSteamLibraries,
  getSteamPath: () => getSteamPath
});
module.exports = __toCommonJS(tsc_exports);
var import_registry_js = require("registry-js");
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_vdf = require("@node-steam/vdf");
var import_os = require("os");
var import_steam_user = __toESM(require("steam-user"), 1);
var VDF = { parse: import_vdf.parse, stringify: import_vdf.stringify };
function verifyGameManifestPath(gameId, libraryPath) {
  if (import_fs.default.existsSync(import_path.default.join(libraryPath, `appmanifest_${gameId}.acf`))) {
    return import_path.default.join(libraryPath, `appmanifest_${gameId}.acf`);
  }
  return null;
}
function getGameManifestPath(paths, gameId) {
  for (const path2 of paths) {
    const manifest = verifyGameManifestPath(gameId, path2);
    if (manifest && getGame(manifest)) {
      return manifest;
    }
  }
  return null;
}
function getSteamLibraries(steamPath) {
  if (import_fs.default.existsSync(import_path.default.join(steamPath, "steamapps", `libraryfolders.vdf`))) {
    const content = import_fs.default.readFileSync(import_path.default.join(steamPath, "steamapps", `libraryfolders.vdf`), "UTF-8");
    try {
      const parsed = VDF.parse(content);
      const libraries = parsed.LibraryFolders || parsed.libraryfolders;
      const paths = [];
      if (!libraries) {
        return null;
      }
      const values = Object.values(libraries);
      for (const value of values) {
        if (!value) {
          continue;
        }
        if (typeof value === "string") {
          paths.push(import_path.default.join(value, "steamapps"));
        } else if (value && value.path) {
          paths.push(import_path.default.join(value.path, "steamapps"));
        }
      }
      return paths;
    } catch (e) {
      return null;
    }
  }
  return null;
}
function getSteamPath() {
  if (process.platform === "linux") {
    const steamPath = import_path.default.join((0, import_os.homedir)(), ".steam", "root");
    if (import_fs.default.existsSync(steamPath)) {
      return steamPath;
    }
    return null;
  }
  if (process.platform !== "win32") {
    throw new Error("Unsupported operating system");
  }
  try {
    const entry = (0, import_registry_js.enumerateValues)(import_registry_js.HKEY.HKEY_LOCAL_MACHINE, "SOFTWARE\\WOW6432Node\\Valve\\Steam").filter((value2) => value2.name === "InstallPath")[0];
    const value = entry && String(entry.data) || null;
    return value;
  } catch (e) {
    return null;
  }
}
function getGame(manifestDir) {
  const content = import_fs.default.readFileSync(manifestDir, "UTF-8");
  try {
    const parsed = VDF.parse(content);
    const dir = import_path.default.join(manifestDir, "../", "common", parsed.AppState.installdir);
    if (!import_fs.default.existsSync(dir)) {
      return null;
    }
    const name = parsed.AppState.name;
    return { path: dir, name };
  } catch (e) {
    return null;
  }
}
function getGamePath(gameId, findExecutable = false) {
  const steamPath = getSteamPath();
  if (!steamPath)
    return null;
  const libraries = getSteamLibraries(steamPath);
  if (libraries === null) {
    return {
      game: null,
      steam: {
        path: steamPath,
        libraries: []
      }
    };
  }
  libraries.push(import_path.default.join(steamPath, "steamapps"));
  const manifest = getGameManifestPath(libraries, gameId);
  if (!manifest) {
    return {
      game: null,
      steam: {
        path: steamPath,
        libraries: [...new Set(libraries)]
      }
    };
  }
  const game = getGame(manifest);
  if (!findExecutable || !game) {
    return {
      game,
      steam: {
        path: steamPath,
        libraries: [...new Set(libraries)]
      }
    };
  }
  const executablePromise = new Promise((res, rej) => {
    const client = new import_steam_user.default();
    client.on("loggedOn", async () => {
      const gameData = await client.getProductInfo([gameId], []);
      const gameExecutableInfo = gameData?.apps?.[gameId]?.appinfo?.config?.launch || null;
      client.logOff();
      res(gameExecutableInfo ? Object.values(gameExecutableInfo) : gameExecutableInfo);
    });
    client.logOn();
  });
  return {
    game: { ...game, executable: executablePromise },
    steam: {
      path: steamPath,
      libraries: [...new Set(libraries)]
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getGamePath,
  getSteamLibraries,
  getSteamPath
});
