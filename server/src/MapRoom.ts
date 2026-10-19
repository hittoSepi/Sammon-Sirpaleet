import { Room, Client } from "@colyseus/core";
import { MapRoomState, PlayerState } from "./schema";
import { TICK_RATE, MAP_SIZE, TILE_SIZE, MovePayload } from "@game/shared";

export class MapRoom extends Room<MapRoomState> {
    maxClients = 4; // 1-4 pelaajan co-op

    onCreate() {
        this.setState(new MapRoomState());

        // Vastaanotetaan liikkumiskomento (Valmius M3-vaiheeseen)
        this.onMessage("cmd_move", (client, data: MovePayload) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;
            player.targetX = data.x;
            player.targetZ = data.z;
        });

        // 20 Hz Server Tick Loop
        this.setSimulationInterval((deltaTime) => this.update(deltaTime), 1000 / TICK_RATE);
        console.log("MapRoom luotu (20 Hz tick)");
    }

    onJoin(client: Client) {
        console.log(`Pelaaja liittyi: ${client.sessionId}`);
        const player = new PlayerState();

        // Asetetaan pelaaja keskelle karttaa pienellä hajonnalla
        const center = (MAP_SIZE * TILE_SIZE) / 2;
        player.x = center + (Math.random() * 4 - 2);
        player.z = center + (Math.random() * 4 - 2);
        player.targetX = player.x;
        player.targetZ = player.z;

        this.state.players.set(client.sessionId, player);
    }

    onLeave(client: Client) {
        console.log(`Pelaaja poistui: ${client.sessionId}`);
        this.state.players.delete(client.sessionId);
    }

    update(deltaTime: number) {
        // M3-vaiheessa tähän lisätään pelaajien liikutus kohti (targetX, targetZ)
    }
}