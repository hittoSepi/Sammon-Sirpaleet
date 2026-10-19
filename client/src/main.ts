import * as THREE from "three";
import { Client, Room } from "colyseus.js";
import { MAP_SIZE, TILE_SIZE, TileType, generateTestGrid } from "@game/shared";

// --- 1. THREE.JS PERUSTA & VALAISTUS ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x181c1a);
scene.fog = new THREE.Fog(0x181c1a, 35, 75);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xfffaed, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffe8b3, 1.2);
dirLight.position.set(25, 45, 25);
dirLight.castShadow = true;
scene.add(dirLight);

// --- 2. RUUDUKON RENDERÖINTI ---
const grid = generateTestGrid();
const dummy = new THREE.Object3D();

const floorGeo = new THREE.BoxGeometry(TILE_SIZE * 0.96, 0.3, TILE_SIZE * 0.96);
const floorMat = new THREE.MeshLambertMaterial({ color: 0x3b5338, flatShading: true });
const floorInstanced = new THREE.InstancedMesh(floorGeo, floorMat, MAP_SIZE * MAP_SIZE);
floorInstanced.receiveShadow = true;

const wallGeo = new THREE.DodecahedronGeometry(TILE_SIZE * 0.55, 0);
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

        dummy.position.set(worldX, -0.15, worldZ);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        floorInstanced.setMatrixAt(floorIdx++, dummy.matrix);

        if (grid[z][x] === TileType.WALL) {
            dummy.position.set(worldX, 0.7, worldZ);
            dummy.rotation.set(x * 0.5, z * 0.8, 0);
            dummy.scale.set(1, 1.3, 1);
            dummy.updateMatrix();
            wallInstanced.setMatrixAt(wallIdx++, dummy.matrix);
        }
    }
}

floorInstanced.count = floorIdx;
wallInstanced.count = wallIdx;
scene.add(floorInstanced, wallInstanced);

// --- 3. CLICK-TO-MOVE & TAIDON LAUKAISU ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const intersectPoint = new THREE.Vector3();

const markerGeo = new THREE.RingGeometry(0.25, 0.4, 8);
markerGeo.rotateX(-Math.PI / 2);
const markerMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide });
const clickMarker = new THREE.Mesh(markerGeo, markerMat);
clickMarker.visible = false;
scene.add(clickMarker);
let markerScale = 1;

let activeRoom: Room | null = null;
let isMouseDown = false;
let lastMoveSendTime = 0;

function sendMoveCommand(clientX: number, clientY: number, showMarker: boolean) {
    if (!activeRoom) return;

    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    if (raycaster.ray.intersectPlane(groundPlane, intersectPoint)) {
        activeRoom.send("cmd_move", { x: intersectPoint.x, z: intersectPoint.z });

        if (showMarker) {
            clickMarker.position.set(intersectPoint.x, 0.05, intersectPoint.z);
            clickMarker.visible = true;
            markerScale = 1.3;
        }
    }
}

window.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    isMouseDown = true;
    sendMoveCommand(e.clientX, e.clientY, true);
    lastMoveSendTime = performance.now();
});

window.addEventListener("pointermove", (e) => {
    if (!isMouseDown) return;
    const now = performance.now();
    if (now - lastMoveSendTime > 100) {
        sendMoveCommand(e.clientX, e.clientY, false);
        lastMoveSendTime = now;
    }
});

window.addEventListener("pointerup", (e) => {
    if (e.button === 0) isMouseDown = false;
});

window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "Space" && activeRoom) {
        activeRoom.send("cmd_cast", { skillId: "tulen_synty" });
    }
});

// --- 4. KAMERAOHJAIN ---
let camAngle = Math.PI / 4;
let camDistance = 30;
const camPitch = 0.85;
const cameraTarget = new THREE.Vector3((MAP_SIZE * TILE_SIZE) / 2, 0, (MAP_SIZE * TILE_SIZE) / 2);

const keys: Record<string, boolean> = {};
window.addEventListener("keyup", (e) => (keys[e.code] = false));
window.addEventListener("wheel", (e) => {
    camDistance = Math.max(14, Math.min(50, camDistance + e.deltaY * 0.02));
});
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 5. ENTITEETIT JA VERKKO ---
interface PlayerVisual {
    group: THREE.Group;
    stateRef: any;
}
const playerVisuals = new Map<string, PlayerVisual>();
const projectileMeshes = new Map<string, THREE.Mesh>();
const enemyMeshes = new Map<string, THREE.Mesh>();
let localSessionId = "";

const client = new Client("ws://localhost:2567");
const statusEl = document.getElementById("status")!;

