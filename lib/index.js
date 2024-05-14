// tsc/index.ts
import { enumerateValues, HKEY } from "registry-js";
import path from "path";
import fs from "fs";
import { parse, stringify } from "@node-steam/vdf";
import { homedir } from "os";
import SteamUser from "steam-user";
var VDF = { parse, stringify };
function verifyGameManifestPath(gameId, libraryPath) {
  if (fs.existsSync(path.join(libraryPath, `appmanifest_${gameId}.acf`))) {
    return path.join(libraryPath, `appmanifest_${gameId}.acf`);
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
  if (fs.existsSync(path.join(steamPath, "steamapps", `libraryfolders.vdf`))) {
    const content = fs.readFileSync(path.join(steamPath, "steamapps", `libraryfolders.vdf`), "UTF-8");
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
          paths.push(path.join(value, "steamapps"));
        } else if (value && value.path) {
          paths.push(path.join(value.path, "steamapps"));
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
    const steamPath = path.join(homedir(), ".steam", "root");
    if (fs.existsSync(steamPath)) {
      return steamPath;
    }
    return null;
  }
  if (process.platform !== "win32") {
    throw new Error("Unsupported operating system");
  }
  try {
    const entry = enumerateValues(HKEY.HKEY_LOCAL_MACHINE, "SOFTWARE\\WOW6432Node\\Valve\\Steam").filter((value2) => value2.name === "InstallPath")[0];
    const value = entry && String(entry.data) || null;
    return value;
  } catch (e) {
    return null;
  }
}
function getGame(manifestDir) {
  const content = fs.readFileSync(manifestDir, "UTF-8");
  try {
    const parsed = VDF.parse(content);
    const dir = path.join(manifestDir, "../", "common", parsed.AppState.installdir);
    if (!fs.existsSync(dir)) {
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
  libraries.push(path.join(steamPath, "steamapps"));
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
    const client = new SteamUser();
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
export {
  getGamePath,
  getSteamLibraries,
  getSteamPath
};
