export const MAP_SIZE = 32;
export const TILE_SIZE = 2; // Yhden ruudun koko 3D-maailmassa (2x2 yksikköä)
export const TICK_RATE = 20; // 20 päivitystä sekunnissa (50ms)
export const PLAYER_SPEED = 8; // Yksikköä sekunnissa

export enum TileType {
    GRASS = 0,
    WALL = 1,
}

export interface MovePayload {
    x: number;
    z: number;
}

export interface Point {
    x: number;
    z: number;
}

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

// Muuntaa 3D-maailman koordinaatin ruudukkoindeksiksi (0..31)
export function worldToGrid(val: number): number {
    return Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(val / TILE_SIZE)));
}

// Muuntaa ruudukkoindeksin ruudun keskikohdan 3D-koordinaatiksi
export function gridToWorld(idx: number): number {
    return idx * TILE_SIZE + TILE_SIZE / 2;
}

// Kevyt A* reitinhaku 32x32 ruudukolle (sisältää viistoliikkeen ilman kulmien leikkausta)
export function findPath(grid: number[][], startWorld: Point, endWorld: Point): Point[] {
    const startX = worldToGrid(startWorld.x);
    const startZ = worldToGrid(startWorld.z);
    const endX = worldToGrid(endWorld.x);
    const endZ = worldToGrid(endWorld.z);

    // Jos kohderuutu on seinän sisällä, ei liikuta
    if (grid[endZ]?.[endX] === TileType.WALL) return [];

    // Jos ollaan jo samassa ruudussa, kuljetaan suoraan klikattuun pisteeseen
    if (startX === endX && startZ === endZ) {
        return [{ x: endWorld.x, z: endWorld.z }];
    }

    interface Node {
        x: number;
        z: number;
        g: number;
        h: number;
        f: number;
        parent?: Node;
    }

    const open: Node[] = [{ x: startX, z: startZ, g: 0, h: 0, f: 0 }];
    const closed = new Set<string>();
    const key = (x: number, z: number) => `${x},${z}`;

    const dirs = [
        { dx: 0, dz: -1, cost: 1 },
        { dx: 1, dz: 0, cost: 1 },
        { dx: 0, dz: 1, cost: 1 },
        { dx: -1, dz: 0, cost: 1 },
        { dx: 1, dz: -1, cost: 1.414 },
        { dx: 1, dz: 1, cost: 1.414 },
        { dx: -1, dz: 1, cost: 1.414 },
        { dx: -1, dz: -1, cost: 1.414 },
    ];

    while (open.length > 0) {
        open.sort((a, b) => a.f - b.f);
        const current = open.shift()!;
        closed.add(key(current.x, current.z));

        if (current.x === endX && current.z === endZ) {
            const path: Point[] = [];
            let curr: Node | undefined = current;
            while (curr && curr.parent) {
                path.unshift({ x: gridToWorld(curr.x), z: gridToWorld(curr.z) });
                curr = curr.parent;
            }
            // Viimeinen piste asetetaan tarkkaan hiiren klikkauskohtaan
            if (path.length > 0) {
                path[path.length - 1] = { x: endWorld.x, z: endWorld.z };
            }
            return path;
        }

        for (const d of dirs) {
            const nx = current.x + d.dx;
            const nz = current.z + d.dz;

            if (nx < 0 || nz < 0 || nx >= MAP_SIZE || nz >= MAP_SIZE) continue;
            if (grid[nz][nx] === TileType.WALL) continue;
            if (closed.has(key(nx, nz))) continue;

            // Estetään kulmien leikkaus viistoon liikuttaessa
            if (d.dx !== 0 && d.dz !== 0) {
                if (grid[current.z][nx] === TileType.WALL || grid[nz][current.x] === TileType.WALL) {
                    continue;
                }
            }

            const g = current.g + d.cost;
            const h = Math.hypot(endX - nx, endZ - nz);
            const f = g + h;

            const existing = open.find((n) => n.x === nx && n.z === nz);
            if (!existing) {
                open.push({ x: nx, z: nz, g, h, f, parent: current });
            } else if (g < existing.g) {
                existing.g = g;
                existing.f = g + existing.h;
                existing.parent = current;
            }
        }
    }

    return [];
}

// --- SKILL & SUPPORT SYSTEM (M4) ---

export type SkillTag = 'Spell' | 'Attack' | 'Projectile' | 'AoE' | 'Melee' | 'Fire' | 'Physical';

export interface SkillDefinition {
    id: string;
    name: string;
    tags: SkillTag[];
    manaCost: number;
    cooldownMs: number;
    baseDamageMin: number;
    baseDamageMax: number;
    projectileCount: number;
    aoeRadius: number;
}

export interface SupportGem {
    id: string;
    name: string;
    requiredTags: SkillTag[];
    manaMultiplier: number;
    applyModifier: (skill: SkillDefinition) => void;
}

// Esimerkkitaitomuodot
export const SKILLS: Record<string, SkillDefinition> = {
    tulen_synty: {
        id: 'tulen_synty',
        name: 'Tulen Synty (Fireball)',
        tags: ['Spell', 'Projectile', 'Fire'],
        manaCost: 10,
        cooldownMs: 600,
        baseDamageMin: 12,
        baseDamageMax: 20,
        projectileCount: 1,
        aoeRadius: 1.0,
    },
    ukon_isku: {
        id: 'ukon_isku',
        name: 'Ukon Isku (Ground Slam)',
        tags: ['Attack', 'Melee', 'AoE', 'Physical'],
        manaCost: 6,
        cooldownMs: 800,
        baseDamageMin: 18,
        baseDamageMax: 30,
        projectileCount: 0,
        aoeRadius: 3.0,
    },
};

// Esimerkkitukisäkeet
export const SUPPORTS: Record<string, SupportGem> = {
    haarautuminen: {
        id: 'haarautuminen',
        name: 'Kolmijako-säe',
        requiredTags: ['Projectile'],
        manaMultiplier: 1.4,
        applyModifier: (skill) => {
            skill.projectileCount += 2;
            skill.baseDamageMin = Math.round(skill.baseDamageMin * 0.8);
            skill.baseDamageMax = Math.round(skill.baseDamageMax * 0.8);
        },
    },
    suurennus: {
        id: 'suurennus',
        name: 'Laajennus-säe',
        requiredTags: ['AoE'],
        manaMultiplier: 1.3,
        applyModifier: (skill) => {
            skill.aoeRadius *= 1.4;
        },
    },
};

// Laskee taidon lopulliset arvot tukisäkeiden jälkeen
export function calculateModifiedSkill(base: SkillDefinition, supports: SupportGem[]): SkillDefinition {
    const modified: SkillDefinition = { ...base, tags: [...base.tags] };

    for (const support of supports) {
        const isCompatible = support.requiredTags.some((tag) => modified.tags.includes(tag));
        if (!isCompatible) continue;

        modified.manaCost = Math.round(modified.manaCost * support.manaMultiplier);
        support.applyModifier(modified);
    }

    return modified;
}