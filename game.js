// Barrel Defense — LastTokens
// Shoot barrels for upgrades. Shoot enemies to survive. The game from the fake ads — made real.

(function () {
    'use strict';

    // ─── Three.js Setup ─────────────────────────────────────────────
    let scene, camera, renderer, composer;
    let pLight, pLight2, rimLight, ambientLight;
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    function initRenderer() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1520);
        scene.fog = new THREE.FogExp2(0x1a1520, 0.015);

        // High-angle camera ~45° looking down (like the reference)
        camera = new THREE.PerspectiveCamera(50, W() / H(), 0.1, 200);
        camera.position.set(0, 14, 10);
        camera.lookAt(0, 0, -5);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(W(), H());
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        document.body.insertBefore(renderer.domElement, document.body.firstChild);

        // Bloom post-processing
        try {
            if (THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass) {
                composer = new THREE.EffectComposer(renderer);
                composer.addPass(new THREE.RenderPass(scene, camera));
                const bloomPass = new THREE.UnrealBloomPass(
                    new THREE.Vector2(W(), H()), 0.6, 0.4, 0.82
                );
                composer.addPass(bloomPass);
            }
        } catch (e) {
            console.warn('Bloom unavailable:', e);
            composer = null;
        }

        // Cool ambient — darker for more contrast
        ambientLight = new THREE.AmbientLight(0x556677, 0.4);
        scene.add(ambientLight);

        // Hemisphere light — warm ground, cool sky
        scene.add(new THREE.HemisphereLight(0x334466, 0x443322, 0.3));

        // Warm directional (moon/fire light from above)
        const sun = new THREE.DirectionalLight(0xffeedd, 0.5);
        sun.position.set(5, 20, 10);
        sun.castShadow = true;
        sun.shadow.camera.left = -20;
        sun.shadow.camera.right = 20;
        sun.shadow.camera.top = 40;
        sun.shadow.camera.bottom = -10;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        scene.add(sun);

        // Warm fire glow at player area
        pLight = new THREE.PointLight(0xff8844, 1.2, 30);
        pLight.position.set(0, 3, 4);
        scene.add(pLight);

        // Fire glow mid-field
        pLight2 = new THREE.PointLight(0xff6622, 0.8, 25);
        pLight2.position.set(0, 2, -8);
        scene.add(pLight2);

        // Rim light from behind enemies — dramatic silhouettes
        rimLight = new THREE.DirectionalLight(0xff4422, 0.35);
        rimLight.position.set(0, 5, -35);
        rimLight.target.position.set(0, 0, 0);
        scene.add(rimLight);
        scene.add(rimLight.target);

        window.addEventListener('resize', () => {
            camera.aspect = W() / H();
            camera.updateProjectionMatrix();
            renderer.setSize(W(), H());
            if (composer) composer.setSize(W(), H());
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
        soldierBody: new THREE.MeshStandardMaterial({ color: 0xBB8833 }),
        soldierPants: new THREE.MeshStandardMaterial({ color: 0x886633 }),
        soldierBoots: new THREE.MeshStandardMaterial({ color: 0x444444 }),
        soldierVest: new THREE.MeshStandardMaterial({ color: 0xCC9944 }),
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
        selCircle: new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6 }),
    };

    // ─── Difficulty ─────────────────────────────────────────────────
    const DIFF = {
        easy:   { enemySpeed: 1.2, enemyHP: 0.4, spawnRate: 0.5, barrelRate: 1.5, coins: 1.5 },
        normal: { enemySpeed: 1.3, enemyHP: 0.5, spawnRate: 0.5, barrelRate: 1.2, coins: 1.0 },
        hard:   { enemySpeed: 2.2, enemyHP: 1.0, spawnRate: 1.0, barrelRate: 0.8, coins: 0.7 },
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
        { name: 'Pistol',      damage: 2, fireRate: 4.0, color: 0xffee44, size: 0.12 },
        { name: 'SMG',         damage: 1, fireRate: 7.0, color: 0xffaa22, size: 0.12 },
        { name: 'Shotgun',     damage: 3, fireRate: 3.0, color: 0xff8822, size: 0.15 },
        { name: 'Machine Gun', damage: 2, fireRate: 10,  color: 0xff5500, size: 0.14 },
        { name: 'Minigun',     damage: 4, fireRate: 15,  color: 0xff2200, size: 0.16 },
    ];

    // ─── Game State ─────────────────────────────────────────────────
    let state = 'menu';
    let wave = 0, score = 0, coins = 0;
    let squadCount = 1, weaponLevel = 0;
    let bulletDamage = 1, fireRate = 2.5, bulletSpeed = 22;
    let pressure = 1.0, squadAtWaveStart = 1;
    let upgrades = { weapon: 0, squad: 0 };

    let squad = [], enemies = [], barrels = [], bullets = [], particles = [];
    let coinPickups = [];
    let damageNums = [];
    let aimX = 0, fireCooldown = 0, shakeAmount = 0;
    let waveEnemiesLeft = 0, waveEnemiesTotal = 0, waveBarrelsLeft = 0;
    let spawnTimer = 0, barrelTimer = 0;
    let muzzleFlashes = [];
    let freezeTimer = 0;
    let comboCount = 0, comboTimer = 0;
    const WHITE_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dangerVignette = document.getElementById('danger-vignette');

    const ROAD_W = 10;
    const DEFENSE_Z = 2;
    const SPAWN_Z_MIN = -40;
    const SPAWN_Z_MAX = -22;

    // ─── Road / Environment ─────────────────────────────────────────
    let envMeshes = [];

    // Procedural canvas texture helper
    function makeCanvasTexture(w, h, drawFn) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        drawFn(ctx, w, h);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    let fireLights = []; // for flickering animation

    function initEnvironment() {
        envMeshes.forEach(m => scene.remove(m));
        envMeshes = [];
        fireLights = [];

        // ── Sky dome — gradient from dark navy to warm horizon ──
        const skyGeo = new THREE.SphereGeometry(90, 16, 12);
        const skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {},
            vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
            fragmentShader: `varying vec3 vPos;
                void main(){
                    float h = normalize(vPos).y;
                    vec3 top = vec3(0.04, 0.03, 0.08);
                    vec3 mid = vec3(0.12, 0.06, 0.04);
                    vec3 bot = vec3(0.25, 0.08, 0.02);
                    vec3 col = h > 0.0 ? mix(mid, top, h) : mix(mid, bot, -h * 2.0);
                    gl_FragColor = vec4(col, 1.0);
                }`
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        scene.add(sky); envMeshes.push(sky);

        // ── Road with procedural asphalt texture ──
        const roadTex = makeCanvasTexture(256, 512, (ctx, w, h) => {
            ctx.fillStyle = '#3a3230';
            ctx.fillRect(0, 0, w, h);
            // Noise grain
            for (let i = 0; i < 3000; i++) {
                const v = 40 + Math.random() * 30;
                ctx.fillStyle = `rgb(${v},${v-5},${v-8})`;
                ctx.fillRect(Math.random()*w, Math.random()*h, 2, 2);
            }
            // Cracks
            ctx.strokeStyle = '#2a2520';
            ctx.lineWidth = 1;
            for (let i = 0; i < 8; i++) {
                ctx.beginPath();
                let cx = Math.random() * w, cy = Math.random() * h;
                ctx.moveTo(cx, cy);
                for (let j = 0; j < 5; j++) {
                    cx += (Math.random()-0.5) * 40;
                    cy += Math.random() * 30;
                    ctx.lineTo(cx, cy);
                }
                ctx.stroke();
            }
            // Oil stains
            for (let i = 0; i < 4; i++) {
                ctx.fillStyle = 'rgba(30,25,20,0.4)';
                ctx.beginPath();
                ctx.arc(Math.random()*w, Math.random()*h, 10+Math.random()*20, 0, Math.PI*2);
                ctx.fill();
            }
        });
        roadTex.repeat.set(1, 8);

        const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 100),
            new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95, color: 0xcccccc }));
        road.rotation.x = -Math.PI / 2;
        road.position.set(0, -0.01, -25);
        road.receiveShadow = true;
        scene.add(road); envMeshes.push(road);

        // ── Road center dashes ──
        const dashMat = new THREE.MeshBasicMaterial({ color: 0x888877 });
        for (let z = 5; z > -55; z -= 3) {
            const dash = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 1.2), dashMat);
            dash.position.set(0, 0.01, z);
            scene.add(dash); envMeshes.push(dash);
        }

        // Road edge lines
        for (const side of [-1, 1]) {
            const line = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 100),
                new THREE.MeshBasicMaterial({ color: 0xaaaa88 }));
            line.rotation.x = -Math.PI / 2;
            line.position.set(side * (ROAD_W / 2 - 0.3), 0.01, -25);
            scene.add(line); envMeshes.push(line);
        }

        // ── Side barriers — concrete jersey walls ──
        const wallTex = makeCanvasTexture(128, 64, (ctx, w, h) => {
            ctx.fillStyle = '#555550';
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 500; i++) {
                const v = 70 + Math.random() * 30;
                ctx.fillStyle = `rgb(${v},${v},${v-5})`;
                ctx.fillRect(Math.random()*w, Math.random()*h, 2, 2);
            }
            // Horizontal joints
            ctx.strokeStyle = '#444440';
            for (let y = 16; y < h; y += 16) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
            }
        });
        const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
        for (const side of [-1, 1]) {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 100), wallMat);
            wall.position.set(side * (ROAD_W / 2 + 0.4), 0.35, -25);
            wall.castShadow = true;
            scene.add(wall); envMeshes.push(wall);

            // Outer ground (dirt)
            const dirtTex = makeCanvasTexture(128, 128, (ctx, w, h) => {
                ctx.fillStyle = '#332820';
                ctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 1000; i++) {
                    const v = 30 + Math.random() * 25;
                    ctx.fillStyle = `rgb(${v+10},${v},${v-5})`;
                    ctx.fillRect(Math.random()*w, Math.random()*h, 3, 3);
                }
            });
            dirtTex.repeat.set(3, 10);
            const gnd = new THREE.Mesh(new THREE.PlaneGeometry(25, 100),
                new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1.0, color: 0xbbbbbb }));
            gnd.rotation.x = -Math.PI / 2;
            gnd.position.set(side * 18, -0.05, -25);
            scene.add(gnd); envMeshes.push(gnd);
        }

        // ── Building silhouettes ──
        const buildingMat = new THREE.MeshStandardMaterial({ color: 0x151518, roughness: 1.0 });
        const windowMat = new THREE.MeshBasicMaterial({ color: 0xff9944, transparent: true, opacity: 0.6 });
        for (const side of [-1, 1]) {
            for (let i = 0; i < 10; i++) {
                const bw = 2 + Math.random() * 4;
                const bh = 4 + Math.random() * 10;
                const bd = 2 + Math.random() * 4;
                const bx = side * (ROAD_W / 2 + 3 + Math.random() * 12);
                const bz = 5 - i * 6 - Math.random() * 3;
                const building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), buildingMat);
                building.position.set(bx, bh / 2, bz);
                building.castShadow = true;
                scene.add(building); envMeshes.push(building);

                // Lit windows (sparse)
                if (Math.random() < 0.5) {
                    const winCount = Math.floor(1 + Math.random() * 3);
                    for (let w = 0; w < winCount; w++) {
                        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), windowMat);
                        win.position.set(
                            bx + (side > 0 ? -bw/2 - 0.01 : bw/2 + 0.01),
                            2 + Math.random() * (bh - 3),
                            bz + (Math.random() - 0.5) * (bd - 1)
                        );
                        win.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
                        scene.add(win); envMeshes.push(win);
                    }
                }

                // Some buildings have damaged tops (angled box)
                if (Math.random() < 0.3) {
                    const dmg = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.6, bh * 0.2, bd * 0.7), buildingMat);
                    dmg.position.set(bx + (Math.random()-0.5)*1, bh + bh*0.05, bz);
                    dmg.rotation.z = (Math.random()-0.5) * 0.4;
                    scene.add(dmg); envMeshes.push(dmg);
                }
            }
        }

        // ── Scattered rubble/debris on road ──
        const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x665544, roughness: 0.9 });
        for (let i = 0; i < 25; i++) {
            const s = 0.08 + Math.random() * 0.2;
            const rubble = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.4, s * (0.8+Math.random()*0.4)), rubbleMat);
            rubble.position.set(
                (Math.random() - 0.5) * ROAD_W * 0.8,
                s * 0.2,
                -3 - Math.random() * 50
            );
            rubble.rotation.y = Math.random() * Math.PI;
            rubble.rotation.z = (Math.random()-0.5) * 0.2;
            scene.add(rubble); envMeshes.push(rubble);
        }

        // ── Ground fires with flickering lights ──
        for (let i = 0; i < 8; i++) {
            const fx = (Math.random() - 0.5) * ROAD_W * 0.6;
            const fz = -2 - Math.random() * 30;
            const fLight = new THREE.PointLight(0xff6622, 0.5, 6);
            fLight.position.set(fx, 0.4, fz);
            fLight.userData = { baseIntensity: 0.3 + Math.random() * 0.4, phase: Math.random() * 10 };
            scene.add(fLight); envMeshes.push(fLight);
            fireLights.push(fLight);

            // Visible fire meshes at fire light positions
            for (let j = 0; j < 3; j++) {
                const flame = new THREE.Mesh(
                    new THREE.ConeGeometry(0.15 + Math.random()*0.1, 0.4 + Math.random()*0.3, 4),
                    new THREE.MeshBasicMaterial({ color: j === 0 ? 0xff6622 : 0xff9944, transparent: true, opacity: 0.7 })
                );
                flame.position.set(fx + (Math.random()-0.5)*0.3, 0.2, fz + (Math.random()-0.5)*0.3);
                flame.userData = { isFlame: true, baseY: 0.2, phase: Math.random() * 10 };
                scene.add(flame); envMeshes.push(flame);
            }
        }

        // ── Distant smoke columns ──
        for (let i = 0; i < 3; i++) {
            const sx = (Math.random()-0.5) * 40;
            const sz = -30 - Math.random() * 20;
            const smoke = new THREE.Mesh(
                new THREE.CylinderGeometry(0.3, 0.8, 15, 6),
                new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.15 })
            );
            smoke.position.set(sx, 10, sz);
            scene.add(smoke); envMeshes.push(smoke);
        }

        // ── Ambient floating dust particles (static decorative) ──
        const dustMat = new THREE.MeshBasicMaterial({ color: 0xaa9977, transparent: true, opacity: 0.3 });
        for (let i = 0; i < 40; i++) {
            const dust = new THREE.Mesh(new THREE.SphereGeometry(0.03, 3, 3), dustMat);
            dust.position.set(
                (Math.random()-0.5) * ROAD_W * 1.5,
                0.5 + Math.random() * 3,
                (Math.random()-0.5) * 50
            );
            dust.userData = { isDust: true, baseX: dust.position.x, baseY: dust.position.y, phase: Math.random() * 20 };
            scene.add(dust); envMeshes.push(dust);
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
        const bootGeo = new THREE.BoxGeometry(0.18, 0.14, 0.28);
        const bootL = new THREE.Mesh(bootGeo, MAT.soldierBoots);
        bootL.position.set(-0.15, 0.06, 0.02); g.add(bootL);
        const bootR = new THREE.Mesh(bootGeo, MAT.soldierBoots);
        bootR.position.set(0.15, 0.06, 0.02); g.add(bootR);

        // Knee pads
        const kneeMat = new THREE.MeshStandardMaterial({ color: 0x556633 });
        const kneeGeo = new THREE.BoxGeometry(0.1, 0.08, 0.08);
        addPart(g, kneeGeo, kneeMat, -0.15, 0.35, -0.08);
        addPart(g, kneeGeo, kneeMat, 0.15, 0.35, -0.08);

        // Torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3), MAT.soldierBody);
        torso.position.y = 0.75; g.add(torso);

        // Vest/armor with pockets
        const vest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.38, 0.34), MAT.soldierVest);
        vest.position.y = 0.8; g.add(vest);

        // Ammo pouches on vest
        const pouchMat = new THREE.MeshStandardMaterial({ color: 0x7a6633 });
        addPart(g, new THREE.BoxGeometry(0.1, 0.08, 0.06), pouchMat, -0.18, 0.68, -0.18);
        addPart(g, new THREE.BoxGeometry(0.1, 0.08, 0.06), pouchMat, 0.18, 0.68, -0.18);

        // Belt
        const beltMat = new THREE.MeshStandardMaterial({ color: 0x443322 });
        addPart(g, new THREE.BoxGeometry(0.54, 0.05, 0.35), beltMat, 0, 0.55, 0);

        // Shoulder pads
        const shoulderGeo = new THREE.SphereGeometry(0.1, 5, 5);
        addPart(g, shoulderGeo, MAT.soldierVest, -0.3, 0.92, 0);
        addPart(g, shoulderGeo, MAT.soldierVest, 0.3, 0.92, 0);

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

        // Neck
        addPart(g, new THREE.CylinderGeometry(0.07, 0.07, 0.1, 6), MAT.skin, 0, 1.03, 0);

        // Head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), MAT.skin);
        head.position.y = 1.15; g.add(head);

        // Helmet (military style with rim)
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), MAT.soldierVest);
        helmet.position.y = 1.2; helmet.scale.set(1.05, 0.75, 1.1); g.add(helmet);
        // Helmet rim
        addPart(g, new THREE.CylinderGeometry(0.22, 0.22, 0.03, 10), MAT.soldierVest, 0, 1.14, -0.02);

        // Visor (dark strip across face)
        const visorMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5 });
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, 0.04), visorMat);
        visor.position.set(0, 1.13, -0.17); g.add(visor);

        // Backpack
        addPart(g, new THREE.BoxGeometry(0.3, 0.25, 0.15), MAT.soldierVest, 0, 0.82, 0.2);

        // Cyan selection circle under feet (like reference)
        const circle = new THREE.Mesh(
            new THREE.RingGeometry(0.35, 0.5, 20),
            MAT.selCircle
        );
        circle.rotation.x = -Math.PI / 2;
        circle.position.y = 0.02;
        g.add(circle);

        // Inner filled circle glow
        const circleFill = new THREE.Mesh(
            new THREE.CircleGeometry(0.35, 20),
            new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.15 })
        );
        circleFill.rotation.x = -Math.PI / 2;
        circleFill.position.y = 0.01;
        g.add(circleFill);

        return g;
    }

    function addPart(group, geo, mat, x, y, z) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        group.add(m);
        return m;
    }

    function createWeaponMesh(level) {
        const g = new THREE.Group();
        switch (level) {
            case 0: // Pistol
                addPart(g, new THREE.BoxGeometry(0.08, 0.12, 0.25), MAT.gun, 0, 0, 0);
                addPart(g, new THREE.CylinderGeometry(0.025, 0.025, 0.15, 4), MAT.gun, 0, 0.03, -0.18).rotation.x = Math.PI / 2;
                break;
            case 1: // SMG
                addPart(g, new THREE.BoxGeometry(0.09, 0.12, 0.35), MAT.gun, 0, 0, 0);
                addPart(g, new THREE.CylinderGeometry(0.025, 0.025, 0.2, 4), MAT.gun, 0, 0.03, -0.25).rotation.x = Math.PI / 2;
                addPart(g, new THREE.BoxGeometry(0.06, 0.15, 0.05), MAT.gun, 0, -0.1, 0.05);
                break;
            case 2: // Shotgun
                addPart(g, new THREE.BoxGeometry(0.1, 0.1, 0.5), MAT.gun, 0, 0, 0);
                addPart(g, new THREE.CylinderGeometry(0.04, 0.04, 0.25, 6), MAT.gun, 0, 0.02, -0.35).rotation.x = Math.PI / 2;
                addPart(g, new THREE.BoxGeometry(0.12, 0.08, 0.1), MAT.gunAccent, 0, -0.05, -0.05);
                break;
            case 3: // Machine Gun
                addPart(g, new THREE.BoxGeometry(0.12, 0.12, 0.55), MAT.gun, 0, 0, 0);
                addPart(g, new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6), MAT.gun, 0, 0.03, -0.4).rotation.x = Math.PI / 2;
                addPart(g, new THREE.BoxGeometry(0.1, 0.12, 0.12), MAT.gunAccent, 0, -0.08, 0.12);
                break;
            case 4: // Minigun
                addPart(g, new THREE.BoxGeometry(0.15, 0.15, 0.45), MAT.gun, 0, 0, 0);
                for (let i = 0; i < 4; i++) {
                    const a = (i / 4) * Math.PI * 2;
                    addPart(g, new THREE.CylinderGeometry(0.02, 0.02, 0.35, 4), MAT.gun,
                        Math.cos(a) * 0.04, Math.sin(a) * 0.04 + 0.02, -0.38).rotation.x = Math.PI / 2;
                }
                addPart(g, new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), MAT.gunAccent, 0, -0.1, 0.08);
                break;
        }
        return g;
    }

    function createZombie() {
        const g = new THREE.Group();
        const variant = Math.floor(Math.random() * 3); // 3 visual variants

        // Legs (slightly asymmetric for shambling look)
        const legGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.5, 5);
        const legL = new THREE.Mesh(legGeo, MAT.zombieDark);
        legL.position.set(-0.12, 0.25, 0); g.add(legL);
        const legR = new THREE.Mesh(legGeo, MAT.zombieDark);
        legR.position.set(0.12, 0.25, 0); g.add(legR);

        // Feet (bare or wrapped)
        if (variant !== 2) {
            const footMat = variant === 0 ? MAT.zombieSkin : MAT.zombieDark;
            addPart(g, new THREE.BoxGeometry(0.13, 0.06, 0.18), footMat, -0.12, 0.03, 0.02);
            addPart(g, new THREE.BoxGeometry(0.13, 0.06, 0.18), footMat, 0.12, 0.03, 0.02);
        }

        // Torso (hunched forward)
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.25), MAT.zombieClothes);
        torso.position.set(0, 0.7, -0.03);
        torso.rotation.x = 0.15; // hunched
        g.add(torso);

        // Exposed ribs on one variant
        if (variant === 1) {
            const boneMat = new THREE.MeshStandardMaterial({ color: 0xddccaa });
            for (let i = 0; i < 3; i++) {
                addPart(g, new THREE.CylinderGeometry(0.015, 0.015, 0.12, 3), boneMat,
                    -0.2, 0.62 + i * 0.08, -0.05).rotation.z = Math.PI / 2;
            }
        }

        // Tattered cloth strips hanging off torso
        if (variant === 2) {
            const ragMat = new THREE.MeshStandardMaterial({ color: 0x554433, side: THREE.DoubleSide });
            for (let i = 0; i < 2; i++) {
                const rag = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.25), ragMat);
                rag.position.set((Math.random()-0.5)*0.3, 0.55, -0.14);
                rag.rotation.z = (Math.random()-0.5) * 0.5;
                g.add(rag);
            }
        }

        // Arms (reaching forward — zombie pose)
        const armGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.4, 5);
        const hasLeftArm = variant !== 1; // variant 1 missing left arm
        let armL = null;
        if (hasLeftArm) {
            armL = new THREE.Mesh(armGeo, MAT.zombieSkin);
            armL.position.set(-0.28, 0.65, -0.15);
            armL.rotation.x = -1.2; armL.rotation.z = 0.3;
            g.add(armL);
        }
        const armR = new THREE.Mesh(armGeo, MAT.zombieSkin);
        armR.position.set(0.28, 0.7, -0.2);
        armR.rotation.x = -1.0; armR.rotation.z = -0.2;
        g.add(armR);

        // Clawed hands
        const clawMat = new THREE.MeshStandardMaterial({ color: 0x667755 });
        if (hasLeftArm) addPart(g, new THREE.SphereGeometry(0.06, 4, 4), clawMat, -0.28, 0.5, -0.35);
        addPart(g, new THREE.SphereGeometry(0.06, 4, 4), clawMat, 0.28, 0.55, -0.4);

        // Neck (thin, tilted)
        const neck = addPart(g, new THREE.CylinderGeometry(0.05, 0.06, 0.1, 4), MAT.zombieSkin, 0.02, 0.96, -0.02);
        neck.rotation.z = 0.15;

        // Head (tilted)
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 7), MAT.zombieSkin);
        head.position.set(0.03, 1.08, -0.02);
        head.scale.set(1, 1.1, 1);
        head.rotation.z = 0.1 + Math.random() * 0.15; // head lolling to side
        g.add(head);

        // Lower jaw (hanging open)
        const jawMat = new THREE.MeshStandardMaterial({ color: 0x667755 });
        const jaw = addPart(g, new THREE.BoxGeometry(0.1, 0.05, 0.08), jawMat, 0.02, 0.97, -0.15);
        jaw.rotation.x = 0.3;

        // Eyes (glowing — catches bloom)
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
        const eyeGeo = new THREE.SphereGeometry(0.035, 4, 4);
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
        eyeL.position.set(-0.055, 1.1, -0.14); g.add(eyeL);
        const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
        eyeR.position.set(0.075, 1.1, -0.14); g.add(eyeR);

        g.userData = { legL, legR, armL, armR, head, torso, phase: Math.random() * Math.PI * 2 };
        return g;
    }

    function createBarrelObj(type) {
        const g = new THREE.Group();
        // Reference uses dark metallic crates with cyan/teal accents
        const accentColors = { squad: 0x00ffcc, weapon: 0x00ddff, coins: 0x00ffcc };
        const col = accentColors[type];

        // Dark metallic crate body
        const crateMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.3 });
        const crate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), crateMat);
        crate.position.y = 0.9; crate.castShadow = true; g.add(crate);

        // Cyan/teal edge bands
        const edgeMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7 });
        const edgeGeo = new THREE.BoxGeometry(1.85, 0.08, 1.85);
        for (const y of [0.05, 1.75]) {
            const edge = new THREE.Mesh(edgeGeo, edgeMat);
            edge.position.y = y; g.add(edge);
        }

        // Cyan accent stripes on sides
        const stripeMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 });
        for (let r = 0; r < 4; r++) {
            const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.05), stripeMat);
            stripe.position.y = 0.9;
            const angle = r * Math.PI / 2;
            stripe.position.x = Math.sin(angle) * 0.91;
            stripe.position.z = Math.cos(angle) * 0.91;
            stripe.rotation.y = angle;
            g.add(stripe);
        }

        // Cyan glow light
        const cLight = new THREE.PointLight(col, 0.5, 6);
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
        soldier.scale.setScalar(1.5);
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

    // Enemy types: 'normal', 'flanker', 'brute', 'splitter'
    function spawnEnemy(z, hp, type) {
        type = type || 'normal';

        // Spawn position depends on type — enemies use FULL road width
        let cx;
        if (type === 'flanker') {
            // Flankers spawn on the far edges — positional threats
            const side = Math.random() < 0.5 ? -1 : 1;
            cx = side * (ROAD_W / 2 - 0.5 - Math.random() * 0.8);
        } else if (type === 'brute') {
            // Brutes can spawn anywhere but prefer center
            cx = (Math.random() - 0.5) * (ROAD_W - 2);
        } else {
            // Normal/splitter: width expands with wave (wave 1 narrow, wave 5+ full)
            const spawnW = Math.min(ROAD_W - 1, 2 + wave * 1.5);
            cx = (Math.random() - 0.5) * spawnW;
        }

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
            // Tint flankers blue-green, brutes dark red
            if (type === 'flanker') {
                zombie.traverse(c => { if (c.isMesh && c.material === MAT.zombieSkin) c.material = new THREE.MeshStandardMaterial({ color: 0x55aa99 }); });
            } else if (type === 'brute') {
                zombie.traverse(c => { if (c.isMesh && c.material === MAT.zombieSkin) c.material = new THREE.MeshStandardMaterial({ color: 0x994444 }); });
            } else if (type === 'splitter') {
                zombie.traverse(c => { if (c.isMesh && c.material === MAT.zombieSkin) c.material = new THREE.MeshStandardMaterial({ color: 0xaa88cc }); });
            }
            group.add(zombie);
            zombies.push(zombie);
        }

        // Scale: brutes are bigger
        group.scale.setScalar(type === 'brute' ? 1.6 : 1.3);

        // Speed varies by type
        let speed;
        if (type === 'flanker') {
            speed = diff.enemySpeed * (2.2 + Math.random() * 0.6) * (1 + wave * 0.05);
        } else if (type === 'brute') {
            speed = diff.enemySpeed * (0.5 + Math.random() * 0.2) * (1 + wave * 0.03);
        } else {
            speed = diff.enemySpeed * (0.8 + Math.random() * 0.4) * (1 + wave * 0.04);
        }

        group.userData = { hp, maxHp: hp, speed, wobble: Math.random() * Math.PI * 2, zombies, type, spawnTime: Date.now() };
        scene.add(group);
        enemies.push(group);
    }

    let lastBarrelSide = 1;
    function spawnBarrel(z) {
        // Crates positioned on SIDES of the road — alternate sides to force movement
        lastBarrelSide *= -1;
        const side = lastBarrelSide;
        const x = side * (ROAD_W / 2 - 1.5 + Math.random() * 0.5);

        const types = ['squad', 'weapon', 'coins', 'squad'];
        const weights = [4, 3, 3, 3];
        let total = weights.reduce((a, b) => a + b), r = Math.random() * total, type = types[0];
        for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) { type = types[i]; break; } }

        const hp = Math.ceil((2 + wave * 1.0) * diff.enemyHP);
        const labels = { squad: 'ALLY+', weapon: weaponLevel < WEAPONS.length - 1 ? WEAPONS[weaponLevel + 1].name : 'MAX', coins: 'COINS' };

        const crate = createBarrelObj(type);
        crate.position.set(x, 0, z);

        // Big cyan HP number (like screenshot shows 100, 120 in teal)
        const hpLabel = createTextSprite(hp.toString(), '#00ffdd', 1.5);
        hpLabel.position.set(0, 2.8, 0);
        crate.add(hpLabel);

        // Type label above — small, white
        const typeLabel = createTextSprite(labels[type], '#ffffff', 0.5);
        typeLabel.position.set(0, 3.8, 0);
        crate.add(typeLabel);

        crate.userData = { hp, maxHp: hp, type, speed: diff.enemySpeed * 0.35, hpLabel };
        scene.add(crate);
        barrels.push(crate);
    }

    // ── Bullet creation — always fires straight forward (negative Z) ──
    function createBullet(fromX, fromZ) {
        const w = WEAPONS[weaponLevel];
        const g = new THREE.Group();
        g.position.set(fromX + (Math.random()-0.5)*0.15, 0.4, fromZ);

        // Bright white-yellow core
        const core = new THREE.Mesh(new THREE.SphereGeometry(w.size * 2.2, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xffffaa }));
        g.add(core);

        // Orange glow
        const glow = new THREE.Mesh(new THREE.SphereGeometry(w.size * 4.5, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.4 }));
        g.add(glow);

        // Bullets always go straight forward — no aiming, positioning is the skill
        const vx = (Math.random() - 0.5) * 0.8; // tiny spread only
        const vz = -bulletSpeed;

        g.userData = { damage: bulletDamage, life: 2.5, vx, vz };
        scene.add(g); bullets.push(g);
    }

    // ── Muzzle flash — brighter, bigger (VFX agent) ──
    function spawnMuzzleFlash(x, z) {
        // Large bright core flash — bigger and brighter
        const flash = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 1.0 })
        );
        flash.position.set(x, 0.7, z - 0.5);
        flash.userData = { life: 0.1 };
        scene.add(flash);
        muzzleFlashes.push(flash);

        // Outer orange glow — wider
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.85, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.5 })
        );
        glow.position.set(x, 0.7, z - 0.5);
        glow.userData = { life: 0.08 };
        scene.add(glow);
        muzzleFlashes.push(glow);

        // Dynamic muzzle light — brighter (VFX agent)
        const mLight = new THREE.PointLight(0xff8822, 3.5, 10);
        mLight.position.set(x, 1, z - 0.5);
        mLight.userData = { life: 0.07 };
        scene.add(mLight);
        muzzleFlashes.push(mLight);

        // Muzzle sparks — small bright dots ejecting forward (VFX agent)
        for (let i = 0; i < 3; i++) {
            const spark = new THREE.Mesh(
                new THREE.SphereGeometry(0.04, 4, 4),
                new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 1.0 })
            );
            spark.position.set(x + (Math.random()-0.5)*0.3, 0.7, z - 0.5);
            spark.userData = {
                vel: new THREE.Vector3((Math.random()-0.5)*3, Math.random()*2+1, -(Math.random()*3+1)),
                life: 0.15 + Math.random() * 0.1,
            };
            scene.add(spark); particles.push(spark);
        }
    }

    // ── Generic particles — more, brighter, with fire sparks (VFX agent) ──
    function spawnParticles(x, y, z, color, count) {
        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.15, 0.15),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
            );
            mesh.position.set(x, y, z);
            mesh.userData = {
                vel: new THREE.Vector3((Math.random()-0.5)*6, Math.random()*6+2, (Math.random()-0.5)*6),
                life: 0.5 + Math.random() * 0.5,
            };
            scene.add(mesh); particles.push(mesh);
        }
        // Add fire sparks on each hit for more visual chaos
        const sparkColors = [0xff6600, 0xffaa00, 0xffcc44];
        for (let i = 0; i < 3; i++) {
            const spark = new THREE.Mesh(
                new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 4, 4),
                new THREE.MeshBasicMaterial({ color: sparkColors[Math.floor(Math.random()*3)], transparent: true, opacity: 1 })
            );
            spark.position.set(x, y, z);
            spark.userData = {
                vel: new THREE.Vector3((Math.random()-0.5)*4, Math.random()*4+1, (Math.random()-0.5)*4),
                life: 0.3 + Math.random() * 0.4,
            };
            scene.add(spark); particles.push(spark);
        }
    }

    // ── VFX OVERHAUL (visual-effects agent) ──────────────────────────
    // Changes: 2-3x bigger explosions with secondary fireballs, ground fire
    // decals (flat glowing circles), denser ambient embers, brighter muzzle
    // flashes, more fire particles, white-yellow flash on explosion.

    function spawnExplosion(x, z) {
        // ── Primary fireball — LARGE (2.5x original) ──
        const fireball = new THREE.Mesh(
            new THREE.SphereGeometry(2.0, 10, 10),
            new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.9 })
        );
        fireball.position.set(x, 1.2, z);
        fireball.userData = { vel: new THREE.Vector3(0, 1.5, 0), life: 0.45 };
        scene.add(fireball); particles.push(fireball);

        // ── Secondary fireballs — staggered outward for BIG area fill ──
        for (let i = 0; i < 4; i++) {
            const ang = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
            const dist = 0.8 + Math.random() * 0.6;
            const fb2 = new THREE.Mesh(
                new THREE.SphereGeometry(1.2 + Math.random() * 0.6, 8, 8),
                new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.85 })
            );
            fb2.position.set(x + Math.cos(ang) * dist, 0.8 + Math.random() * 0.6, z + Math.sin(ang) * dist);
            fb2.userData = {
                vel: new THREE.Vector3(Math.cos(ang) * 2, 2 + Math.random() * 2, Math.sin(ang) * 2),
                life: 0.25 + Math.random() * 0.3,
            };
            scene.add(fb2); particles.push(fb2);
        }

        // ── Bright white-yellow flash (instant) ──
        const flash = new THREE.Mesh(
            new THREE.SphereGeometry(3.0, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 0.7 })
        );
        flash.position.set(x, 1.0, z);
        flash.userData = { vel: new THREE.Vector3(0, 0, 0), life: 0.08 };
        scene.add(flash); particles.push(flash);

        // ── Explosion light — brighter, wider ──
        const eLight = new THREE.PointLight(0xff6600, 6.0, 20);
        eLight.position.set(x, 2.0, z);
        eLight.userData = { life: 0.4 };
        scene.add(eLight); muzzleFlashes.push(eLight);

        // ── Fire particles — 3x count, wider spread ──
        for (let i = 0; i < 60; i++) {
            const colors = [0xff4400, 0xff8800, 0xffcc00, 0xff2200, 0xff6600, 0xffee44, 0xff5500];
            const c = colors[Math.floor(Math.random() * colors.length)];
            const size = 0.15 + Math.random() * 0.35;
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(size, 5, 5),
                new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1 })
            );
            const spread = 1.5;
            mesh.position.set(
                x + (Math.random()-0.5) * spread,
                0.3 + Math.random() * 0.8,
                z + (Math.random()-0.5) * spread
            );
            mesh.userData = {
                vel: new THREE.Vector3(
                    (Math.random()-0.5) * 10,
                    Math.random() * 10 + 3,
                    (Math.random()-0.5) * 10
                ),
                life: 0.4 + Math.random() * 0.8,
            };
            scene.add(mesh); particles.push(mesh);
        }

        // ── Smoke puffs — more, bigger ──
        for (let i = 0; i < 15; i++) {
            const smoke = new THREE.Mesh(
                new THREE.SphereGeometry(0.3 + Math.random() * 0.5, 5, 5),
                new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.5 })
            );
            smoke.position.set(x + (Math.random()-0.5)*1.5, 1 + Math.random()*1.5, z + (Math.random()-0.5)*1.5);
            smoke.userData = {
                vel: new THREE.Vector3((Math.random()-0.5)*3, Math.random()*4+1, (Math.random()-0.5)*3),
                life: 0.6 + Math.random() * 1.0,
            };
            scene.add(smoke); particles.push(smoke);
        }

        // ── Ground fire decal — flat glowing circle on the road ──
        spawnGroundFire(x, z);
    }

    function spawnGroundFire(x, z) {
        // Outer orange glow decal
        const decalSize = 2.0 + Math.random() * 1.5;
        const glow = new THREE.Mesh(
            new THREE.CircleGeometry(decalSize, 16),
            new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.5 })
        );
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(x, 0.03, z);
        glow.userData = { vel: new THREE.Vector3(0, 0, 0), life: 2.5 + Math.random() * 1.5, isGroundFire: true };
        scene.add(glow); particles.push(glow);

        // Inner bright yellow core
        const core = new THREE.Mesh(
            new THREE.CircleGeometry(decalSize * 0.5, 12),
            new THREE.MeshBasicMaterial({ color: 0xffcc22, transparent: true, opacity: 0.6 })
        );
        core.rotation.x = -Math.PI / 2;
        core.position.set(x, 0.04, z);
        core.userData = { vel: new THREE.Vector3(0, 0, 0), life: 2.0 + Math.random() * 1.0, isGroundFire: true };
        scene.add(core); particles.push(core);

        // Ground fire point light
        const gLight = new THREE.PointLight(0xff6622, 1.5, 8);
        gLight.position.set(x, 0.5, z);
        gLight.userData = { life: 2.0 };
        scene.add(gLight); muzzleFlashes.push(gLight);

        // Small flame particles rising from ground fire
        for (let i = 0; i < 6; i++) {
            const flame = new THREE.Mesh(
                new THREE.SphereGeometry(0.08 + Math.random() * 0.1, 4, 4),
                new THREE.MeshBasicMaterial({
                    color: [0xff4400, 0xff8800, 0xffaa00][Math.floor(Math.random()*3)],
                    transparent: true, opacity: 0.9
                })
            );
            flame.position.set(
                x + (Math.random()-0.5) * decalSize * 0.8,
                0.1,
                z + (Math.random()-0.5) * decalSize * 0.8
            );
            flame.userData = {
                vel: new THREE.Vector3((Math.random()-0.5)*0.3, 1.5 + Math.random()*2, (Math.random()-0.5)*0.3),
                life: 0.8 + Math.random() * 0.6,
            };
            scene.add(flame); particles.push(flame);
        }
    }

    function spawnCoinPickup(x, z, amount) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 8), MAT.coin);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(x, 1.5, z);
        mesh.userData = { amount, life: 1.5, vy: 3 };
        scene.add(mesh); coinPickups.push(mesh);
    }

    // ─── Damage Numbers ─────────────────────────────────────────────
    function spawnDamageNumber(x, y, z, damage) {
        const isCrit = Math.random() < 0.10;
        const actualDamage = isCrit ? damage * 2 : damage;
        const text = isCrit ? 'CRIT' : actualDamage.toString();
        const color = isCrit ? '#ffffff' : '#ffdd00';
        const baseScale = 0.4 + Math.random() * 0.2; // 0.4-0.6 with +/-20% variation
        const scale = isCrit ? baseScale * 1.5 : baseScale;
        const sprite = createTextSprite(text, color, scale);
        sprite.position.set(x + (Math.random() - 0.5) * 0.6, y, z);
        sprite.userData.vy = 3;
        sprite.userData.life = 0.6;
        sprite.userData.maxLife = 0.6;
        sprite.userData.isCrit = isCrit;
        scene.add(sprite);
        damageNums.push(sprite);
        return isCrit ? actualDamage : damage;
    }

    // ─── White Flash on Damage ──────────────────────────────────────
    function flashEnemyWhite(enemyGroup) {
        const origMaterials = [];
        enemyGroup.userData.zombies.forEach(zombie => {
            zombie.traverse(child => {
                if (child.isMesh) {
                    origMaterials.push({ mesh: child, mat: child.material });
                    child.material = WHITE_MAT;
                }
            });
        });
        setTimeout(() => {
            origMaterials.forEach(({ mesh, mat }) => {
                if (mesh.parent) mesh.material = mat;
            });
        }, 50);
    }

    // ─── Wave System — difficulty curve ────────────────────────────
    // Wave spawn queue: array of { hp, type, delay } entries
    let waveSpawnQueue = [];
    let waveSpawnIndex = 0;
    let waveElapsed = 0; // time since wave start, for intra-wave speed ramp

    function buildWaveSpawnQueue(waveNum) {
        const queue = [];
        const p = pressure;

        if (waveNum === 1) {
            // Wave 1: immediate flankers from both edges — non-moving player dies in ~5s
            // Flankers spawn CLOSE (z=-12) and are FAST — they rush the edges
            // Player MUST move to intercept them or die
            queue.push({ hp: 1, type: 'flanker', delay: 0.0, spawnZ: -12 }); // instant left/right
            queue.push({ hp: 1, type: 'flanker', delay: 0.3, spawnZ: -12 }); // second flanker other side
            queue.push({ hp: 1, type: 'normal', delay: 0.5, spawnZ: -18 });
            queue.push({ hp: 1, type: 'flanker', delay: 1.5, spawnZ: -14 });
            queue.push({ hp: 1, type: 'normal', delay: 2.0, spawnZ: -20 });
            queue.push({ hp: 1, type: 'flanker', delay: 2.5, spawnZ: -12 });
            queue.push({ hp: 1, type: 'normal', delay: 3.0, spawnZ: -18 });
            queue.push({ hp: 1, type: 'flanker', delay: 3.5, spawnZ: -14 });
        } else if (waveNum === 2) {
            // More pressure, faster spawns, simultaneous edge attacks
            for (let i = 0; i < 6; i++) {
                queue.push({ hp: Math.ceil(1.5 * diff.enemyHP * p), type: 'normal', delay: 0.5 + i * 0.8 });
            }
            for (let i = 0; i < 6; i++) {
                queue.push({ hp: 1, type: 'flanker', delay: 0.3 + i * 0.9 });
            }
        } else if (waveNum === 3) {
            // Dense waves: normals everywhere + flanker streams + first brute
            for (let i = 0; i < 8; i++) {
                const hp = Math.ceil((1.5 + waveNum * 0.3) * diff.enemyHP * p);
                queue.push({ hp, type: 'normal', delay: 0.5 + i * 0.8 });
            }
            for (let i = 0; i < 5; i++) {
                queue.push({ hp: 1, type: 'flanker', delay: 1.0 + i * 1.3 });
            }
            // First brute in center — forces you to stay center while flankers leak
            queue.push({ hp: Math.ceil(5 * diff.enemyHP * p), type: 'brute', delay: 3.5 });
        } else if (waveNum === 4) {
            // Splitters + constant edge pressure
            for (let i = 0; i < 10; i++) {
                const hp = Math.ceil((2 + waveNum * 0.4) * diff.enemyHP * p);
                queue.push({ hp, type: 'normal', delay: 0.4 + i * 0.7 });
            }
            for (let i = 0; i < 5; i++) {
                queue.push({ hp: 1, type: 'flanker', delay: 0.8 + i * 1.2 });
            }
            queue.push({ hp: Math.ceil(3 * diff.enemyHP * p), type: 'splitter', delay: 3.0 });
            queue.push({ hp: Math.ceil(3 * diff.enemyHP * p), type: 'splitter', delay: 5.0 });
            queue.push({ hp: Math.ceil(6 * diff.enemyHP * p), type: 'brute', delay: 5.5 });
        } else {
            // Wave 5+: escalating difficulty — CROWDED road
            const baseCount = Math.floor(8 + waveNum * 3 + waveNum * waveNum * 0.4);
            const enemyCount = Math.floor(baseCount * diff.spawnRate * p);

            const flankerRatio = Math.min(0.35, 0.15 + waveNum * 0.03);
            const bruteRatio = Math.min(0.15, 0.05 + waveNum * 0.015);
            const splitterRatio = Math.min(0.12, 0.04 + waveNum * 0.012);
            const normalRatio = 1 - flankerRatio - bruteRatio - splitterRatio;

            const normals = Math.floor(enemyCount * normalRatio);
            const flankers = Math.max(3, Math.floor(enemyCount * flankerRatio));
            const brutes = Math.max(1, Math.floor(enemyCount * bruteRatio));
            const splitters = Math.max(1, Math.floor(enemyCount * splitterRatio));

            let delay = 0.3;
            const spawnGap = Math.max(0.2, 1.4 - waveNum * 0.1);

            for (let i = 0; i < normals; i++) {
                const hp = Math.ceil((1 + waveNum * 0.5 + Math.random() * waveNum * 0.3) * diff.enemyHP * p);
                queue.push({ hp, type: 'normal', delay });
                delay += spawnGap * (0.5 + Math.random() * 0.5);
            }
            // Flankers throughout the wave — constant edge pressure
            for (let i = 0; i < flankers; i++) {
                queue.push({ hp: Math.ceil((1 + waveNum * 0.2) * diff.enemyHP * p), type: 'flanker', delay: 0.5 + i * spawnGap * 1.2 });
            }
            for (let i = 0; i < brutes; i++) {
                const hp = Math.ceil((4 + waveNum * 0.8) * diff.enemyHP * p);
                queue.push({ hp, type: 'brute', delay: 2.0 + i * spawnGap * 2.0 });
            }
            for (let i = 0; i < splitters; i++) {
                const hp = Math.ceil((2 + waveNum * 0.4) * diff.enemyHP * p);
                queue.push({ hp, type: 'splitter', delay: 1.5 + i * spawnGap * 1.5 });
            }
        }

        // Sort by delay
        queue.sort((a, b) => a.delay - b.delay);
        return queue;
    }

    function startWave() {
        wave++;
        waveSpawnQueue = buildWaveSpawnQueue(wave);
        waveSpawnIndex = 0;
        waveElapsed = 0;
        waveEnemiesTotal = waveSpawnQueue.length;
        waveEnemiesLeft = waveSpawnQueue.length;

        // Barrels: wave 1 gets 1, then scale up modestly
        const barrelCount = wave === 1 ? 1 : Math.floor((2 + Math.min(wave * 0.6, 5)) * diff.barrelRate);
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
        damageNums.forEach(d => scene.remove(d));
        enemies=[]; barrels=[]; bullets=[]; particles=[]; coinPickups=[]; muzzleFlashes=[]; squad=[]; damageNums=[];
        freezeTimer = 0; comboCount = 0; comboTimer = 0;
        if (dangerVignette) dangerVignette.classList.remove('active');
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
            apply: lvl => { squadCount = 2 + lvl; },
            desc: lvl => `${2+lvl} → ${3+lvl} shooters`,
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
    // ── Ambient fire — denser embers + small ground fires (VFX agent) ──
    let ambientFireTimer = 0;
    let ambientGroundFireTimer = 0;
    const FIRE_COLORS = [0xff4400, 0xff6600, 0xff8800, 0xffaa00, 0xffcc00, 0xffee44];
    function spawnAmbientFire(dt) {
        ambientFireTimer += dt;
        // Spawn embers more frequently (was 0.15, now 0.06)
        if (ambientFireTimer >= 0.06) {
            ambientFireTimer = 0;

            // Embers floating up from the battlefield — 5 per tick (was 2)
            const colors = FIRE_COLORS;
            for (let i = 0; i < 5; i++) {
                const ember = new THREE.Mesh(
                    new THREE.SphereGeometry(0.03 + Math.random() * 0.06, 4, 4),
                    new THREE.MeshBasicMaterial({ color: colors[Math.floor(Math.random() * colors.length)], transparent: true, opacity: 0.9 })
                );
                ember.position.set(
                    (Math.random() - 0.5) * ROAD_W,
                    Math.random() * 0.3,
                    -3 - Math.random() * 40
                );
                ember.userData = {
                    vel: new THREE.Vector3((Math.random()-0.5)*0.8, 1.5 + Math.random()*3, (Math.random()-0.5)*0.5),
                    life: 1.0 + Math.random() * 2.0,
                };
                scene.add(ember); particles.push(ember);
            }
        }

        // Periodically spawn small ground fires on the road during combat
        ambientGroundFireTimer += dt;
        if (ambientGroundFireTimer >= 3.0 && enemies.length > 0) {
            ambientGroundFireTimer = 0;
            const gx = (Math.random() - 0.5) * ROAD_W * 0.7;
            const gz = -5 - Math.random() * 25;
            // Small ground fire decal
            const smallSize = 0.5 + Math.random() * 0.8;
            const glow = new THREE.Mesh(
                new THREE.CircleGeometry(smallSize, 10),
                new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.35 })
            );
            glow.rotation.x = -Math.PI / 2;
            glow.position.set(gx, 0.02, gz);
            glow.userData = { vel: new THREE.Vector3(0, 0, 0), life: 3.0 + Math.random() * 2.0, isGroundFire: true };
            scene.add(glow); particles.push(glow);
            // Small flickering flames
            for (let j = 0; j < 3; j++) {
                const flame = new THREE.Mesh(
                    new THREE.SphereGeometry(0.05 + Math.random() * 0.06, 4, 4),
                    new THREE.MeshBasicMaterial({
                        color: FIRE_COLORS[Math.floor(Math.random()*FIRE_COLORS.length)],
                        transparent: true, opacity: 0.8
                    })
                );
                flame.position.set(
                    gx + (Math.random()-0.5) * smallSize,
                    0.05,
                    gz + (Math.random()-0.5) * smallSize
                );
                flame.userData = {
                    vel: new THREE.Vector3((Math.random()-0.5)*0.2, 1.0 + Math.random()*1.5, (Math.random()-0.5)*0.2),
                    life: 0.6 + Math.random() * 0.5,
                };
                scene.add(flame); particles.push(flame);
            }
        }
    }

    // ─── Main Update ────────────────────────────────────────────────
    function update(dt) {
        if (state !== 'playing') return;

        // Hit-freeze: skip update frames
        if (freezeTimer > 0) {
            freezeTimer -= dt;
            return;
        }

        const time = Date.now() * 0.001;

        // ── Animate environment: fire flicker, dust, flames ──
        for (const fl of fireLights) {
            fl.intensity = fl.userData.baseIntensity + Math.sin(time * 8 + fl.userData.phase) * 0.25
                + Math.sin(time * 13 + fl.userData.phase * 2) * 0.15;
        }
        if (pLight) pLight.intensity = 1.2 + Math.sin(time * 7) * 0.3 + Math.sin(time * 11) * 0.15;
        if (pLight2) pLight2.intensity = 0.8 + Math.sin(time * 6 + 1) * 0.25;

        for (const m of envMeshes) {
            if (m.userData.isDust) {
                m.position.x = m.userData.baseX + Math.sin(time * 0.5 + m.userData.phase) * 0.8;
                m.position.y = m.userData.baseY + Math.sin(time * 0.3 + m.userData.phase * 1.3) * 0.3;
            }
            if (m.userData.isFlame) {
                m.position.y = m.userData.baseY + Math.abs(Math.sin(time * 6 + m.userData.phase)) * 0.2;
                m.material.opacity = 0.4 + Math.sin(time * 8 + m.userData.phase) * 0.3;
            }
        }

        // Combo timer countdown
        if (comboTimer > 0) {
            comboTimer -= dt;
            if (comboTimer <= 0) comboCount = 0;
        }

        spawnAmbientFire(dt);

        // Track wave elapsed time for intra-wave speed ramp
        waveElapsed += dt;

        // Spawn enemies from queue
        while (waveSpawnIndex < waveSpawnQueue.length) {
            const entry = waveSpawnQueue[waveSpawnIndex];
            if (waveElapsed >= entry.delay) {
                const z = entry.spawnZ != null ? entry.spawnZ : (SPAWN_Z_MIN + Math.random() * (SPAWN_Z_MAX - SPAWN_Z_MIN));
                spawnEnemy(z, entry.hp, entry.type);
                waveSpawnIndex++;
                waveEnemiesLeft = waveSpawnQueue.length - waveSpawnIndex;
            } else {
                break;
            }
        }

        // Spawn barrels
        const bInt = Math.max(1.5, 4 - wave * 0.15) / diff.barrelRate;
        barrelTimer += dt;
        if (waveBarrelsLeft > 0 && barrelTimer >= bInt) {
            barrelTimer = 0;
            spawnBarrel(SPAWN_Z_MIN + Math.random() * 5);
            waveBarrelsLeft--;
        }

        // Move enemy hordes — with intra-wave speed ramp
        const waveSpeedRamp = 1.0 + waveElapsed * 0.012; // enemies get ~1.2% faster per second into the wave
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            const effectiveSpeed = e.userData.speed * waveSpeedRamp;
            e.position.z += effectiveSpeed * dt;
            // Flankers stay on their edge lane — positional threats you must move to shoot
            if (e.userData.type === 'flanker') {
                // Slight wobble but stay on their side
                e.position.x += Math.sin(time * 2 + e.userData.wobble) * 0.15 * dt;
            } else {
                e.position.x += Math.sin(time * 1.5 + e.userData.wobble) * 0.3 * dt;
            }
            e.position.x = Math.max(-ROAD_W/2+0.5, Math.min(ROAD_W/2-0.5, e.position.x));

            // Animate zombies
            for (const z of e.userData.zombies) {
                const p = z.userData.phase;
                z.position.y = Math.abs(Math.sin(time * 3 + p)) * 0.08;
                // Shambling walk
                if (z.userData.legL) {
                    z.userData.legL.rotation.x = Math.sin(time * 4 + p) * 0.4;
                    z.userData.legR.rotation.x = -Math.sin(time * 4 + p) * 0.4;
                }
                if (z.userData.armL) z.userData.armL.rotation.x = -1.2 + Math.sin(time * 2 + p) * 0.25;
                if (z.userData.armR) z.userData.armR.rotation.x = -1.0 + Math.sin(time * 2.5 + p + 1) * 0.25;
                // Head lolling
                if (z.userData.head) z.userData.head.rotation.z = 0.1 + Math.sin(time * 1.5 + p) * 0.12;
                // Torso sway
                if (z.userData.torso) z.userData.torso.rotation.z = Math.sin(time * 1.2 + p) * 0.08;
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

        // Move bullets — straight forward with tiny spread
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.position.z += (b.userData.vz || -bulletSpeed) * dt;
            b.position.x += (b.userData.vx || 0) * dt;
            b.userData.life -= dt;
            // Sparse bullet trail — every ~3 frames per bullet
            if (Math.random() < 0.3) {
                const trail = new THREE.Mesh(
                    new THREE.SphereGeometry(0.06, 4, 4),
                    new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.6 })
                );
                trail.position.copy(b.position);
                trail.userData = { vel: new THREE.Vector3(0, 0.3, 0.5), life: 0.15 };
                scene.add(trail); particles.push(trail);
            }
            if (b.userData.life <= 0 || b.position.z < SPAWN_Z_MIN - 10) {
                scene.remove(b); bullets.splice(i, 1); continue;
            }

            // Hit enemies
            let hit = false;
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j];
                const dx = Math.abs(b.position.x - e.position.x);
                const dz = Math.abs(b.position.z - e.position.z);
                const hr = 1.0 + e.userData.zombies.length * 0.05;
                if (dx < hr && dz < hr) {
                    // Spawn damage number (may upgrade to crit)
                    const effectiveDamage = spawnDamageNumber(
                        b.position.x, 1.5, b.position.z, b.userData.damage
                    );
                    const kills = Math.min(effectiveDamage, e.userData.hp);
                    e.userData.hp -= kills;
                    SFX.hit();

                    // Knockback on hit
                    e.position.z -= 0.3;

                    // White flash on damage
                    flashEnemyWhite(e);

                    for (let k = 0; k < kills && e.userData.zombies.length > 0; k++) {
                        const dead = e.userData.zombies.pop();
                        spawnParticles(e.position.x + dead.position.x, 0.5, e.position.z + dead.position.z, 0x779966, 4);
                        e.remove(dead);
                    }

                    if (e.userData.hp <= 0) {
                        // Combo tracking
                        comboCount++;
                        comboTimer = 2.0;
                        if (comboCount >= 2) {
                            showActionText('x' + comboCount + ' COMBO', '#ff44ff');
                        }

                        let reward = Math.ceil(e.userData.maxHp * 0.3 * diff.coins);
                        if (comboCount >= 5) reward *= 2;
                        coins += reward; score += e.userData.maxHp;
                        spawnCoinPickup(e.position.x, e.position.z, reward);
                        spawnExplosion(e.position.x, e.position.z);
                        SFX.enemyDie();

                        // Splitter: spawn 2-3 small fast children on death
                        if (e.userData.type === 'splitter') {
                            const childCount = 2 + Math.floor(Math.random() * 2);
                            for (let c = 0; c < childCount; c++) {
                                const childHp = Math.max(1, Math.ceil(e.userData.maxHp * 0.3));
                                const childZ = e.position.z + (Math.random() - 0.5) * 2;
                                const childX = e.position.x + (Math.random() - 0.5) * 3;
                                spawnEnemy(childZ, childHp, 'flanker');
                                // Position the child near the parent
                                const child = enemies[enemies.length - 1];
                                child.position.x = Math.max(-ROAD_W/2+0.5, Math.min(ROAD_W/2-0.5, childX));
                                child.position.z = childZ;
                            }
                        }

                        scene.remove(e); enemies.splice(j, 1);
                        freezeTimer = 0.03;
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

        // Squad animation — soldiers always face forward (negative Z)
        squad.forEach(s => {
            s.position.x = aimX + s.userData.offsetX;
            s.rotation.y = Math.PI; // always face forward
        });

        // Muzzle flashes & temp lights
        for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
            const m = muzzleFlashes[i];
            m.userData.life -= dt;
            if (m.scale) m.scale.setScalar(1 + (0.08 - m.userData.life) * 12);
            if (m.intensity !== undefined) m.intensity *= 0.85; // fade lights
            if (m.userData.life <= 0) { scene.remove(m); muzzleFlashes.splice(i, 1); }
        }

        // Particles (VFX agent: ground fire decals fade differently)
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            if (p.userData.isGroundFire) {
                // Ground fire decals: stay flat, flicker opacity, no movement/growth
                p.userData.life -= dt;
                const flicker = 0.8 + Math.sin(Date.now() * 0.01 + i * 7) * 0.2;
                p.material.opacity = Math.max(0, Math.min(1, p.userData.life * 0.4) * flicker);
                if (p.userData.life <= 0) { scene.remove(p); particles.splice(i, 1); }
            } else {
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
            camera.position.y = 14 + (Math.random()-0.5) * shakeAmount;
            shakeAmount *= 0.88;
        } else {
            camera.position.x = 0; camera.position.y = 14; shakeAmount = 0;
        }

        // Damage numbers — float up and fade
        for (let i = damageNums.length - 1; i >= 0; i--) {
            const d = damageNums[i];
            d.position.y += d.userData.vy * dt;
            d.userData.life -= dt;
            d.material.opacity = Math.max(0, d.userData.life / d.userData.maxLife);
            if (d.userData.life <= 0) {
                scene.remove(d); damageNums.splice(i, 1);
            }
        }

        // Near-miss warning — red vignette when enemies are close
        let dangerClose = false;
        for (const e of enemies) {
            if (e.position.z > DEFENSE_Z - 3) { dangerClose = true; break; }
        }
        if (dangerVignette) {
            if (dangerClose) {
                // Pulsing opacity
                const pulse = 0.6 + Math.sin(Date.now() * 0.008) * 0.4;
                dangerVignette.style.opacity = pulse;
            } else {
                dangerVignette.style.opacity = '0';
            }
        }

        // Wave progress — based on enemies spawned and killed
        const spawned = waveSpawnIndex;
        const alive = enemies.length;
        const killed = spawned - alive;
        waveBarFill.style.width = (waveEnemiesTotal > 0 ? killed / waveEnemiesTotal * 100 : 100) + '%';
        updateHUD();

        // Wave complete — all spawned and all dead (including splitter children)
        if (waveSpawnIndex >= waveSpawnQueue.length && enemies.length === 0) {
            SFX.waveClear(); showUpgradeShop();
        }
    }

    // ─── Game Flow ──────────────────────────────────────────────────
    function startGame() {
        clearEntities();
        wave = 0; score = 0; coins = 0;
        squadCount = 2; weaponLevel = 0;
        bulletSpeed = 22; pressure = 1.0;
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

    // Mouse input
    document.addEventListener('mousedown', e => onDown(e.clientX));
    document.addEventListener('mousemove', e => onMove(e.clientX));
    document.addEventListener('mouseup', onUp);

    // Touch input — only preventDefault when game is active (not on overlays/buttons)
    document.addEventListener('touchstart', e => {
        if (state === 'playing') e.preventDefault();
        if (e.touches.length > 0) onDown(e.touches[0].clientX);
        ensureAudio();
    }, { passive: false });
    document.addEventListener('touchmove', e => {
        if (state === 'playing') e.preventDefault();
        if (e.touches.length > 0) onMove(e.touches[0].clientX);
    }, { passive: false });
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
        if (composer) {
            composer.render();
        } else {
            renderer.render(scene, camera);
        }
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
