interface GamePath {
    path: string;
    name: string;
    executable?: Promise<any>;
}
interface SteamPath {
    game: GamePath | null;
    steam: {
        path: string;
        libraries: string[];
    };
}
declare function getSteamLibraries(steamPath: string): string[] | null;
declare function getSteamPath(): string | null;
declare function getGamePath(gameId: number, findExecutable?: boolean): SteamPath | null;

export { getGamePath, getSteamLibraries, getSteamPath };
