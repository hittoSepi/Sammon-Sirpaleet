import * as THREE from "three";
import { Client } from "colyseus.js";
import { MAP_SIZE, TILE_SIZE, TileType, generateTestGrid } from "@game/shared";

// --- 1. THREE.JS PERUSTA & VALAISTUS (OSRS Low-Poly) ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x181c1a);
scene.fog = new THREE.Fog(0x181c1a, 35, 75);

// Kapea FOV (35) luo klassisen isometrisen / OSRS-henkisen perspektiivin
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap; // Terävät low-poly varjot
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xfffaed, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffe8b3, 1.2);
dirLight.position.set(25, 45, 25);
dirLight.castShadow = true;
scene.add(dirLight);

// --- 2. RUUDUKON RENDERÖINTI (InstancedMesh) ---
const grid = generateTestGrid();
const dummy = new THREE.Object3D();

// Lattialaatat (hieman rakoa laattojen välissä, jotta grid erottuu selkeästi)
const floorGeo = new THREE.BoxGeometry(TILE_SIZE * 0.96, 0.3, TILE_SIZE * 0.96);
const floorMat = new THREE.MeshLambertMaterial({ color: 0x3b5338, flatShading: true });
const floorInstanced = new THREE.InstancedMesh(floorGeo, floorMat, MAP_SIZE * MAP_SIZE);
floorInstanced.receiveShadow = true;

// Esteet (Kivet / kalliot)
const wallGeo = new THREE.DodecahedronGeometry(TILE_SIZE * 0.55, 0); // Kulmikas low-poly kivi
const wallMat = new THREE.MeshLambertMaterial({ color: 0x5a5d5a, flatShading: true });
const wallInstanced = new THREE.InstancedMesh(wallGeo, wallMat, MAP_SIZE * MAP_SIZE);
wallInstanced.castShadow = true;
wallInstanced.receiveShadow = true;

let floorIdx = 0;
let wallIdx = 0;

for (let z = 0; z < MAP_SIZE; z++) {
    for (let x = 0; x < MAP_SIZE; x++) {
        const worldX = x * TILE_SIZE + TILE_SIZE / 2;
        const worldZ = z * TILE_SIZE + TILE_SIZE / 2;

        // Asetetaan lattialaatta
        dummy.position.set(worldX, -0.15, worldZ);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        floorInstanced.setMatrixAt(floorIdx++, dummy.matrix);

        // Jos ruudussa on este, lisätään low-poly kivenlohkare
        if (grid[z][x] === TileType.WALL) {
            dummy.position.set(worldX, 0.7, worldZ);
            dummy.rotation.set(x * 0.5, z * 0.8, 0); // Pientä satunnaisuutta kiven kulmaan
            dummy.scale.set(1, 1.3, 1);
            dummy.updateMatrix();
            wallInstanced.setMatrixAt(wallIdx++, dummy.matrix);
        }
    }
}

floorInstanced.count = floorIdx;
wallInstanced.count = wallIdx;
scene.add(floorInstanced, wallInstanced);

// --- 3. OSRS-TYYLINEN KAMERAOHJAIN ---
let camAngle = Math.PI / 4; // 45 asteen aloitus
let camDistance = 30;
const camPitch = 0.85; // Korkeus-kulma radiaaneina
const cameraTarget = new THREE.Vector3((MAP_SIZE * TILE_SIZE) / 2, 0, (MAP_SIZE * TILE_SIZE) / 2);

const keys: Record<string, boolean> = {};
window.addEventListener("keydown", (e) => (keys[e.code] = true));
window.addEventListener("keyup", (e) => (keys[e.code] = false));
window.addEventListener("wheel", (e) => {
    camDistance = Math.max(14, Math.min(50, camDistance + e.deltaY * 0.02));
});
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 4. VERKKOYHTEYS (Colyseus) JA PELAAJA-ENTITEETIT ---
const playerMeshes = new Map<string, THREE.Mesh>();
let localSessionId = "";

const client = new Client("ws://localhost:2567");
const statusEl = document.getElementById("status")!;

async function connect() {
    try {
        const room = await client.joinOrCreate("map_room");
        localSessionId = room.sessionId;
        statusEl.innerText = `Yhdistetty! Oma ID: ${localSessionId}`;

        room.state.players.onAdd((player: any, sessionId: string) => {
            const isMe = sessionId === localSessionId;
            // Low-poly kapselihahmo (Turisas / Tietäjä placeholder)
            const geo = new THREE.ConeGeometry(0.6, 2.0, 6);
            const mat = new THREE.MeshLambertMaterial({
                color: isMe ? 0xd4af37 : 0x3b82f6, // Oma hahmo kultainen, muut sinisiä
                flatShading: true,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(player.x, 1.0, player.z);
            mesh.castShadow = true;
            scene.add(mesh);
            playerMeshes.set(sessionId, mesh);
        });

        room.state.players.onRemove((_: any, sessionId: string) => {
            const mesh = playerMeshes.get(sessionId);
            if (mesh) {
                scene.remove(mesh);
                playerMeshes.delete(sessionId);
            }
        });
    } catch (err) {
        statusEl.innerText = "Virhe yhdistettäessä palvelimeen!";
        console.error(err);
    }
}
connect();

// --- 5. RENDER LOOP ---
function animate() {
    requestAnimationFrame(animate);

    // Kameran kierto Q ja E näppäimillä
    if (keys["KeyQ"]) camAngle -= 0.03;
    if (keys["KeyE"]) camAngle += 0.03;

    // Seurataan omaa pelaajaa pehmeällä interpolaatiolla (Lerp)
    const myMesh = playerMeshes.get(localSessionId);
    if (myMesh) {
        cameraTarget.lerp(myMesh.position, 0.1);
    }

    // Lasketaan kameran sijainti kohteen ympärillä pallokoordinaateilla
    camera.position.x = cameraTarget.x + camDistance * Math.sin(camAngle) * Math.cos(camPitch);
    camera.position.z = cameraTarget.z + camDistance * Math.cos(camAngle) * Math.cos(camPitch);
    camera.position.y = cameraTarget.y + camDistance * Math.sin(camPitch);
    camera.lookAt(cameraTarget);

    renderer.render(scene, camera);
}
animate();