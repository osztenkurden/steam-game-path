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
declare type SteamPathWithExecutable = SteamPath & {
    executable: Promise<any>;
};
export declare function getGamePath(gameId: number, findExecutable: false): SteamPath | null;
export declare function getGamePath(gameId: number, findExecutable: true): SteamPathWithExecutable | null;
export {};
