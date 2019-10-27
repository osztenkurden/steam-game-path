interface GamePath {
    path: string;
    name: string;
}
interface SteamPath {
    game: GamePath | null;
    steam: {
        path: string;
        libraries: string[];
    };
}
export declare function getSteamLibraries(steamPath: string): string[] | null;
export declare function getSteamPath(): string | null;
export declare function getGamePath(gameId: number): SteamPath | null;
export {};