function createPlayerMesh(isMe: boolean): THREE.Group {
    const group = new THREE.Group();
    const bodyGeo = new THREE.ConeGeometry(0.6, 2.0, 6);
    const bodyMat = new THREE.MeshLambertMaterial({
        color: isMe ? 0xd4af37 : 0x3b82f6,
        flatShading: true,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.0;
    body.castShadow = true;
    group.add(body);

    const visorGeo = new THREE.BoxGeometry(0.35, 0.25, 0.5);
    const visorMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.4, 0.35);
    group.add(visor);

    return group;
}

async function connect() {
    try {
        const room = await client.joinOrCreate("map_room");
        activeRoom = room;
        localSessionId = room.sessionId;
        statusEl.innerText = `Yhdistetty! Ammu hiisiä tulella (SPACE)`;

        // Pelaajat
        room.state.players.onAdd((player: any, sessionId: string) => {
            const isMe = sessionId === localSessionId;
            const group = createPlayerMesh(isMe);
            group.position.set(player.x, 0, player.z);
            scene.add(group);
            playerVisuals.set(sessionId, { group, stateRef: player });
        });

        room.state.players.onRemove((_: any, sessionId: string) => {
            const visual = playerVisuals.get(sessionId);
            if (visual) {
                scene.remove(visual.group);
                playerVisuals.delete(sessionId);
            }
        });

        // Ammukset
        room.state.projectiles.onAdd((proj: any, projId: string) => {
            const projGeo = new THREE.SphereGeometry(0.35, 8, 8);
            const projMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
            const mesh = new THREE.Mesh(projGeo, projMat);
            mesh.position.set(proj.x, 1.0, proj.z);
            scene.add(mesh);
            projectileMeshes.set(projId, mesh);
        });

        room.state.projectiles.onRemove((_: any, projId: string) => {
            const mesh = projectileMeshes.get(projId);
            if (mesh) {
                scene.remove(mesh);
                projectileMeshes.delete(projId);
            }
        });

        // Viholliset (Hiidet)
        room.state.enemies.onAdd((enemy: any, enemyId: string) => {
            const enemyGeo = new THREE.CylinderGeometry(0.5, 0.7, 1.6, 6);
            const enemyMat = new THREE.MeshLambertMaterial({ color: 0x16a34a, flatShading: true }); // Vihreä hiisi
            const mesh = new THREE.Mesh(enemyGeo, enemyMat);
            mesh.position.set(enemy.x, 0.8, enemy.z);
            mesh.castShadow = true;
            scene.add(mesh);
            enemyMeshes.set(enemyId, mesh);
        });

        room.state.enemies.onRemove((_: any, enemyId: string) => {
            const mesh = enemyMeshes.get(enemyId);
            if (mesh) {
                scene.remove(mesh);
                enemyMeshes.delete(enemyId);
            }
        });
    } catch (err) {
        statusEl.innerText = "Virhe yhdistettäessä palvelimeen!";
        console.error(err);
    }
}
connect();

function lerpAngle(current: number, target: number, factor: number): number {
    let diff = target - current;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return current + diff * factor;
}

// --- 6. RENDER LOOP ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    const lerpFactor = Math.min(1, dt * 15);
    playerVisuals.forEach(({ group, stateRef }) => {
        group.position.x = THREE.MathUtils.lerp(group.position.x, stateRef.x, lerpFactor);
        group.position.z = THREE.MathUtils.lerp(group.position.z, stateRef.z, lerpFactor);
        group.rotation.y = lerpAngle(group.rotation.y, stateRef.rotation, lerpFactor);
    });

    // Synkronoidaan ammukset
    if (activeRoom) {
        activeRoom.state.projectiles.forEach((proj: any, projId: string) => {
            const mesh = projectileMeshes.get(projId);
            if (mesh) {
                mesh.position.set(proj.x, 1.0, proj.z);
            }
        });

        // Synkronoidaan vihollisten sijainnit (pehmeä interpolaatio)
        activeRoom.state.enemies.forEach((enemy: any, enemyId: string) => {
            const mesh = enemyMeshes.get(enemyId);
            if (mesh) {
                mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, enemy.x, lerpFactor);
                mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, enemy.z, lerpFactor);
            }
        });
    }

    if (clickMarker.visible) {
        markerScale -= dt * 2.5;
        if (markerScale <= 0.1) {
            clickMarker.visible = false;
        } else {
            clickMarker.scale.set(markerScale, 1, markerScale);
        }
    }

    if (keys["KeyQ"]) camAngle -= 2.0 * dt;
    if (keys["KeyE"]) camAngle += 2.0 * dt;

    const myVisual = playerVisuals.get(localSessionId);
    if (myVisual) {
        cameraTarget.lerp(myVisual.group.position, Math.min(1, dt * 8));
    }

    camera.position.x = cameraTarget.x + camDistance * Math.sin(camAngle) * Math.cos(camPitch);
    camera.position.z = cameraTarget.z + camDistance * Math.cos(camAngle) * Math.cos(camPitch);
    camera.position.y = cameraTarget.y + camDistance * Math.sin(camPitch);
    camera.lookAt(cameraTarget);

    renderer.render(scene, camera);
}
animate();