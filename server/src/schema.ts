import { Schema, MapSchema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
    @type("number") x: number = 16;
    @type("number") z: number = 16;
    @type("number") targetX: number = 16;
    @type("number") targetZ: number = 16;
}

export class MapRoomState extends Schema {
    @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}