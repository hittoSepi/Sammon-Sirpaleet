export const MAP_SIZE = 32;
export const TILE_SIZE = 2; // Yhden ruudun koko 3D-maailmassa (2x2 yksikköä)
export const TICK_RATE = 20; // 20 päivitystä sekunnissa (50ms)

export enum TileType {
    GRASS = 0,
    WALL = 1, // Kivi / Puu / Este
}

export interface MovePayload {
    x: number;
    z: number;
}

// Generoidaan deterministinen 32x32 testikartta (reunoilla kivet ja keskellä muutama este)
export function generateTestGrid(): number[][] {
    const grid: number[][] = [];
    for (let z = 0; z < MAP_SIZE; z++) {
        const row: number[] = [];
        for (let x = 0; x < MAP_SIZE; x++) {
            const isBorder = x === 0 || z === 0 || x === MAP_SIZE - 1 || z === MAP_SIZE - 1;
            const isObstacle = (x % 7 === 0 && z % 5 === 0) && (x !== 14 || z !== 15);
            row.push(isBorder || isObstacle ? TileType.WALL : TileType.GRASS);
        }
        grid.push(row);
    }
    return grid;
}