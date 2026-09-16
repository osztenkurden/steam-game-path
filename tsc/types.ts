export interface GamePathOptions {
	/** Steam's installation directory. Relative paths are resolved against the current working directory. */
	steamPath?: string;
}

export interface InstalledGame {
	appId: number;
	name: string;
	path: string;
}

export interface SteamInstallation {
	path: string;
	/** Unique steamapps directories, including the default library. */
	libraries: string[];
}

export type SteamFailureReason =
	'steam-not-found' | 'unsupported-platform' | 'library-config-missing' | 'library-config-invalid' | 'access-error';

export type LookupFailureReason =
	SteamFailureReason | 'game-not-found' | 'manifest-invalid' | 'install-directory-missing';

export interface LookupIssue {
	code: LookupFailureReason;
	message: string;
	path?: string;
	appId?: number;
	/** Filesystem error code, such as EACCES or ENOENT, when available. */
	errorCode?: string;
}

export interface LookupFailure {
	success: false;
	reason: LookupFailureReason;
}

export type GamePathResult =
	| {
			success: true;
			game: InstalledGame;
			steam: SteamInstallation;
			issues: LookupIssue[];
	  }
	| LookupFailure;

export type InstalledGamesResult =
	| {
			success: true;
			games: InstalledGame[];
			steam: SteamInstallation;
			issues: LookupIssue[];
	  }
	| LookupFailure;
