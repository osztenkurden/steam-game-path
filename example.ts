import { getInstalledGames, getSteamLibraries, getSteamPath } from "./tsc";
const p = getSteamPath();
if(!p) process.exit(1);
const x = getSteamLibraries(p);
const y = getInstalledGames();
console.log(x,y)