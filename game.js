// Barrel Defense — LastTokens
// Shoot barrels for upgrades. Shoot enemies to survive. The game from the fake ads — made real.

(function () {
    'use strict';

    // ─── Three.js Setup ─────────────────────────────────────────────
    let scene, camera, renderer;
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    function initRenderer() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1520);
        scene.fog = new THREE.FogExp2(0x1a1520, 0.018);

        // Behind-the-player camera — lower, closer, more over-the-shoulder
        camera = new THREE.PerspectiveCamera(55, W() / H(), 0.1, 200);
        camera.position.set(0, 5.5, 9);
        camera.lookAt(0, 1, -15);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(W(), H());
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        document.body.insertBefore(renderer.domElement, document.body.firstChild);

        // Dim ambient — most light comes from fire/muzzle
        scene.add(new THREE.AmbientLight(0x334455, 0.35));

        // Main directional (moonlight feel)
        const sun = new THREE.DirectionalLight(0x8899bb, 0.4);
        sun.position.set(5, 20, 10);
        sun.castShadow = true;
        sun.shadow.camera.left = -20;
        sun.shadow.camera.right = 20;
        sun.shadow.camera.top = 40;
        sun.shadow.camera.bottom = -10;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        scene.add(sun);

        // Warm fire-colored point light at player (big radius)
        const pLight = new THREE.PointLight(0xff6622, 1.2, 35);
        pLight.position.set(0, 3, 6);
        scene.add(pLight);

        // Secondary fire glow down the road
        const pLight2 = new THREE.PointLight(0xff4400, 0.6, 30);
        pLight2.position.set(0, 2, -10);
        scene.add(pLight2);

        // Red rim from the far end (enemy side)
        const farLight = new THREE.PointLight(0xff2200, 0.5, 50);
        farLight.position.set(0, 5, -40);
        scene.add(farLight);

        window.addEventListener('resize', () => {
            camera.aspect = W() / H();
            camera.updateProjectionMatrix();
            renderer.setSize(W(), H());
        });
    }

    // ─── DOM ────────────────────────────────────────────────────────
    const startScreen = document.getElementById('start-screen');
    const gameoverScreen = document.getElementById('gameover-screen');
    const waveScreen = document.getElementById('wave-screen');
    const goTitle = document.getElementById('go-title');
    const goWave = document.getElementById('go-wave');
    const goScore = document.getElementById('go-score');
    const wsWave = document.getElementById('ws-wave');
    const wsCoins = document.getElementById('ws-coins');
    const waveDisplay = document.getElementById('wave-display');
    const squadDisplay = document.getElementById('squad-display');
    const coinDisplay = document.getElementById('coin-display');
    const weaponDisplay = document.getElementById('weapon-display');
    const hudEl = document.getElementById('hud');
    const waveBar = document.getElementById('wave-bar');
    const waveBarFill = document.getElementById('wave-bar-fill');
    const actionText = document.getElementById('action-text');
    const upgradeButtons = document.getElementById('upgrade-buttons');

    // ─── Audio ──────────────────────────────────────────────────────
    let audioCtx;
    function ensureAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    function playTone(freq, dur, type, vol, ramp) {
        ensureAudio();
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, audioCtx.currentTime);
        if (ramp) o.frequency.linearRampToValueAtTime(ramp, audioCtx.currentTime + dur);
        g.gain.setValueAtTime(vol || 0.15, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playNoise(dur, vol) {
        ensureAudio();
        const n = audioCtx.sampleRate * dur, buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
        const s = audioCtx.createBufferSource(); s.buffer = buf;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(vol || 0.08, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        s.connect(g); g.connect(audioCtx.destination); s.start();
    }
    const SFX = {
        shoot: () => playNoise(0.03, 0.05),
        hit: () => playTone(200, 0.06, 'square', 0.08, 100),
        enemyDie: () => { playTone(120, 0.1, 'sine', 0.1); playNoise(0.05, 0.06); },
        barrelBreak: () => { playNoise(0.2, 0.15); playTone(400, 0.1, 'sine', 0.12, 800); },
        upgrade: () => { playTone(523, 0.08, 'sine', 0.1); setTimeout(() => playTone(784, 0.12, 'sine', 0.12), 80); },
        waveClear: () => { [523,659,784,1047].forEach((f,i) => setTimeout(() => playTone(f,0.15,'sine',0.1), i*80)); },
        gameOver: () => { [330,262,220,165].forEach((f,i) => setTimeout(() => playTone(f,0.3,'sine',0.1), i*180)); },
        coin: () => playTone(1200, 0.05, 'sine', 0.06, 1800),
    };

    // ─── Materials ──────────────────────────────────────────────────
    const MAT = {
        road: new THREE.MeshStandardMaterial({ color: 0x444455 }),
        roadLine: new THREE.MeshBasicMaterial({ color: 0x666677 }),
        wall: new THREE.MeshStandardMaterial({ color: 0x555566 }),
        wallTop: new THREE.MeshStandardMaterial({ color: 0x666677 }),
        skin: new THREE.MeshStandardMaterial({ color: 0xDDBB88 }),
        skinDark: new THREE.MeshStandardMaterial({ color: 0xBB9966 }),
        soldierBody: new THREE.MeshStandardMaterial({ color: 0x556B2F }),
        soldierPants: new THREE.MeshStandardMaterial({ color: 0x3B4A28 }),
        soldierBoots: new THREE.MeshStandardMaterial({ color: 0x333333 }),
        soldierVest: new THREE.MeshStandardMaterial({ color: 0x4A5A30 }),
        gun: new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.3 }),
        gunAccent: new THREE.MeshStandardMaterial({ color: 0x556633, metalness: 0.3 }),
        zombieSkin: new THREE.MeshStandardMaterial({ color: 0x779966 }),
        zombieClothes: new THREE.MeshStandardMaterial({ color: 0x665544 }),
        zombieDark: new THREE.MeshStandardMaterial({ color: 0x554433 }),
        barrel: new THREE.MeshStandardMaterial({ color: 0x8B5E3C, metalness: 0.2, roughness: 0.7 }),
        barrelRing: new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.5 }),
        crate: new THREE.MeshStandardMaterial({ color: 0x6B5B3C }),
        crateEdge: new THREE.MeshStandardMaterial({ color: 0x555544 }),
        bullet: new THREE.MeshBasicMaterial({ color: 0xffee44 }),
        bulletGlow: new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.4 }),
        muzzleFlash: new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.8 }),
        firePart: new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true }),
        coin: new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.8, roughness: 0.2 }),
        selCircle: new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.4 }),
    };

    // ─── Difficulty ─────────────────────────────────────────────────
    const DIFF = {
        easy:   { enemySpeed: 1.5, enemyHP: 0.6, spawnRate: 0.7, barrelRate: 1.3, coins: 1.5 },
        normal: { enemySpeed: 2.2, enemyHP: 1.0, spawnRate: 1.0, barrelRate: 1.0, coins: 1.0 },
        hard:   { enemySpeed: 3.0, enemyHP: 1.4, spawnRate: 1.4, barrelRate: 0.7, coins: 0.7 },
    };
    let diff = DIFF.normal;
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            diff = DIFF[btn.dataset.diff];
        });
    });

    // ─── Weapons ────────────────────────────────────────────────────
    const WEAPONS = [
        { name: 'Pistol',      damage: 1, fireRate: 2.5, color: 0xffee44, size: 0.10 },
        { name: 'SMG',         damage: 1, fireRate: 5.0, color: 0xffaa22, size: 0.11 },
        { name: 'Shotgun',     damage: 3, fireRate: 1.8, color: 0xff8822, size: 0.14 },
        { name: 'Machine Gun', damage: 2, fireRate: 8.0, color: 0xff5500, size: 0.13 },
        { name: 'Minigun',     damage: 4, fireRate: 12,  color: 0xff2200, size: 0.15 },
    ];

    // ─── Game State ─────────────────────────────────────────────────
    let state = 'menu';
    let wave = 0, score = 0, coins = 0;
    let squadCount = 1, weaponLevel = 0;
    let bulletDamage = 1, fireRate = 2.5, bulletSpeed = 35;
    let pressure = 1.0, squadAtWaveStart = 1;
    let upgrades = { weapon: 0, squad: 0 };

    let squad = [], enemies = [], barrels = [], bullets = [], particles = [];
    let coinPickups = [];
    let aimX = 0, fireCooldown = 0, shakeAmount = 0;
    let waveEnemiesLeft = 0, waveEnemiesTotal = 0, waveBarrelsLeft = 0;
    let spawnTimer = 0, barrelTimer = 0;
    let muzzleFlashes = [];

    const ROAD_W = 8;
    const DEFENSE_Z = 2;
    const SPAWN_Z_MIN = -55;
    const SPAWN_Z_MAX = -25;

    // ─── Road / Environment ─────────────────────────────────────────
    let envMeshes = [];

    function initEnvironment() {
        envMeshes.forEach(m => scene.remove(m));
        envMeshes = [];

        // Road (darker, battle-worn)
        const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 100),
            new THREE.MeshStandardMaterial({ color: 0x333340, roughness: 0.9 }));
        road.rotation.x = -Math.PI / 2;
        road.position.set(0, -0.01, -25);
        road.receiveShadow = true;
        scene.add(road); envMeshes.push(road);

        // Center line (dashed)
        for (let z = 5; z > -70; z -= 4) {
            const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 1.5), MAT.roadLine);
            dash.rotation.x = -Math.PI / 2;
            dash.position.set(0, 0.01, z);
            scene.add(dash); envMeshes.push(dash);
        }

        // Edge lines on road
        for (const side of [-1, 1]) {
            for (let z = 5; z > -70; z -= 2) {
                const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 1.2),
                    new THREE.MeshBasicMaterial({ color: 0x555560 }));
                mark.rotation.x = -Math.PI / 2;
                mark.position.set(side * (ROAD_W / 2 - 0.4), 0.01, z);
                scene.add(mark); envMeshes.push(mark);
            }
        }

        // Side walls (thicker, taller — industrial corridor)
        for (const side of [-1, 1]) {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(1.0, 4.5, 100),
                new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.85 }));
            wall.position.set(side * (ROAD_W / 2 + 0.5), 2.25, -25);
            wall.castShadow = true;
            scene.add(wall); envMeshes.push(wall);

            // Wall cap / ledge
            const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, 100),
                new THREE.MeshStandardMaterial({ color: 0x555566 }));
            cap.position.set(side * (ROAD_W / 2 + 0.5), 4.5, -25);
            scene.add(cap); envMeshes.push(cap);

            // Wall buttresses every 8 units
            for (let z = 0; z > -60; z -= 8) {
                const buttress = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.5, 0.8),
                    new THREE.MeshStandardMaterial({ color: 0x444450 }));
                buttress.position.set(side * (ROAD_W / 2 + 0.05), 2.25, z);
                buttress.castShadow = true;
                scene.add(buttress); envMeshes.push(buttress);
            }
        }

        // Ground beyond walls
        for (const side of [-1, 1]) {
            const gnd = new THREE.Mesh(new THREE.PlaneGeometry(30, 100),
                new THREE.MeshStandardMaterial({ color: 0x222230 }));
            gnd.rotation.x = -Math.PI / 2;
            gnd.position.set(side * 19, -0.05, -25);
            scene.add(gnd); envMeshes.push(gnd);
        }

        // Rubble/debris on road
        const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x555544 });
        for (let i = 0; i < 25; i++) {
            const s = 0.1 + Math.random() * 0.25;
            const rubble = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.6, s), rubbleMat);
            rubble.position.set(
                (Math.random() - 0.5) * ROAD_W * 0.9,
                s * 0.3,
                -5 - Math.random() * 55
            );
            rubble.rotation.y = Math.random() * Math.PI;
            rubble.rotation.z = Math.random() * 0.3;
            scene.add(rubble); envMeshes.push(rubble);
        }

        // Barricade at defense line
        const barricadeMat = new THREE.MeshStandardMaterial({ color: 0x665533, roughness: 0.9 });
        for (let x = -ROAD_W / 2 + 0.5; x <= ROAD_W / 2 - 0.5; x += 1.8) {
            const sandbag = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.5), barricadeMat);
            sandbag.position.set(x + (Math.random() - 0.5) * 0.3, 0.18, DEFENSE_Z + 2.5);
            sandbag.rotation.y = (Math.random() - 0.5) * 0.15;
            scene.add(sandbag); envMeshes.push(sandbag);
        }
        // Second row
        for (let x = -ROAD_W / 2 + 1.2; x <= ROAD_W / 2 - 1.2; x += 2.0) {
            const sandbag = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 0.45), barricadeMat);
            sandbag.position.set(x, 0.48, DEFENSE_Z + 2.5);
            scene.add(sandbag); envMeshes.push(sandbag);
        }

        // Ambient fire barrels along walls (just orange point lights)
        for (let z = -5; z > -50; z -= 12) {
            for (const side of [-1, 1]) {
                const fLight = new THREE.PointLight(0xff5500, 0.3, 8);
                fLight.position.set(side * (ROAD_W / 2 - 0.3), 2, z);
                scene.add(fLight); envMeshes.push(fLight);
            }
        }
    }

    // ─── 3D Character Models ────────────────────────────────────────

    function createSoldier() {
        const g = new THREE.Group();

        // Legs
        const legGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.5, 6);
        const legL = new THREE.Mesh(legGeo, MAT.soldierPants);
        legL.position.set(-0.15, 0.25, 0); g.add(legL);
        const legR = new THREE.Mesh(legGeo, MAT.soldierPants);
        legR.position.set(0.15, 0.25, 0); g.add(legR);

        // Boots
        const bootGeo = new THREE.BoxGeometry(0.18, 0.12, 0.25);
        const bootL = new THREE.Mesh(bootGeo, MAT.soldierBoots);
        bootL.position.set(-0.15, 0.06, 0.02); g.add(bootL);
        const bootR = new THREE.Mesh(bootGeo, MAT.soldierBoots);
        bootR.position.set(0.15, 0.06, 0.02); g.add(bootR);

        // Torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.3), MAT.soldierBody);
        torso.position.y = 0.75; g.add(torso);

        // Vest/armor
        const vest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.35, 0.33), MAT.soldierVest);
        vest.position.y = 0.8; g.add(vest);

        // Arms
        const armGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.45, 6);
        const armL = new THREE.Mesh(armGeo, MAT.soldierBody);
        armL.position.set(-0.32, 0.7, 0); armL.rotation.z = 0.15; g.add(armL);
        const armR = new THREE.Mesh(armGeo, MAT.soldierBody);
        armR.position.set(0.32, 0.7, -0.1); armR.rotation.x = -0.8; g.add(armR);

        // Hands
        const handGeo = new THREE.SphereGeometry(0.07, 6, 6);
        const handR = new THREE.Mesh(handGeo, MAT.skin);
        handR.position.set(0.32, 0.55, -0.3); g.add(handR);

        // Head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), MAT.skin);
        head.position.y = 1.15; g.add(head);

        // Helmet
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), MAT.soldierVest);
        helmet.position.y = 1.2; helmet.scale.set(1, 0.8, 1); g.add(helmet);

        // Selection circle under feet
        const circle = new THREE.Mesh(
            new THREE.RingGeometry(0.25, 0.35, 16),
            MAT.selCircle
        );
        circle.rotation.x = -Math.PI / 2;
        circle.position.y = 0.02;
        g.add(circle);

        return g;
    }

    function createWeaponMesh(level) {
        const g = new THREE.Group();
        switch (level) {
            case 0: // Pistol
                g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.25), MAT.gun), { position: new THREE.Vector3(0, 0, 0) }));
                g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.15, 4), MAT.gun), { position: new THREE.Vector3(0, 0.03, -0.18) }));
                g.children[1].rotation.x = Math.PI / 2;
                break;
            case 1: // SMG
                g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.35), MAT.gun), { position: new THREE.Vector3(0, 0, 0) }));
                g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 4), MAT.gun), { position: new THREE.Vector3(0, 0.03, -0.25) }));
                g.children[1].rotation.x = Math.PI / 2;
                g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.05), MAT.gun), { position: new THREE.Vector3(0, -0.1, 0.05) }));
                break;
            case 2: // Shotgun
                g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), MAT.gun), { position: new THREE.Vector3(0, 0, 0) }));
                g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.25, 6), MAT.gun), { position: new THREE.Vector3(0, 0.02, -0.35) }));
                g.children[1].rotation.x = Math.PI / 2;
                g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.1), MAT.gunAccent), { position: new THREE.Vector3(0, -0.05, -0.05) }));
                break;
            case 3: // Machine Gun
                g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.55), MAT.gun), { position: new THREE.Vector3(0, 0, 0) }));
                g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6), MAT.gun), { position: new THREE.Vector3(0, 0.03, -0.4) }));
                g.children[1].rotation.x = Math.PI / 2;
                g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.12), MAT.gunAccent), { position: new THREE.Vector3(0, -0.08, 0.12) }));
                break;
            case 4: // Minigun
                g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.45), MAT.gun), { position: new THREE.Vector3(0, 0, 0) }));
                for (let i = 0; i < 4; i++) {
                    const a = (i / 4) * Math.PI * 2;
                    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 4), MAT.gun);
                    barrel.rotation.x = Math.PI / 2;
                    barrel.position.set(Math.cos(a) * 0.04, Math.sin(a) * 0.04 + 0.02, -0.38);
                    g.add(barrel);
                }
                g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), MAT.gunAccent), { position: new THREE.Vector3(0, -0.1, 0.08) }));
                break;
        }
        return g;
    }

    function createZombie() {
        const g = new THREE.Group();

        // Legs
        const legGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.5, 5);
        const legL = new THREE.Mesh(legGeo, MAT.zombieDark);
        legL.position.set(-0.12, 0.25, 0); g.add(legL);
        const legR = new THREE.Mesh(legGeo, MAT.zombieDark);
        legR.position.set(0.12, 0.25, 0); g.add(legR);

        // Torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.25), MAT.zombieClothes);
        torso.position.y = 0.7; g.add(torso);

        // Arms (reaching forward — zombie pose)
        const armGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.4, 5);
        const armL = new THREE.Mesh(armGeo, MAT.zombieSkin);
        armL.position.set(-0.28, 0.65, -0.15);
        armL.rotation.x = -1.2; armL.rotation.z = 0.3;
        g.add(armL);
        const armR = new THREE.Mesh(armGeo, MAT.zombieSkin);
        armR.position.set(0.28, 0.7, -0.2);
        armR.rotation.x = -1.0; armR.rotation.z = -0.2;
        g.add(armR);

        // Head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 7), MAT.zombieSkin);
        head.position.set(0, 1.05, 0);
        head.scale.set(1, 1.1, 1);
        g.add(head);

        // Eyes (glowing red)
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
        const eyeGeo = new THREE.SphereGeometry(0.03, 4, 4);
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
        eyeL.position.set(-0.06, 1.07, -0.14); g.add(eyeL);
        const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
        eyeR.position.set(0.06, 1.07, -0.14); g.add(eyeR);

        g.userData = { legL, legR, armL, armR, phase: Math.random() * Math.PI * 2 };
        return g;
    }

    function createBarrelObj(type) {
        const g = new THREE.Group();
        const colors = { squad: 0x44ff88, weapon: 0xff4444, coins: 0xffdd44 };
        const col = colors[type];

        // Crate body — bigger, chunkier (like screenshot)
        const crateMat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.8 });
        const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), crateMat);
        crate.position.y = 0.75; crate.castShadow = true; g.add(crate);

        // Metal edges/bands
        const edgeMat = new THREE.MeshStandardMaterial({ color: 0x666655, metalness: 0.4 });
        const edgeGeo = new THREE.BoxGeometry(1.55, 0.1, 1.55);
        for (const y of [0.05, 0.75, 1.45]) {
            const edge = new THREE.Mesh(edgeGeo, edgeMat);
            edge.position.y = y; g.add(edge);
        }

        // Colored glowing panels on all 4 sides
        const panelGeo = new THREE.BoxGeometry(1.0, 0.8, 0.06);
        const panelMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 });
        for (let r = 0; r < 4; r++) {
            const panel = new THREE.Mesh(panelGeo, panelMat);
            panel.position.y = 0.75;
            const angle = r * Math.PI / 2;
            panel.position.x = Math.sin(angle) * 0.76;
            panel.position.z = Math.cos(angle) * 0.76;
            panel.rotation.y = angle;
            g.add(panel);
        }

        // Top glow
        const glow = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.06, 1.1),
            new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6 })
        );
        glow.position.y = 1.52; g.add(glow);

        // Point light for the glow
        const cLight = new THREE.PointLight(col, 0.6, 5);
        cLight.position.set(0, 1.5, 0);
        g.add(cLight);

        return g;
    }

    // ─── Text Sprites ───────────────────────────────────────────────
    function createTextSprite(text, color, scale) {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 80px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 6;
        ctx.strokeText(text, 128, 64);
        ctx.fillStyle = color; ctx.fillText(text, 128, 64);
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(scale * 2, scale, 1);
        sprite.userData = { canvas, ctx, tex };
        return sprite;
    }

    function updateSpriteText(sprite, text, color) {
        const { canvas, ctx, tex } = sprite.userData;
        ctx.clearRect(0, 0, 256, 128);
        ctx.font = 'bold 80px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 6;
        ctx.strokeText(text, 128, 64);
        ctx.fillStyle = color || '#fff'; ctx.fillText(text, 128, 64);
        tex.needsUpdate = true;
    }

    // ─── Entity Spawning ────────────────────────────────────────────

    function spawnSquadMember(index) {
        const soldier = createSoldier();
        const spread = Math.min(squadCount - 1, 5) * 0.9;
        const ox = squadCount === 1 ? 0 : -spread / 2 + (index / Math.max(1, squadCount - 1)) * spread;

        // Attach weapon
        const weapon = createWeaponMesh(weaponLevel);
        weapon.position.set(0.25, 0.55, -0.25);
        soldier.add(weapon);

        soldier.position.set(aimX + ox, 0, DEFENSE_Z + 1);
        soldier.scale.setScalar(1.4); // bigger, more visible from behind
        soldier.userData.offsetX = ox;
        soldier.userData.weapon = weapon;
        soldier.userData.phase = Math.random() * Math.PI * 2;
        scene.add(soldier);
        return soldier;
    }

    function rebuildSquad() {
        squad.forEach(s => scene.remove(s));
        squad = [];
        for (let i = 0; i < squadCount; i++) squad.push(spawnSquadMember(i));
    }

    function spawnEnemy(z, hp) {
        const cx = (Math.random() - 0.5) * (ROAD_W - 2);
        const group = new THREE.Group();
        group.position.set(cx, 0, z);

        const count = Math.min(hp, 25);
        const zombies = [];
        const spread = Math.min(1.8, 0.3 + count * 0.1);
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * spread;
            const zombie = createZombie();
            zombie.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
            zombie.rotation.y = Math.PI; // face the player
            group.add(zombie);
            zombies.push(zombie);
        }

        const speed = diff.enemySpeed * (0.8 + Math.random() * 0.4) * (1 + wave * 0.04);
        group.userData = { hp, maxHp: hp, speed, wobble: Math.random() * Math.PI * 2, zombies };
        scene.add(group);
        enemies.push(group);
    }

    function spawnBarrel(z) {
        // Crates positioned on SIDES of the road (like the screenshot)
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = side * (ROAD_W / 2 - 1.5 + Math.random() * 0.5);

        const types = ['squad', 'weapon', 'coins', 'squad'];
        const weights = [4, 3, 3, 3];
        let total = weights.reduce((a, b) => a + b), r = Math.random() * total, type = types[0];
        for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) { type = types[i]; break; } }

        const hp = Math.ceil((2 + wave * 1.0) * diff.enemyHP);
        const labels = { squad: 'ALLY+', weapon: weaponLevel < WEAPONS.length - 1 ? WEAPONS[weaponLevel + 1].name : 'MAX', coins: 'COINS' };

        const crate = createBarrelObj(type);
        crate.position.set(x, 0, z);

        // Big HP number (like screenshot shows 100, 120 etc)
        const hpLabel = createTextSprite(hp.toString(), '#ffffff', 1.2);
        hpLabel.position.set(0, 2.2, 0);
        crate.add(hpLabel);

        // Type label above
        const typeLabel = createTextSprite(labels[type], type === 'squad' ? '#44ff88' : type === 'weapon' ? '#ff4444' : '#ffdd44', 0.6);
        typeLabel.position.set(0, 3.0, 0);
        crate.add(typeLabel);

        crate.userData = { hp, maxHp: hp, type, speed: diff.enemySpeed * 0.35, hpLabel };
        scene.add(crate);
        barrels.push(crate);
    }

    function createBullet(fromX, fromZ) {
        const w = WEAPONS[weaponLevel];
        const g = new THREE.Group();
        g.position.set(fromX, 0.7, fromZ);

        // Bright core
        const core = new THREE.Mesh(new THREE.SphereGeometry(w.size, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xffffcc }));
        g.add(core);

        // Colored glow
        const glow = new THREE.Mesh(new THREE.SphereGeometry(w.size * 2.5, 6, 6),
            new THREE.MeshBasicMaterial({ color: w.color, transparent: true, opacity: 0.35 }));
        g.add(glow);

        // Long fiery trail
        const trail = new THREE.Mesh(
            new THREE.CylinderGeometry(w.size * 0.6, 0.02, 1.0, 4),
            new THREE.MeshBasicMaterial({ color: w.color, transparent: true, opacity: 0.6 }));
        trail.rotation.x = Math.PI / 2; trail.position.z = 0.6;
        g.add(trail);

        // Outer trail glow
        const trailGlow = new THREE.Mesh(
            new THREE.CylinderGeometry(w.size * 1.2, 0.05, 0.8, 4),
            new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.15 }));
        trailGlow.rotation.x = Math.PI / 2; trailGlow.position.z = 0.5;
        g.add(trailGlow);

        g.userData = { damage: bulletDamage, life: 2.5 };
        scene.add(g); bullets.push(g);
    }

    function spawnMuzzleFlash(x, z) {
        // Large bright core flash
        const flash = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true, opacity: 0.9 })
        );
        flash.position.set(x, 0.7, z - 0.5);
        flash.userData = { life: 0.08 };
        scene.add(flash);
        muzzleFlashes.push(flash);

        // Outer orange glow
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.6, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.4 })
        );
        glow.position.set(x, 0.7, z - 0.5);
        glow.userData = { life: 0.06 };
        scene.add(glow);
        muzzleFlashes.push(glow);

        // Dynamic muzzle light
        const mLight = new THREE.PointLight(0xff8822, 2.0, 8);
        mLight.position.set(x, 1, z - 0.5);
        mLight.userData = { life: 0.05 };
        scene.add(mLight);
        muzzleFlashes.push(mLight);
    }

    function spawnParticles(x, y, z, color, count) {
        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.12, 0.12),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
            );
            mesh.position.set(x, y, z);
            mesh.userData = {
                vel: new THREE.Vector3((Math.random()-0.5)*5, Math.random()*5+2, (Math.random()-0.5)*5),
                life: 0.5 + Math.random() * 0.4,
            };
            scene.add(mesh); particles.push(mesh);
        }
    }

    function spawnExplosion(x, z) {
        // Big fireball core
        const fireball = new THREE.Mesh(
            new THREE.SphereGeometry(0.8, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.8 })
        );
        fireball.position.set(x, 1.0, z);
        fireball.userData = { vel: new THREE.Vector3(0, 2, 0), life: 0.3 };
        scene.add(fireball); particles.push(fireball);

        // Explosion light
        const eLight = new THREE.PointLight(0xff6600, 3.0, 12);
        eLight.position.set(x, 1.5, z);
        eLight.userData = { life: 0.25 };
        scene.add(eLight); muzzleFlashes.push(eLight);

        // Fire particles — lots of them
        for (let i = 0; i < 25; i++) {
            const colors = [0xff4400, 0xff8800, 0xffcc00, 0xff2200, 0xff6600];
            const c = colors[Math.floor(Math.random() * colors.length)];
            const size = 0.12 + Math.random() * 0.2;
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(size, 5, 5),
                new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1 })
            );
            mesh.position.set(x + (Math.random()-0.5)*0.5, 0.5 + Math.random() * 0.5, z + (Math.random()-0.5)*0.5);
            mesh.userData = {
                vel: new THREE.Vector3((Math.random()-0.5)*6, Math.random()*8+2, (Math.random()-0.5)*6),
                life: 0.3 + Math.random() * 0.6,
            };
            scene.add(mesh); particles.push(mesh);
        }

        // Smoke puffs
        for (let i = 0; i < 8; i++) {
            const smoke = new THREE.Mesh(
                new THREE.SphereGeometry(0.2 + Math.random() * 0.3, 5, 5),
                new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.6 })
            );
            smoke.position.set(x + (Math.random()-0.5), 1 + Math.random(), z + (Math.random()-0.5));
            smoke.userData = {
                vel: new THREE.Vector3((Math.random()-0.5)*2, Math.random()*3+1, (Math.random()-0.5)*2),
                life: 0.5 + Math.random() * 0.8,
            };
            scene.add(smoke); particles.push(smoke);
        }
    }

    function spawnCoinPickup(x, z, amount) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 8), MAT.coin);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(x, 1.5, z);
        mesh.userData = { amount, life: 1.5, vy: 3 };
        scene.add(mesh); coinPickups.push(mesh);
    }

    // ─── Wave System ────────────────────────────────────────────────
    function startWave() {
        wave++;
        const baseCount = 8 + wave * 5 + wave * wave * 1.0;
        const enemyCount = Math.floor(baseCount * diff.spawnRate * pressure);
        const barrelCount = Math.floor((2 + Math.min(wave * 0.6, 5)) * diff.barrelRate);
        waveEnemiesLeft = enemyCount;
        waveEnemiesTotal = enemyCount;
        waveBarrelsLeft = barrelCount;
        spawnTimer = 0; barrelTimer = 0;

        state = 'playing';
        hudEl.style.display = 'flex';
        waveBar.style.display = 'block';
        squadAtWaveStart = squadCount;
        rebuildSquad();
        updateHUD();
        showActionText('WAVE ' + wave, '#ff6b35');
    }

    function clearEntities() {
        enemies.forEach(e => scene.remove(e));
        barrels.forEach(b => scene.remove(b));
        bullets.forEach(b => scene.remove(b));
        particles.forEach(p => scene.remove(p));
        coinPickups.forEach(c => scene.remove(c));
        muzzleFlashes.forEach(m => scene.remove(m));
        squad.forEach(s => scene.remove(s));
        enemies=[]; barrels=[]; bullets=[]; particles=[]; coinPickups=[]; muzzleFlashes=[]; squad=[];
    }

    // ─── Upgrades ───────────────────────────────────────────────────
    const UPGRADE_DEFS = [
        {
            id: 'weapon', name: 'Weapon Upgrade',
            maxLevel: WEAPONS.length - 1,
            cost: lvl => 10 + lvl * 15,
            apply: lvl => { weaponLevel = lvl; applyWeapon(); },
            desc: lvl => `${WEAPONS[lvl].name} → ${WEAPONS[lvl+1].name}`,
        },
        {
            id: 'squad', name: 'Extra Shooter',
            maxLevel: 8,
            cost: lvl => 8 + lvl * 8,
            apply: lvl => { squadCount = 1 + lvl; },
            desc: lvl => `${1+lvl} → ${2+lvl} shooters`,
        },
    ];

    function applyWeapon() {
        const w = WEAPONS[weaponLevel];
        bulletDamage = w.damage;
        fireRate = w.fireRate;
    }

    function showUpgradeShop() {
        // Adaptive difficulty
        const lost = squadAtWaveStart - squadCount;
        if (lost === 0 && squadCount >= 3) pressure = Math.min(pressure + 0.25, 3.0);
        else if (lost === 0) pressure = Math.min(pressure + 0.1, 3.0);
        else if (lost >= 2) pressure = Math.max(pressure - 0.15, 0.6);

        state = 'waveclear';
        wsWave.textContent = wave;
        wsCoins.textContent = coins;
        waveScreen.classList.remove('hidden');
        waveScreen.classList.add('active');
        hudEl.style.display = 'none';
        waveBar.style.display = 'none';

        upgradeButtons.innerHTML = '';
        UPGRADE_DEFS.forEach(def => {
            const lvl = upgrades[def.id];
            const maxed = lvl >= def.maxLevel;
            const cost = def.cost(lvl);
            const btn = document.createElement('button');
            btn.className = 'upgrade-btn' + (maxed ? ' maxed' : '');
            btn.innerHTML = `${def.name}<br><small>${maxed ? 'MAXED' : def.desc(lvl)}</small><span class="cost">${maxed ? '' : cost + ' coins'}</span>`;
            if (!maxed && coins >= cost) {
                btn.addEventListener('click', () => {
                    coins -= cost; upgrades[def.id]++;
                    def.apply(upgrades[def.id]);
                    SFX.upgrade();
                    showUpgradeShop();
                });
            } else if (!maxed) btn.style.opacity = '0.5';
            upgradeButtons.appendChild(btn);
        });
    }

    // ─── Effects ────────────────────────────────────────────────────
    function shake(amt) { shakeAmount = Math.max(shakeAmount, amt); }
    function showActionText(text, color) {
        actionText.textContent = text;
        actionText.style.color = color || '#fff';
        actionText.classList.add('show');
        setTimeout(() => actionText.classList.remove('show'), 1200);
    }
    function updateHUD() {
        waveDisplay.textContent = wave;
        squadDisplay.textContent = squadCount;
        coinDisplay.textContent = coins;
        weaponDisplay.textContent = WEAPONS[weaponLevel].name;
    }

    function applyBarrelReward(type, x, z) {
        switch (type) {
            case 'weapon':
                if (weaponLevel < WEAPONS.length - 1) {
                    weaponLevel++; applyWeapon(); rebuildSquad();
                    showActionText(WEAPONS[weaponLevel].name.toUpperCase() + '!', '#ff4444');
                } else {
                    const a = Math.ceil((8 + wave * 3) * diff.coins);
                    coins += a; spawnCoinPickup(x, z, a);
                    showActionText('+' + a + ' COINS', '#ffdd44');
                }
                break;
            case 'squad':
                squadCount++; upgrades.squad++; rebuildSquad();
                showActionText('+1 ALLY!', '#44ff88');
                break;
            case 'coins':
                const amount = Math.ceil((5 + wave * 2) * diff.coins);
                coins += amount; spawnCoinPickup(x, z, amount);
                showActionText('+' + amount + ' COINS', '#ffdd44');
                break;
        }
        shake(0.3); SFX.upgrade();
    }

    // ─── Ambient Fire ───────────────────────────────────────────────
    let ambientFireTimer = 0;
    function spawnAmbientFire(dt) {
        ambientFireTimer += dt;
        if (ambientFireTimer < 0.15) return;
        ambientFireTimer = 0;

        // Embers floating up from the battlefield
        const colors = [0xff4400, 0xff6600, 0xff8800, 0xffaa00];
        for (let i = 0; i < 2; i++) {
            const ember = new THREE.Mesh(
                new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 4, 4),
                new THREE.MeshBasicMaterial({ color: colors[Math.floor(Math.random() * colors.length)], transparent: true, opacity: 0.8 })
            );
            ember.position.set(
                (Math.random() - 0.5) * ROAD_W,
                Math.random() * 0.5,
                -5 - Math.random() * 40
            );
            ember.userData = {
                vel: new THREE.Vector3((Math.random()-0.5)*0.5, 1.5 + Math.random()*2, (Math.random()-0.5)*0.3),
                life: 1.0 + Math.random() * 1.5,
            };
            scene.add(ember); particles.push(ember);
        }
    }

    // ─── Main Update ────────────────────────────────────────────────
    function update(dt) {
        if (state !== 'playing') return;
        const time = Date.now() * 0.001;
        spawnAmbientFire(dt);

        // Spawn enemies
        const spawnInt = Math.max(0.25, 2.0 - wave * 0.15) / diff.spawnRate;
        spawnTimer += dt;
        if (waveEnemiesLeft > 0 && spawnTimer >= spawnInt) {
            spawnTimer = 0;
            const hp = Math.ceil((1 + wave * 0.8 + Math.random() * wave * 0.5) * diff.enemyHP * (0.7 + pressure * 0.3));
            spawnEnemy(SPAWN_Z_MIN + Math.random() * (SPAWN_Z_MAX - SPAWN_Z_MIN), hp);
            waveEnemiesLeft--;
        }

        // Spawn barrels
        const bInt = Math.max(1.5, 4 - wave * 0.15) / diff.barrelRate;
        barrelTimer += dt;
        if (waveBarrelsLeft > 0 && barrelTimer >= bInt) {
            barrelTimer = 0;
            spawnBarrel(SPAWN_Z_MIN + Math.random() * 5);
            waveBarrelsLeft--;
        }

        // Move enemy hordes
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            e.position.z += e.userData.speed * dt;
            e.position.x += Math.sin(time * 1.5 + e.userData.wobble) * 0.2 * dt;
            e.position.x = Math.max(-ROAD_W/2+1, Math.min(ROAD_W/2-1, e.position.x));

            // Animate zombies
            for (const z of e.userData.zombies) {
                const p = z.userData.phase;
                z.position.y = Math.abs(Math.sin(time * 3 + p)) * 0.08;
                // Shambling walk
                if (z.userData.legL) {
                    z.userData.legL.rotation.x = Math.sin(time * 4 + p) * 0.4;
                    z.userData.legR.rotation.x = -Math.sin(time * 4 + p) * 0.4;
                    z.userData.armL.rotation.x = -1.2 + Math.sin(time * 2 + p) * 0.2;
                    z.userData.armR.rotation.x = -1.0 + Math.sin(time * 2.5 + p + 1) * 0.2;
                }
            }

            // Reached defense line
            if (e.position.z >= DEFENSE_Z) {
                const rem = e.userData.hp;
                for (let k = 0; k < rem && squad.length > 0; k++) {
                    const lost = squad.pop();
                    spawnParticles(lost.position.x, 0.5, lost.position.z, 0x556B2F, 8);
                    scene.remove(lost);
                    squadCount = Math.max(0, squadCount - 1);
                    upgrades.squad = Math.max(0, upgrades.squad - 1);
                }
                shake(0.6);
                scene.remove(e); enemies.splice(i, 1);
                spawnExplosion(e.position.x, DEFENSE_Z);
                if (squadCount <= 0) { doGameOver(); return; }
            }
        }

        // Move barrels/crates
        for (let i = barrels.length - 1; i >= 0; i--) {
            const b = barrels[i];
            b.position.z += b.userData.speed * dt;
            if (b.position.z >= DEFENSE_Z + 5) { scene.remove(b); barrels.splice(i, 1); }
        }

        // Auto-fire (always shooting)
        fireCooldown -= dt;
        if (fireCooldown <= 0) {
            for (const s of squad) {
                createBullet(s.position.x, s.position.z);
                spawnMuzzleFlash(s.position.x, s.position.z);
            }
            fireCooldown = 1 / fireRate;
            SFX.shoot();
        }

        // Move bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.position.z -= bulletSpeed * dt;
            b.userData.life -= dt;
            if (b.userData.life <= 0 || b.position.z < SPAWN_Z_MIN - 10) {
                scene.remove(b); bullets.splice(i, 1); continue;
            }

            // Hit enemies
            let hit = false;
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j];
                const dx = Math.abs(b.position.x - e.position.x);
                const dz = Math.abs(b.position.z - e.position.z);
                const hr = 0.8 + e.userData.zombies.length * 0.05;
                if (dx < hr && dz < hr) {
                    const kills = Math.min(b.userData.damage, e.userData.hp);
                    e.userData.hp -= kills;
                    SFX.hit();

                    for (let k = 0; k < kills && e.userData.zombies.length > 0; k++) {
                        const dead = e.userData.zombies.pop();
                        spawnParticles(e.position.x + dead.position.x, 0.5, e.position.z + dead.position.z, 0x779966, 4);
                        e.remove(dead);
                    }

                    if (e.userData.hp <= 0) {
                        const reward = Math.ceil(e.userData.maxHp * 0.3 * diff.coins);
                        coins += reward; score += e.userData.maxHp;
                        spawnCoinPickup(e.position.x, e.position.z, reward);
                        spawnExplosion(e.position.x, e.position.z);
                        SFX.enemyDie();
                        scene.remove(e); enemies.splice(j, 1);
                    }

                    scene.remove(b); bullets.splice(i, 1); hit = true; break;
                }
            }
            if (hit) continue;

            // Hit barrels
            for (let j = barrels.length - 1; j >= 0; j--) {
                const br = barrels[j];
                const dx = Math.abs(b.position.x - br.position.x);
                const dz = Math.abs(b.position.z - br.position.z);
                if (dx < 0.8 && dz < 0.8) {
                    br.userData.hp -= b.userData.damage;
                    SFX.hit();
                    if (br.userData.hp > 0) {
                        updateSpriteText(br.userData.hpLabel, br.userData.hp.toString(), '#ffffff');
                    } else {
                        applyBarrelReward(br.userData.type, br.position.x, br.position.z);
                        spawnExplosion(br.position.x, br.position.z);
                        SFX.barrelBreak();
                        scene.remove(br); barrels.splice(j, 1); score += 10;
                    }
                    scene.remove(b); bullets.splice(i, 1); break;
                }
            }
        }

        // Squad animation
        squad.forEach(s => {
            s.position.x = aimX + s.userData.offsetX;
            s.children.forEach(c => {
                if (c.position && c.userData && c.userData.phase !== undefined) return;
            });
        });

        // Muzzle flashes & temp lights
        for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
            const m = muzzleFlashes[i];
            m.userData.life -= dt;
            if (m.scale) m.scale.setScalar(1 + (0.08 - m.userData.life) * 12);
            if (m.intensity !== undefined) m.intensity *= 0.85; // fade lights
            if (m.userData.life <= 0) { scene.remove(m); muzzleFlashes.splice(i, 1); }
        }

        // Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.position.add(p.userData.vel.clone().multiplyScalar(dt));
            p.userData.vel.y -= 10 * dt;
            p.userData.vel.multiplyScalar(0.98); // air drag
            p.userData.life -= dt;
            p.material.opacity = Math.max(0, p.userData.life * 2);
            // Fire/smoke grows as it fades
            const scale = 1 + (1 - p.userData.life) * 1.5;
            p.scale.setScalar(scale);
            if (p.userData.life <= 0) { scene.remove(p); particles.splice(i, 1); }
        }

        // Coin pickups
        for (let i = coinPickups.length - 1; i >= 0; i--) {
            const c = coinPickups[i];
            c.position.y += c.userData.vy * dt;
            c.userData.vy -= 8 * dt;
            c.rotation.y += dt * 5;
            c.userData.life -= dt;
            if (c.userData.life <= 0) { scene.remove(c); coinPickups.splice(i, 1); SFX.coin(); }
        }

        // Camera shake
        if (shakeAmount > 0.01) {
            camera.position.x = (Math.random()-0.5) * shakeAmount * 2;
            camera.position.y = 5.5 + (Math.random()-0.5) * shakeAmount;
            shakeAmount *= 0.88;
        } else {
            camera.position.x = 0; camera.position.y = 5.5; shakeAmount = 0;
        }

        // Wave progress
        const killed = waveEnemiesTotal - waveEnemiesLeft - enemies.length;
        waveBarFill.style.width = (waveEnemiesTotal > 0 ? killed / waveEnemiesTotal * 100 : 100) + '%';
        updateHUD();

        // Wave complete
        if (waveEnemiesLeft <= 0 && enemies.length === 0) {
            SFX.waveClear(); showUpgradeShop();
        }
    }

    // ─── Game Flow ──────────────────────────────────────────────────
    function startGame() {
        clearEntities();
        wave = 0; score = 0; coins = 0;
        squadCount = 1; weaponLevel = 0;
        bulletSpeed = 35; pressure = 1.0;
        upgrades = { weapon: 0, squad: 0 };
        applyWeapon();
        startScreen.classList.add('hidden'); startScreen.classList.remove('active');
        gameoverScreen.classList.add('hidden'); gameoverScreen.classList.remove('active');
        waveScreen.classList.add('hidden'); waveScreen.classList.remove('active');
        startWave();
    }

    function nextWave() {
        clearEntities();
        waveScreen.classList.add('hidden'); waveScreen.classList.remove('active');
        startWave();
    }

    function doGameOver() {
        state = 'gameover'; SFX.gameOver();
        hudEl.style.display = 'none'; waveBar.style.display = 'none';
        goTitle.textContent = 'OVERRUN'; goTitle.className = 'lose';
        goWave.textContent = wave; goScore.textContent = score;
        gameoverScreen.classList.remove('hidden'); gameoverScreen.classList.add('active');
    }

    // ─── Input ──────────────────────────────────────────────────────
    let dragging = false, lastPointerX = 0;
    function onDown(x) { dragging = true; lastPointerX = x; ensureAudio(); }
    function onMove(x) {
        if (!dragging) return;
        const dx = x - lastPointerX; lastPointerX = x;
        aimX = Math.max(-ROAD_W/2+1, Math.min(ROAD_W/2-1, aimX + dx * 0.035));
    }
    function onUp() { dragging = false; }

    document.addEventListener('mousedown', e => onDown(e.clientX));
    document.addEventListener('mousemove', e => onMove(e.clientX));
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchstart', e => { e.preventDefault(); onDown(e.touches[0].clientX); }, { passive: false });
    document.addEventListener('touchmove', e => { e.preventDefault(); onMove(e.touches[0].clientX); }, { passive: false });
    document.addEventListener('touchend', onUp);

    const keys = {};
    document.addEventListener('keydown', e => { keys[e.key] = true; });
    document.addEventListener('keyup', e => { keys[e.key] = false; });

    // ─── Render Loop ────────────────────────────────────────────────
    let lastTime = 0;
    function loop(ts) {
        const dt = Math.min((ts - (lastTime || ts)) / 1000, 0.05);
        lastTime = ts;
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) aimX = Math.max(-ROAD_W/2+1, aimX - 8*dt);
        if (keys['ArrowRight'] || keys['d'] || keys['D']) aimX = Math.min(ROAD_W/2-1, aimX + 8*dt);
        update(dt);
        renderer.render(scene, camera);
        requestAnimationFrame(loop);
    }

    // ─── Init ───────────────────────────────────────────────────────
    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-retry').addEventListener('click', startGame);
    document.getElementById('btn-next').addEventListener('click', nextWave);

    initRenderer();
    initEnvironment();
    requestAnimationFrame(loop);
})();
