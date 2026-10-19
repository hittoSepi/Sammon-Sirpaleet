import { Room, Client } from "@colyseus/core";
import { MapRoomState, PlayerState, ProjectileState, EnemyState } from "./schema";
import {
    TICK_RATE,
    MAP_SIZE,
    TILE_SIZE,
    PLAYER_SPEED,
    MovePayload,
    Point,
    generateTestGrid,
    findPath,
    SKILLS,
    calculateModifiedSkill,
} from "@game/shared";
import { randomUUID } from "crypto";

export class MapRoom extends Room<MapRoomState> {
    maxClients = 4;
    grid: number[][] = [];
    playerPaths = new Map<string, Point[]>();
    projectileData = new Map<string, { distanceTraveled: number; maxDist: number; damage: number }>();

    onCreate() {
        this.setState(new MapRoomState());
        this.grid = generateTestGrid();

        // Luodaan muutama hiisi kartalle testialueelle
        this.spawnEnemies();

        this.onMessage("cmd_move", (client, data: MovePayload) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            const clampedX = Math.max(TILE_SIZE, Math.min((MAP_SIZE - 1) * TILE_SIZE, data.x));
            const clampedZ = Math.max(TILE_SIZE, Math.min((MAP_SIZE - 1) * TILE_SIZE, data.z));

            const path = findPath(
                this.grid,
                { x: player.x, z: player.z },
                { x: clampedX, z: clampedZ }
            );

            if (path.length > 0) {
                this.playerPaths.set(client.sessionId, path);
            }
        });

        this.onMessage("cmd_cast", (client, data: { skillId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            const baseSkill = SKILLS[data.skillId || "tulen_synty"];
            if (!baseSkill) return;

            const skill = calculateModifiedSkill(baseSkill, []);

            if (skill.tags.includes("Projectile")) {
                for (let i = 0; i < skill.projectileCount; i++) {
                    let angleOffset = 0;
                    if (skill.projectileCount > 1) {
                        const spread = 0.35;
                        angleOffset = -spread / 2 + (spread / (skill.projectileCount - 1)) * i;
                    }

                    const finalAngle = player.rotation + angleOffset;
                    const dx = Math.sin(finalAngle);
                    const dz = Math.cos(finalAngle);

                    const projId = randomUUID();
                    const proj = new ProjectileState();
                    proj.id = projId;
                    proj.x = player.x + dx * 1.0;
                    proj.z = player.z + dz * 1.0;
                    proj.dx = dx;
                    proj.dz = dz;
                    proj.speed = 16;

                    const avgDmg = Math.round((skill.baseDamageMin + skill.baseDamageMax) / 2);

                    this.state.projectiles.set(projId, proj);
                    this.projectileData.set(projId, { distanceTraveled: 0, maxDist: 22, damage: avgDmg });
                }
            }
        });

        this.setSimulationInterval((deltaTime) => this.update(deltaTime), 1000 / TICK_RATE);
        console.log("MapRoom luotu (Viholliset ja vahinkolaskenta aktiivinen)");
    }

    spawnEnemies() {
        // Luodaan 3 hiittä kartan eri kohtiin
        const enemyPositions = [
            { x: 22 * TILE_SIZE, z: 16 * TILE_SIZE },
            { x: 20 * TILE_SIZE, z: 22 * TILE_SIZE },
            { x: 24 * TILE_SIZE, z: 10 * TILE_SIZE },
        ];

        enemyPositions.forEach((pos) => {
            const id = randomUUID();
            const enemy = new EnemyState();
            enemy.id = id;
            enemy.x = pos.x;
            enemy.z = pos.z;
            enemy.hp = 50;
            enemy.maxHp = 50;
            this.state.enemies.set(id, enemy);
        });
    }

    onJoin(client: Client) {
        const player = new PlayerState();
        const center = (MAP_SIZE * TILE_SIZE) / 2;
        player.x = center + 1;
        player.z = center + 1;

        this.state.players.set(client.sessionId, player);
        this.playerPaths.set(client.sessionId, []);
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
        this.playerPaths.delete(client.sessionId);
    }

