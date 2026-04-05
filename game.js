// Math Swarm Survivor — Puzzles & Survival style
// Rewrite: match reference screenshot visual style exactly.

(function () {
    'use strict';

    // ─── Three.js core ──────────────────────────────────────────────
    let scene, camera, renderer;
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    // ─── Constants ──────────────────────────────────────────────────
    const ROAD_W = 8;
    const ROAD_LEN = 60;
    const WALL_H = 3;
    const CAM_Y = 12;
    const CAM_Z = 8;
    const LOOK_Y = 0;
    const LOOK_Z = -6;
    const MAX_ZOMBIES = 80;
    const MAX_SOLDIERS = 20;
    const BULLET_POOL = 100;
    const BULLET_SPEED = 30;
    const WORLD_SPEED = 4;
    const STEER_SPEED = 8;

    // ─── Game state ─────────────────────────────────────────────────
    let playerX = 0, targetX = 0;
    let squadCount = 5;
    let fireRate = 4; // shots per second
    let damage = 1;
    let fireCooldown = 0;
    let score = 0;
    let worldScroll = 0;
    let state = 'menu'; // menu | playing | gameover
    let time = 0;

    // ─── Zombie SoA ─────────────────────────────────────────────────
    const zX = new Float32Array(MAX_ZOMBIES);
    const zZ = new Float32Array(MAX_ZOMBIES);
    const zHP = new Float32Array(MAX_ZOMBIES);
    const zMaxHP = new Float32Array(MAX_ZOMBIES);
    const zSpeed = new Float32Array(MAX_ZOMBIES);
    const zActive = new Uint8Array(MAX_ZOMBIES);
    const zType = new Uint8Array(MAX_ZOMBIES); // 0=normal, 1=fast, 2=brute
    const zScale = new Float32Array(MAX_ZOMBIES);
    let zombieHighWater = 0;

    // ─── Meshes ─────────────────────────────────────────────────────
    let soldierMesh, zombieMeshes = [], bulletPool = [];
    let glowCircles = [];
    let roadMesh, wallL, wallR, groundL, groundR;
    const _dummy = new THREE.Object3D();
    const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    // ─── Textures ───────────────────────────────────────────────────
    const TEXTURES = {};
    const loader = new THREE.TextureLoader();

    // ─── Overlay ────────────────────────────────────────────────────
    let overlayCanvas, overlayCtx;

    // ─── Seeded RNG ─────────────────────────────────────────────────
    let _seed = 42;
    function seedRng(s) { _seed = s | 0; }
    function rng() {
        _seed += 0x6D2B79F5;
        let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // ─── Init Renderer ──────────────────────────────────────────────
    function initRenderer() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x8a8a7a);
        scene.fog = new THREE.Fog(0x8a8a7a, 40, 70);

        camera = new THREE.PerspectiveCamera(50, W() / H(), 0.1, 200);
        camera.position.set(0, CAM_Y, CAM_Z);
        camera.lookAt(0, LOOK_Y, LOOK_Z);

        renderer = new THREE.WebGLRenderer({ antialias: true, canvas: undefined });
        renderer.setSize(W(), H());
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.insertBefore(renderer.domElement, document.body.firstChild);

        // Lights — warm, like the reference
        const ambient = new THREE.AmbientLight(0xffeedd, 0.7);
        scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xfff5e0, 1.0);
        sun.position.set(5, 15, 8);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 50;
        sun.shadow.camera.left = -15;
        sun.shadow.camera.right = 15;
        sun.shadow.camera.top = 15;
        sun.shadow.camera.bottom = -30;
        scene.add(sun);

        window.addEventListener('resize', () => {
            camera.aspect = W() / H();
            camera.updateProjectionMatrix();
            renderer.setSize(W(), H());
            if (overlayCanvas) {
                overlayCanvas.width = W();
                overlayCanvas.height = H();
            }
        });
    }

    // ─── Build Road ─────────────────────────────────────────────────
    function initEnvironment() {
        // Road — light warm gray concrete
        const roadGeo = new THREE.PlaneGeometry(ROAD_W, ROAD_LEN);
        const roadMat = new THREE.MeshStandardMaterial({
            color: 0xa8a89c,
            roughness: 0.9,
            metalness: 0.0,
        });
        roadMesh = new THREE.Mesh(roadGeo, roadMat);
        roadMesh.rotation.x = -Math.PI / 2;
        roadMesh.position.set(0, 0, -ROAD_LEN / 2 + 5);
        roadMesh.receiveShadow = true;
        scene.add(roadMesh);

        // Center lane dashes
        const dashGeo = new THREE.PlaneGeometry(0.15, 1.0);
        const dashMat = new THREE.MeshStandardMaterial({ color: 0xc8c8b8, roughness: 0.8 });
        for (let z = 4; z > -ROAD_LEN + 5; z -= 3) {
            const dash = new THREE.Mesh(dashGeo, dashMat);
            dash.rotation.x = -Math.PI / 2;
            dash.position.set(0, 0.01, z);
            scene.add(dash);
        }

        // Side walls — concrete/metal barriers
        const wallGeo = new THREE.BoxGeometry(0.6, WALL_H, ROAD_LEN);
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x6a6a60,
            roughness: 0.7,
            metalness: 0.2,
        });

        wallL = new THREE.Mesh(wallGeo, wallMat);
        wallL.position.set(-ROAD_W / 2 - 0.3, WALL_H / 2, -ROAD_LEN / 2 + 5);
        wallL.castShadow = true;
        wallL.receiveShadow = true;
        scene.add(wallL);

        wallR = new THREE.Mesh(wallGeo, wallMat);
        wallR.position.set(ROAD_W / 2 + 0.3, WALL_H / 2, -ROAD_LEN / 2 + 5);
        wallR.castShadow = true;
        wallR.receiveShadow = true;
        scene.add(wallR);

        // Wall top rail
        const railGeo = new THREE.BoxGeometry(0.8, 0.15, ROAD_LEN);
        const railMat = new THREE.MeshStandardMaterial({ color: 0x888880, roughness: 0.5, metalness: 0.4 });
        const railL = new THREE.Mesh(railGeo, railMat);
        railL.position.set(-ROAD_W / 2 - 0.3, WALL_H, -ROAD_LEN / 2 + 5);
        scene.add(railL);
        const railR = new THREE.Mesh(railGeo, railMat);
        railR.position.set(ROAD_W / 2 + 0.3, WALL_H, -ROAD_LEN / 2 + 5);
        scene.add(railR);

        // Ground beyond walls
        const gndGeo = new THREE.PlaneGeometry(30, ROAD_LEN);
        const gndMat = new THREE.MeshStandardMaterial({ color: 0x7a7a6e, roughness: 1.0 });
        groundL = new THREE.Mesh(gndGeo, gndMat);
        groundL.rotation.x = -Math.PI / 2;
        groundL.position.set(-ROAD_W / 2 - 15.3, -0.05, -ROAD_LEN / 2 + 5);
        scene.add(groundL);
        groundR = new THREE.Mesh(gndGeo, gndMat);
        groundR.rotation.x = -Math.PI / 2;
        groundR.position.set(ROAD_W / 2 + 15.3, -0.05, -ROAD_LEN / 2 + 5);
        scene.add(groundR);
    }

    // ─── Soldier & Zombie Instanced Meshes ──────────────────────────
    function initUnits() {
        const planeGeo = new THREE.PlaneGeometry(1, 1);

        // Load PNG textures
        TEXTURES.soldier = loader.load('assets/soldier.png');
        TEXTURES.zombie = loader.load('assets/zombie.png');
        TEXTURES.zombieFast = loader.load('assets/zombie_fast.png');
        TEXTURES.zombieBrute = loader.load('assets/zombie_brute.png');

        // Soldier instanced mesh
        const solMat = new THREE.MeshBasicMaterial({
            map: TEXTURES.soldier,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        soldierMesh = new THREE.InstancedMesh(planeGeo, solMat, MAX_SOLDIERS);
        soldierMesh.frustumCulled = false;
        for (let i = 0; i < MAX_SOLDIERS; i++) soldierMesh.setMatrixAt(i, _zeroMatrix);
        soldierMesh.instanceMatrix.needsUpdate = true;
        scene.add(soldierMesh);

        // Zombie instanced meshes (one per type)
        const zTexKeys = [TEXTURES.zombie, TEXTURES.zombieFast, TEXTURES.zombieBrute];
        for (let t = 0; t < 3; t++) {
            const mat = new THREE.MeshBasicMaterial({
                map: zTexKeys[t],
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false,
            });
            const mesh = new THREE.InstancedMesh(planeGeo, mat, MAX_ZOMBIES);
            mesh.frustumCulled = false;
            mesh.userData = { lastCount: 0 };
            for (let i = 0; i < MAX_ZOMBIES; i++) mesh.setMatrixAt(i, _zeroMatrix);
            mesh.instanceMatrix.needsUpdate = true;
            scene.add(mesh);
            zombieMeshes[t] = mesh;
        }

        // Cyan glow circles under soldiers
        const circleGeo = new THREE.RingGeometry(0.35, 0.5, 24);
        const circleMat = new THREE.MeshBasicMaterial({
            color: 0x00e5ff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
        });
        for (let i = 0; i < MAX_SOLDIERS; i++) {
            const circle = new THREE.Mesh(circleGeo, circleMat);
            circle.rotation.x = -Math.PI / 2;
            circle.visible = false;
            scene.add(circle);
            glowCircles.push(circle);
        }
    }

    // ─── Bullet Pool ────────────────────────────────────────────────
    function initBullets() {
        const geo = new THREE.SphereGeometry(0.08, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffd600 });
        const glowGeo = new THREE.SphereGeometry(0.15, 4, 4);
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xffab00, transparent: true, opacity: 0.4 });

        for (let i = 0; i < BULLET_POOL; i++) {
            const g = new THREE.Group();
            g.add(new THREE.Mesh(geo, mat));
            g.add(new THREE.Mesh(glowGeo, glowMat));
            g.userData = { active: false, dmg: 1 };
            g.visible = false;
            scene.add(g);
            bulletPool.push(g);
        }
    }

    function fireBullet(x, z) {
        for (const b of bulletPool) {
            if (!b.userData.active) {
                b.userData.active = true;
                b.userData.dmg = damage;
                b.position.set(x, 0.4, z - 0.5);
                b.visible = true;
                return;
            }
        }
    }

    // ─── Overlay ────────────────────────────────────────────────────
    function initOverlay() {
        overlayCanvas = document.getElementById('overlay-canvas');
        if (overlayCanvas) {
            overlayCanvas.width = W();
            overlayCanvas.height = H();
            overlayCtx = overlayCanvas.getContext('2d');
        }
    }

    // ─── Spawn Zombies ──────────────────────────────────────────────
    let nextSpawnZ = -15;
    const SPAWN_INTERVAL = 10; // distance between waves

    function spawnWave() {
        const count = Math.min(6 + Math.floor(worldScroll / 30) * 2, 25);
        for (let i = 0; i < count; i++) {
            let idx = -1;
            for (let j = 0; j < MAX_ZOMBIES; j++) {
                if (!zActive[j]) { idx = j; break; }
            }
            if (idx < 0) break;

            const r = rng();
            let type = 0;
            if (worldScroll > 60 && r < 0.15) type = 2; // brute
            else if (worldScroll > 30 && r < 0.3) type = 1; // fast

            zX[idx] = (rng() - 0.5) * (ROAD_W - 1.5);
            zZ[idx] = nextSpawnZ - rng() * 8;
            zHP[idx] = type === 2 ? 5 : (type === 1 ? 1 : 2);
            zMaxHP[idx] = zHP[idx];
            zSpeed[idx] = type === 1 ? 5.5 : (type === 2 ? 2.5 : 3.5);
            zSpeed[idx] += (rng() - 0.5) * 0.8;
            zActive[idx] = 1;
            zType[idx] = type;
            zScale[idx] = type === 2 ? 2.2 : (type === 1 ? 1.4 : 1.6);

            if (idx >= zombieHighWater) zombieHighWater = idx + 1;
        }
    }

    // ─── Particles (muzzle flash, fire, death) ──────────────────────
    const particles = [];
    const MAX_PARTICLES = 60;

    function spawnParticle(x, y, z, color, size, life, vx, vy, vz) {
        if (particles.length >= MAX_PARTICLES) {
            const old = particles.shift();
            scene.remove(old.mesh);
        }
        const geo = new THREE.SphereGeometry(size, 3, 3);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        scene.add(mesh);
        particles.push({ mesh, vx, vy, vz, life, maxLife: life });
    }

    function spawnMuzzleFlash(x, z) {
        for (let i = 0; i < 3; i++) {
            spawnParticle(
                x + (Math.random() - 0.5) * 0.3, 0.4, z - 0.3,
                0xff8800, 0.08 + Math.random() * 0.06,
                0.1 + Math.random() * 0.1,
                (Math.random() - 0.5) * 2, Math.random() * 3, -Math.random() * 2
            );
        }
    }

    function spawnDeathBurst(x, z, color) {
        for (let i = 0; i < 6; i++) {
            spawnParticle(
                x + (Math.random() - 0.5) * 0.5, 0.3 + Math.random() * 0.5, z,
                color, 0.06 + Math.random() * 0.08,
                0.3 + Math.random() * 0.3,
                (Math.random() - 0.5) * 4, Math.random() * 4 + 1, (Math.random() - 0.5) * 4
            );
        }
    }

    function spawnFireEffect(x, z) {
        spawnParticle(
            x + (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.8, z,
            Math.random() < 0.5 ? 0xff6600 : 0xffaa00,
            0.1 + Math.random() * 0.15,
            0.2 + Math.random() * 0.2,
            (Math.random() - 0.5) * 1, Math.random() * 2 + 1, (Math.random() - 0.5) * 0.5
        );
    }

    // ─── Damage Numbers ─────────────────────────────────────────────
    const dmgNumbers = [];

    function spawnDmgNumber(x, z, val) {
        dmgNumbers.push({ x, z, val, life: 0.8, y: 1.2 });
    }

    // ─── Update Instanced Meshes ────────────────────────────────────
    function updateSoldiers() {
        const count = Math.min(squadCount, MAX_SOLDIERS);
        const cols = Math.min(count, 5);

        for (let i = 0; i < count; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const spacing = 1.1;
            const ox = (col - (cols - 1) / 2) * spacing;
            const oz = row * 0.8;
            const bob = Math.sin(time * 3 + i * 0.7) * 0.05;

            const sx = playerX + ox;
            const sz = oz + 1;
            _dummy.position.set(sx, 0.7 + bob, sz);
            _dummy.quaternion.copy(camera.quaternion);
            _dummy.scale.set(1.6, 1.6, 1);
            _dummy.updateMatrix();
            soldierMesh.setMatrixAt(i, _dummy.matrix);

            // Glow circle
            if (i < glowCircles.length) {
                glowCircles[i].position.set(sx, 0.02, sz);
                glowCircles[i].visible = true;
            }
        }
        // Hide unused
        for (let i = count; i < MAX_SOLDIERS; i++) {
            soldierMesh.setMatrixAt(i, _zeroMatrix);
            if (i < glowCircles.length) glowCircles[i].visible = false;
        }
        soldierMesh.count = Math.max(count, 1);
        soldierMesh.instanceMatrix.needsUpdate = true;
    }

    function updateZombies() {
        const counts = [0, 0, 0];
        let activeCount = 0;

        for (let i = 0; i < zombieHighWater; i++) {
            if (!zActive[i]) continue;
            activeCount++;
            const type = zType[i];
            const idx = counts[type]++;
            const scale = zScale[i];

            _dummy.position.set(zX[i], scale * 0.4, zZ[i]);
            _dummy.quaternion.copy(camera.quaternion);
            _dummy.scale.set(scale, scale, 1);
            _dummy.updateMatrix();
            zombieMeshes[type].setMatrixAt(idx, _dummy.matrix);

            // Fire effect on brutes
            if (type === 2 && Math.random() < 0.3) {
                spawnFireEffect(zX[i], zZ[i]);
            }
        }

        for (let t = 0; t < 3; t++) {
            const mesh = zombieMeshes[t];
            const prev = mesh.userData.lastCount || 0;
            for (let i = counts[t]; i < prev; i++) mesh.setMatrixAt(i, _zeroMatrix);
            mesh.userData.lastCount = counts[t];
            mesh.count = Math.max(counts[t], 1);
            mesh.instanceMatrix.needsUpdate = true;
        }

        return activeCount;
    }

    // ─── Render Overlay (HP bars, damage numbers) ───────────────────
    function renderOverlay() {
        if (!overlayCtx) return;
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        // Zombie HP bars
        for (let i = 0; i < zombieHighWater; i++) {
            if (!zActive[i]) continue;
            if (zHP[i] >= zMaxHP[i]) continue;

            const pos = new THREE.Vector3(zX[i], zScale[i] * 0.8 + 0.3, zZ[i]);
            pos.project(camera);
            const sx = (pos.x * 0.5 + 0.5) * overlayCanvas.width;
            const sy = (-pos.y * 0.5 + 0.5) * overlayCanvas.height;
            if (pos.z > 1) continue;

            const bw = 30, bh = 4;
            overlayCtx.fillStyle = 'rgba(0,0,0,0.5)';
            overlayCtx.fillRect(sx - bw / 2, sy, bw, bh);
            const frac = zHP[i] / zMaxHP[i];
            overlayCtx.fillStyle = frac > 0.5 ? '#4caf50' : (frac > 0.25 ? '#ff9800' : '#f44336');
            overlayCtx.fillRect(sx - bw / 2, sy, bw * frac, bh);
        }

        // Damage numbers
        overlayCtx.font = 'bold 18px system-ui';
        overlayCtx.textAlign = 'center';
        for (const dn of dmgNumbers) {
            const pos = new THREE.Vector3(dn.x, dn.y, dn.z);
            pos.project(camera);
            const sx = (pos.x * 0.5 + 0.5) * overlayCanvas.width;
            const sy = (-pos.y * 0.5 + 0.5) * overlayCanvas.height;
            if (pos.z > 1) continue;

            const alpha = Math.min(1, dn.life * 3);
            overlayCtx.strokeStyle = `rgba(0,0,0,${alpha * 0.7})`;
            overlayCtx.lineWidth = 3;
            overlayCtx.strokeText(dn.val, sx, sy);
            overlayCtx.fillStyle = `rgba(255,220,50,${alpha})`;
            overlayCtx.fillText(dn.val, sx, sy);
        }

        // Squad count
        overlayCtx.font = 'bold 14px system-ui';
        overlayCtx.fillStyle = '#fff';
        overlayCtx.textAlign = 'left';
        overlayCtx.fillText('SQUAD: ' + squadCount, 10, 25);
        overlayCtx.fillText('SCORE: ' + score, 10, 45);
    }

    // ─── Input ──────────────────────────────────────────────────────
    function initInput() {
        let touching = false;

        function steerTo(clientX) {
            const nx = (clientX / W()) * 2 - 1; // -1 to 1
            targetX = nx * (ROAD_W / 2 - 1);
        }

        renderer.domElement.addEventListener('pointerdown', (e) => {
            touching = true;
            steerTo(e.clientX);
            if (state === 'menu') {
                state = 'playing';
                document.getElementById('start-screen').classList.add('hidden');
                document.getElementById('start-screen').classList.remove('active');
            }
        });
        renderer.domElement.addEventListener('pointermove', (e) => {
            if (touching) steerTo(e.clientX);
        });
        renderer.domElement.addEventListener('pointerup', () => { touching = false; });

        // Keyboard
        const keys = {};
        window.addEventListener('keydown', (e) => { keys[e.key] = true; });
        window.addEventListener('keyup', (e) => { keys[e.key] = false; });

        return keys;
    }

    // ─── Main Update ────────────────────────────────────────────────
    let lastTime = 0;
    let keys = {};

    function update(dt) {
        if (state !== 'playing') return;

        time += dt;
        worldScroll += WORLD_SPEED * dt;

        // Steering
        if (keys['ArrowLeft'] || keys['a']) targetX -= STEER_SPEED * dt;
        if (keys['ArrowRight'] || keys['d']) targetX += STEER_SPEED * dt;
        targetX = Math.max(-ROAD_W / 2 + 0.8, Math.min(ROAD_W / 2 - 0.8, targetX));
        playerX += (targetX - playerX) * 8 * dt;

        // Auto-fire
        fireCooldown -= dt;
        if (fireCooldown <= 0) {
            fireCooldown = 1.0 / fireRate;
            // Fire from each front-row soldier
            const cols = Math.min(squadCount, 5);
            for (let c = 0; c < cols; c++) {
                const ox = (c - (cols - 1) / 2) * 1.1;
                fireBullet(playerX + ox, 1);
                spawnMuzzleFlash(playerX + ox, 1);
            }
        }

        // Update bullets
        for (const b of bulletPool) {
            if (!b.userData.active) continue;
            b.position.z -= BULLET_SPEED * dt;
            if (b.position.z < -ROAD_LEN) {
                b.userData.active = false;
                b.visible = false;
            }
        }

        // Spawn waves
        if (worldScroll > -nextSpawnZ) {
            spawnWave();
            nextSpawnZ -= SPAWN_INTERVAL;
        }

        // Move zombies toward player
        for (let i = 0; i < zombieHighWater; i++) {
            if (!zActive[i]) continue;

            // Move toward player Z
            zZ[i] += zSpeed[i] * dt;

            // Slight X drift toward player
            const dx = playerX - zX[i];
            zX[i] += Math.sign(dx) * Math.min(Math.abs(dx), 1.0 * dt);
            zX[i] = Math.max(-ROAD_W / 2 + 0.5, Math.min(ROAD_W / 2 - 0.5, zX[i]));

            // Collision with player
            if (zZ[i] > 0.5 && Math.abs(zX[i] - playerX) < 1.0) {
                zActive[i] = 0;
                squadCount--;
                spawnDeathBurst(zX[i], zZ[i], 0x2196f3);
                if (squadCount <= 0) {
                    state = 'gameover';
                    document.getElementById('gameover-screen').classList.remove('hidden');
                    document.getElementById('gameover-screen').classList.add('active');
                    document.getElementById('go-score').textContent = score;
                    return;
                }
            }

            // Past player — cleanup
            if (zZ[i] > 5) {
                zActive[i] = 0;
            }
        }

        // Bullet-zombie collision
        for (const b of bulletPool) {
            if (!b.userData.active) continue;
            for (let i = 0; i < zombieHighWater; i++) {
                if (!zActive[i]) continue;
                const hitR = zScale[i] * 0.4;
                if (Math.abs(b.position.x - zX[i]) < hitR && Math.abs(b.position.z - zZ[i]) < hitR) {
                    b.userData.active = false;
                    b.visible = false;
                    zHP[i] -= b.userData.dmg;
                    spawnDmgNumber(zX[i], zZ[i], b.userData.dmg);
                    if (zHP[i] <= 0) {
                        zActive[i] = 0;
                        score += zType[i] === 2 ? 30 : (zType[i] === 1 ? 15 : 10);
                        spawnDeathBurst(zX[i], zZ[i], 0x76ff03);
                    }
                    break;
                }
            }
        }

        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                scene.remove(p.mesh);
                particles.splice(i, 1);
                continue;
            }
            p.mesh.position.x += p.vx * dt;
            p.mesh.position.y += p.vy * dt;
            p.mesh.position.z += p.vz * dt;
            p.vy -= 10 * dt; // gravity
            p.mesh.material.opacity = p.life / p.maxLife;
        }

        // Update damage numbers
        for (let i = dmgNumbers.length - 1; i >= 0; i--) {
            dmgNumbers[i].life -= dt;
            dmgNumbers[i].y += 2 * dt;
            if (dmgNumbers[i].life <= 0) dmgNumbers.splice(i, 1);
        }

        // Update instanced meshes
        updateSoldiers();
        const activeZ = updateZombies();

        // Camera follow
        camera.position.set(0, CAM_Y, CAM_Z);
        camera.lookAt(playerX * 0.2, LOOK_Y, LOOK_Z);

        // Render overlay
        renderOverlay();
    }

    // ─── Loop ───────────────────────────────────────────────────────
    function loop(ts) {
        requestAnimationFrame(loop);
        const dt = Math.min((ts - lastTime) / 1000, 0.05);
        lastTime = ts;

        update(dt);
        renderer.render(scene, camera);
    }

    // ─── Start ──────────────────────────────────────────────────────
    function startGame() {
        playerX = 0; targetX = 0;
        squadCount = 5;
        fireRate = 4;
        damage = 1;
        fireCooldown = 0;
        score = 0;
        worldScroll = 0;
        nextSpawnZ = -15;
        zombieHighWater = 0;
        seedRng(42);
        zActive.fill(0);

        // Clear bullets
        for (const b of bulletPool) {
            b.userData.active = false;
            b.visible = false;
        }

        // Clear particles
        for (const p of particles) scene.remove(p.mesh);
        particles.length = 0;
        dmgNumbers.length = 0;

        state = 'playing';
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('gameover-screen').classList.add('hidden');
        document.getElementById('gameover-screen').classList.remove('active');
    }

    // ─── Init everything ────────────────────────────────────────────
    initRenderer();
    initEnvironment();
    initUnits();
    initBullets();
    initOverlay();
    keys = initInput();

    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-retry').addEventListener('click', startGame);

    requestAnimationFrame(loop);

    // Debug interface
    window._gameDebug = () => ({
        activeZombies: zActive.reduce((s, v) => s + v, 0),
        squad: squadCount, score, worldScroll, state,
        fps: Math.round(1000 / Math.max(1, performance.now() - lastTime))
    });
    window._steer = (x) => { targetX = Math.max(-ROAD_W / 2 + 0.8, Math.min(ROAD_W / 2 - 0.8, x)); };
})();
