import { Schema, MapSchema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
    @type("number") x: number = 16;
    @type("number") z: number = 16;
    @type("number") rotation: number = 0;
}

export class ProjectileState extends Schema {
    @type("string") id: string = "";
    @type("number") x: number = 0;
    @type("number") z: number = 0;
    @type("number") dx: number = 0;
    @type("number") dz: number = 0;
    @type("number") speed: number = 14;
}

export class EnemyState extends Schema {
    @type("string") id: string = "";
    @type("number") x: number = 0;
    @type("number") z: number = 0;
    @type("number") hp: number = 50;
    @type("number") maxHp: number = 50;
}

export class MapRoomState extends Schema {
    @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
    @type({ map: ProjectileState }) projectiles = new MapSchema<ProjectileState>();
    @type({ map: EnemyState }) enemies = new MapSchema<EnemyState>();
}