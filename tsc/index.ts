export { getSteamPath, getSteamLibraries } from './steam.ts';
export { getGamePath, getGamePaths, getInstalledGames } from './lookup.ts';
export type {
	GamePathOptions,
	GamePathResult,
	InstalledGame,
	InstalledGamesResult,
	LookupFailure,
	LookupFailureReason,
	LookupIssue,
	SteamFailureReason,
	SteamInstallation
} from './types.ts';
