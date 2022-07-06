# Steam Game Path

## How does it work?
It looks for the path with given game id, and returns both steam installation path and game's.

## Installing
```npm install steam-game-path```

## Example #1
```javascript
import { getGamePath } from 'steam-game-path';

const data = getGamePath(730);
```

## Exports

|Method|Description|Example|Returned objects|
|---|---|---|---|
|`getGamePath(gameId, findExecutable: boolean)`|Function that takes game id and returns |`getGamePath(730)`|Path Object|
|`getSteamPath()`|Function that returns steam install path or null|`getSteamPath() //"E:\Program Files (x86)\Steam"`|`string`|

## Path Object Example

```javascript
{
    game: {
        path: 'C:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive',
        name: 'Counter-Strike: Global Offensive',
        executable?: Promise
    },
    steam: {
        path: 'E:\\Program Files (x86)\\Steam',
        libraries: [
            'C:\\SteamLibrary\\steamapps',
            'D:\\SteamLibrary\\steamapps',
            'E:\\Program Files (x86)\\Steam\\steamapps'
        ]
    }
}
```