    update(deltaTime: number) {
        const dt = deltaTime / 1000;

        // 1. Pelaajien liike
        this.state.players.forEach((player, sessionId) => {
            const path = this.playerPaths.get(sessionId);
            if (!path || path.length === 0) return;

            let remainingStep = PLAYER_SPEED * dt;

            while (remainingStep > 0 && path.length > 0) {
                const nextWaypoint = path[0];
                const dx = nextWaypoint.x - player.x;
                const dz = nextWaypoint.z - player.z;
                const dist = Math.hypot(dx, dz);

                if (dist > 0.001) {
                    player.rotation = Math.atan2(dx, dz);
                }

                if (dist <= remainingStep) {
                    player.x = nextWaypoint.x;
                    player.z = nextWaypoint.z;
                    remainingStep -= dist;
                    path.shift();
                } else {
                    player.x += (dx / dist) * remainingStep;
                    player.z += (dz / dist) * remainingStep;
                    remainingStep = 0;
                }
            }
        });

        // 2. Vihollisten tekoäly (Hiidet kävelevät lähimmää pelaajaa kohti)
        this.state.enemies.forEach((enemy) => {
            let nearestPlayer: PlayerState | null = null;
            let minDist = Infinity;

            this.state.players.forEach((player) => {
                const dist = Math.hypot(player.x - enemy.x, player.z - enemy.z);
                if (dist < minDist) {
                    minDist = dist;
                    nearestPlayer = player;
                }
            });

            // Jos pelaaja on aggro-etäisyydellä (< 12 yksikköä)
            if (nearestPlayer && minDist < 12 && minDist > 1.2) {
                const p = nearestPlayer as PlayerState;
                const dx = p.x - enemy.x;
                const dz = p.z - enemy.z;
                const speed = 3.5; // Hiiden liikkumisnopeus
                enemy.x += (dx / minDist) * speed * dt;
                enemy.z += (dz / minDist) * speed * dt;
            }
        });

        // 3. Ammusten liike ja törmäystarkistus vihollisiin
        this.state.projectiles.forEach((proj, projId) => {
            const step = proj.speed * dt;
            proj.x += proj.dx * step;
            proj.z += proj.dz * step;

            const meta = this.projectileData.get(projId);
            if (!meta) return;

            meta.distanceTraveled += step;

            // Seinätörmäys
            const gridX = Math.floor(proj.x / TILE_SIZE);
            const gridZ = Math.floor(proj.z / TILE_SIZE);
            const hitWall =
                gridX < 0 ||
                gridZ < 0 ||
                gridX >= MAP_SIZE ||
                gridZ >= MAP_SIZE ||
                (this.grid[gridZ] && this.grid[gridZ][gridX] === 1);

            // Vihollistörmäys (Yksinkertainen ympyrätörmäys säteellä 0.8)
            let hitEnemyId: string | null = null;
            this.state.enemies.forEach((enemy, enemyId) => {
                const dist = Math.hypot(enemy.x - proj.x, enemy.z - proj.z);
                if (dist < 0.9) {
                    hitEnemyId = enemyId;
                }
            });

            if (hitEnemyId) {
                const enemy = this.state.enemies.get(hitEnemyId);
                if (enemy) {
                    enemy.hp -= meta.damage;
                    console.log(`Hiisi otti ${meta.damage} vahinkoa! HP jäljellä: ${enemy.hp}`);
                    if (enemy.hp <= 0) {
                        this.state.enemies.delete(hitEnemyId);
                        console.log("Hiisi kuoli!");
                    }
                }
                // Tuhoa ammus osumasta
                this.state.projectiles.delete(projId);
                this.projectileData.delete(projId);
            } else if (meta.distanceTraveled >= meta.maxDist || hitWall) {
                this.state.projectiles.delete(projId);
                this.projectileData.delete(projId);
            }
        });
    }
}