import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import { MapRoom } from "./MapRoom";

const port = 2567;
const httpServer = createServer();

const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("map_room", MapRoom);

gameServer.listen(port).then(() => {
    console.log(`[Palvelin] Käynnissä osoitteessa ws://localhost:${port}`);
});