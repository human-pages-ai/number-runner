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

        renderer = new THREE.WebGLRenderer({ antialias: false });
        renderer.setSize(W(), H());
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        document.body.insertBefore(renderer.domElement, document.body.firstChild);

        // Bloom post-processing (lighter)
        try {
            if (THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass) {
                composer = new THREE.EffectComposer(renderer);
                composer.addPass(new THREE.RenderPass(scene, camera));
                const bloomPass = new THREE.UnrealBloomPass(
                    new THREE.Vector2(W(), H()), 0.4, 0.3, 0.85
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
        sun.shadow.mapSize.width = 1024;
        sun.shadow.mapSize.height = 1024;
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

    // ─── Materials (reduced set — sprites replace most 3D materials) ──
    const MAT = {
        road: new THREE.MeshStandardMaterial({ color: 0x444455 }),
        roadLine: new THREE.MeshBasicMaterial({ color: 0x666677 }),
        wall: new THREE.MeshStandardMaterial({ color: 0x555566 }),
        wallTop: new THREE.MeshStandardMaterial({ color: 0x666677 }),
        bullet: new THREE.MeshBasicMaterial({ color: 0xffee44 }),
        bulletGlow: new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.4 }),
        muzzleFlash: new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.8 }),
        coin: new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.8, roughness: 0.2 }),
    };

    // ─── Difficulty ─────────────────────────────────────────────────
    const DIFF = {
        easy:   { enemySpeed: 1.5, enemyHP: 0.4, spawnRate: 0.5, barrelRate: 1.0, coins: 1.5 },
        normal: { enemySpeed: 2.0, enemyHP: 0.6, spawnRate: 0.6, barrelRate: 0.8, coins: 1.0 },
        hard:   { enemySpeed: 2.8, enemyHP: 1.0, spawnRate: 1.0, barrelRate: 0.5, coins: 0.7 },
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
    const MAX_PARTICLES = 150;

    // ─── Procedural Sprite Textures (drawn once at init) ────────────
    const SPRITE_TEXTURES = {};

    function initSpriteTextures() {
        // Soldier sprite (128x128, top-down view — detailed)
        const solC = document.createElement('canvas');
        solC.width = 128; solC.height = 128;
        const s = solC.getContext('2d');
        // Drop shadow
        s.beginPath(); s.arc(64, 72, 36, 0, Math.PI*2);
        s.fillStyle = 'rgba(0,0,0,0.25)'; s.fill();
        // Cyan selection ring
        s.beginPath(); s.arc(64, 70, 42, 0, Math.PI*2);
        s.strokeStyle = 'rgba(0,255,255,0.7)'; s.lineWidth = 5; s.stroke();
        s.beginPath(); s.arc(64, 70, 38, 0, Math.PI*2);
        s.fillStyle = 'rgba(0,255,255,0.1)'; s.fill();
        // Backpack
        s.fillStyle = '#4a5a28'; s.fillRect(52, 76, 24, 16);
        s.strokeStyle = '#3a4a1a'; s.lineWidth = 1; s.strokeRect(52, 76, 24, 16);
        // Body (military green, wider shoulders)
        s.beginPath(); s.ellipse(64, 66, 22, 26, 0, 0, Math.PI*2);
        s.fillStyle = '#6b7a3a'; s.fill();
        s.strokeStyle = '#556b2f'; s.lineWidth = 2; s.stroke();
        // Vest/armor plate
        s.beginPath(); s.ellipse(64, 64, 18, 20, 0, 0, Math.PI*2);
        s.fillStyle = '#7a8a44'; s.fill();
        // Shoulder pads
        s.fillStyle = '#5a6a2e';
        s.beginPath(); s.ellipse(40, 62, 10, 8, -0.2, 0, Math.PI*2); s.fill();
        s.beginPath(); s.ellipse(88, 62, 10, 8, 0.2, 0, Math.PI*2); s.fill();
        // Arms
        s.fillStyle = '#556b2f';
        s.beginPath(); s.ellipse(36, 58, 8, 14, -0.3, 0, Math.PI*2); s.fill();
        s.beginPath(); s.ellipse(92, 58, 8, 14, 0.3, 0, Math.PI*2); s.fill();
        // Hands (skin)
        s.fillStyle = '#ddb888';
        s.beginPath(); s.arc(34, 46, 5, 0, Math.PI*2); s.fill();
        s.beginPath(); s.arc(94, 46, 5, 0, Math.PI*2); s.fill();
        // Neck
        s.fillStyle = '#ddb888';
        s.beginPath(); s.ellipse(64, 44, 6, 5, 0, 0, Math.PI*2); s.fill();
        // Head
        s.beginPath(); s.arc(64, 36, 14, 0, Math.PI*2);
        s.fillStyle = '#ddb888'; s.fill();
        // Helmet
        s.beginPath(); s.arc(64, 34, 16, 0, Math.PI*2);
        s.fillStyle = '#6b7a3a'; s.fill();
        s.beginPath(); s.arc(64, 34, 18, 0, Math.PI*2);
        s.strokeStyle = '#556b2f'; s.lineWidth = 2; s.stroke();
        // Helmet star/insignia
        s.fillStyle = '#8a9a54'; s.fillRect(60, 30, 8, 8);
        // Gun barrel pointing forward
        s.fillStyle = '#2a2a2a';
        s.fillRect(60, 6, 8, 30);
        // Gun barrel tip
        s.fillStyle = '#444'; s.fillRect(58, 6, 12, 4);
        // Gun body
        s.fillStyle = '#3a3a3a'; s.fillRect(54, 32, 20, 12);
        s.fillStyle = '#4a4a2a'; s.fillRect(56, 34, 6, 8); // magazine

        SPRITE_TEXTURES.soldier = new THREE.CanvasTexture(solC);

        // Zombie sprites (128x128) — one per type
        function makeZombieTexture(bodyColor, armColor, eyeColor, isLarge) {
            const c = document.createElement('canvas');
            c.width = 128; c.height = 128;
            const cx = 64, cy = 64;
            const ctx = c.getContext('2d');
            const sc = isLarge ? 1.2 : 1.0;
            // Drop shadow
            ctx.beginPath(); ctx.arc(cx, cy+4, 30*sc, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fill();
            // Body
            ctx.beginPath(); ctx.ellipse(cx, cy+4, 22*sc, 26*sc, 0, 0, Math.PI*2);
            ctx.fillStyle = bodyColor; ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.stroke();
            // Torn clothing patches
            ctx.fillStyle = armColor;
            ctx.beginPath(); ctx.ellipse(cx-8, cy+8, 8*sc, 10*sc, 0.2, 0, Math.PI*2); ctx.fill();
            // Arms reaching forward
            ctx.fillStyle = armColor;
            ctx.beginPath(); ctx.ellipse(cx-24*sc, cy-14*sc, 8*sc, 16*sc, -0.4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx+24*sc, cy-14*sc, 8*sc, 16*sc, 0.4, 0, Math.PI*2); ctx.fill();
            // Claws/fingers
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            for (let i = -1; i <= 1; i++) {
                ctx.fillRect(cx-28*sc + i*5, cy-32*sc, 3, 8*sc);
                ctx.fillRect(cx+22*sc + i*5, cy-32*sc, 3, 8*sc);
            }
            // Head
            ctx.beginPath(); ctx.arc(cx, cy-18*sc, 12*sc, 0, Math.PI*2);
            ctx.fillStyle = armColor; ctx.fill();
            // Mouth (dark gash)
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.ellipse(cx, cy-14*sc, 5*sc, 3*sc, 0, 0, Math.PI*2); ctx.fill();
            // Eyes (glowing)
            ctx.fillStyle = eyeColor;
            ctx.shadowColor = eyeColor; ctx.shadowBlur = 6;
            ctx.beginPath(); ctx.arc(cx-5*sc, cy-22*sc, 4*sc, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx+5*sc, cy-22*sc, 4*sc, 0, Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;
            // Blood/gore splatters
            ctx.fillStyle = 'rgba(120,30,20,0.4)';
            ctx.beginPath(); ctx.arc(cx+10, cy+10, 4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx-14, cy+2, 3, 0, Math.PI*2); ctx.fill();
            return new THREE.CanvasTexture(c);
        }

        SPRITE_TEXTURES.zombie_normal = makeZombieTexture('#779966', '#667755', '#ff2200', false);
        SPRITE_TEXTURES.zombie_flanker = makeZombieTexture('#55aa99', '#448877', '#ffaa00', false);
        SPRITE_TEXTURES.zombie_brute = makeZombieTexture('#884444', '#663333', '#ff4400', true);
        SPRITE_TEXTURES.zombie_tracker = makeZombieTexture('#cc7733', '#aa5522', '#ffcc00', false);
        SPRITE_TEXTURES.zombie_splitter = makeZombieTexture('#9977bb', '#7755aa', '#ff66ff', false);

        // Barrel/crate sprites (128x128)
        function makeBarrelTexture(glowColor) {
            const c = document.createElement('canvas');
            c.width = 128; c.height = 128;
            const ctx = c.getContext('2d');
            // Glow aura
            const grad = ctx.createRadialGradient(64, 64, 20, 64, 64, 56);
            grad.addColorStop(0, glowColor + '44');
            grad.addColorStop(1, glowColor + '00');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 128, 128);
            // Dark metallic body
            ctx.fillStyle = '#3a3a3a';
            ctx.fillRect(16, 16, 96, 96);
            // Metal panel detail
            ctx.fillStyle = '#444444';
            ctx.fillRect(24, 24, 80, 80);
            ctx.fillStyle = '#3a3a3a';
            ctx.fillRect(28, 28, 72, 72);
            // Edge glow bands
            ctx.strokeStyle = glowColor;
            ctx.lineWidth = 4;
            ctx.strokeRect(16, 16, 96, 96);
            // Inner frame
            ctx.strokeStyle = glowColor + '66';
            ctx.lineWidth = 2;
            ctx.strokeRect(24, 24, 80, 80);
            // Cross detail
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(64, 20); ctx.lineTo(64, 108);
            ctx.moveTo(20, 64); ctx.lineTo(108, 64);
            ctx.stroke();
            // Corner bolts
            ctx.fillStyle = glowColor + 'cc';
            for (const [bx, by] of [[20,20],[104,20],[20,104],[104,104]]) {
                ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI*2); ctx.fill();
            }
            // Center hazard symbol (triangle)
            ctx.strokeStyle = glowColor + '88';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(64, 40); ctx.lineTo(84, 76); ctx.lineTo(44, 76); ctx.closePath();
            ctx.stroke();
            return new THREE.CanvasTexture(c);
        }

        SPRITE_TEXTURES.barrel_squad = makeBarrelTexture('#00ffcc');
        SPRITE_TEXTURES.barrel_weapon = makeBarrelTexture('#00ddff');
        SPRITE_TEXTURES.barrel_coins = makeBarrelTexture('#ffdd00');
    }

    // ─── Shared zombie materials (avoid creating per-enemy) ─────────
    const ZOMBIE_SPRITE_MATS = {};
    function getZombieSpriteMat(type) {
        if (!ZOMBIE_SPRITE_MATS[type]) {
            const texKey = 'zombie_' + type;
            ZOMBIE_SPRITE_MATS[type] = new THREE.SpriteMaterial({
                map: SPRITE_TEXTURES[texKey] || SPRITE_TEXTURES.zombie_normal,
                transparent: true,
            });
        }
        return ZOMBIE_SPRITE_MATS[type];
    }

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
        const skyGeo = new THREE.SphereGeometry(90, 12, 8);
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
        const roadTex = makeCanvasTexture(128, 256, (ctx, w, h) => {
            ctx.fillStyle = '#3a3230';
            ctx.fillRect(0, 0, w, h);
            // Noise grain
            for (let i = 0; i < 1000; i++) {
                const v = 40 + Math.random() * 30;
                ctx.fillStyle = `rgb(${v},${v-5},${v-8})`;
                ctx.fillRect(Math.random()*w, Math.random()*h, 2, 2);
            }
            // Cracks
            ctx.strokeStyle = '#2a2520';
            ctx.lineWidth = 1;
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                let cx = Math.random() * w, cy = Math.random() * h;
                ctx.moveTo(cx, cy);
                for (let j = 0; j < 4; j++) {
                    cx += (Math.random()-0.5) * 40;
                    cy += Math.random() * 30;
                    ctx.lineTo(cx, cy);
                }
                ctx.stroke();
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
        const wallTex = makeCanvasTexture(64, 32, (ctx, w, h) => {
            ctx.fillStyle = '#555550';
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 200; i++) {
                const v = 70 + Math.random() * 30;
                ctx.fillStyle = `rgb(${v},${v},${v-5})`;
                ctx.fillRect(Math.random()*w, Math.random()*h, 2, 2);
            }
            ctx.strokeStyle = '#444440';
            for (let y = 8; y < h; y += 8) {
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
            const dirtTex = makeCanvasTexture(64, 64, (ctx, w, h) => {
                ctx.fillStyle = '#332820';
                ctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 400; i++) {
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

        // ── Building silhouettes — reduced from 10 to 4 per side ──
        const buildingMat = new THREE.MeshStandardMaterial({ color: 0x151518, roughness: 1.0 });
        const windowMat = new THREE.MeshBasicMaterial({ color: 0xff9944, transparent: true, opacity: 0.6 });
        for (const side of [-1, 1]) {
            for (let i = 0; i < 4; i++) {
                const bw = 3 + Math.random() * 5;
                const bh = 5 + Math.random() * 12;
                const bd = 3 + Math.random() * 5;
                const bx = side * (ROAD_W / 2 + 3 + Math.random() * 12);
                const bz = 5 - i * 14 - Math.random() * 3;
                const building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), buildingMat);
                building.position.set(bx, bh / 2, bz);
                building.castShadow = true;
                scene.add(building); envMeshes.push(building);

                // Lit windows (sparse)
                if (Math.random() < 0.5) {
                    const winCount = Math.floor(1 + Math.random() * 2);
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
            }
        }

        // ── Scattered rubble/debris on road (fewer) ──
        const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x665544, roughness: 0.9 });
        for (let i = 0; i < 12; i++) {
            const s = 0.1 + Math.random() * 0.25;
            const rubble = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.4, s * (0.8+Math.random()*0.4)), rubbleMat);
            rubble.position.set(
                (Math.random() - 0.5) * ROAD_W * 0.8,
                s * 0.2,
                -3 - Math.random() * 50
            );
            rubble.rotation.y = Math.random() * Math.PI;
            scene.add(rubble); envMeshes.push(rubble);
        }

        // ── Ground fire lights only (3 total, no flame cones, no dust, no smoke columns) ──
        for (let i = 0; i < 3; i++) {
            const fx = (Math.random() - 0.5) * ROAD_W * 0.6;
            const fz = -2 - Math.random() * 30;
            const fLight = new THREE.PointLight(0xff6622, 0.5, 6);
            fLight.position.set(fx, 0.4, fz);
            fLight.userData = { baseIntensity: 0.3 + Math.random() * 0.4, phase: Math.random() * 10 };
            scene.add(fLight); envMeshes.push(fLight);
            fireLights.push(fLight);
        }
    }

    // ─── Sprite-based Character Creation ────────────────────────────

    function createSoldier() {
        const mat = new THREE.SpriteMaterial({
            map: SPRITE_TEXTURES.soldier,
            transparent: true,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(3.5, 3.5, 1);
        sprite.position.y = 1.5;

        const g = new THREE.Group();
        g.add(sprite);
        g.userData = { sprite: sprite, phase: Math.random() * Math.PI * 2 };
        return g;
    }

    function createZombieSprite(type) {
        const baseMat = getZombieSpriteMat(type);
        const mat = baseMat.clone();
        const isLarge = type === 'brute';
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(isLarge ? 4.5 : 3.0, isLarge ? 4.5 : 3.0, 1);
        sprite.position.y = isLarge ? 1.8 : 1.3;
        sprite.userData = { phase: Math.random() * Math.PI * 2, origMat: mat, origMap: mat.map };
        return sprite;
    }

    function createBarrelObj(type) {
        const g = new THREE.Group();
        const texKey = 'barrel_' + type;
        const mat = new THREE.SpriteMaterial({
            map: SPRITE_TEXTURES[texKey] || SPRITE_TEXTURES.barrel_squad,
            transparent: true,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(4.0, 4.0, 1);
        sprite.position.y = 1.5;
        g.add(sprite);
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

        soldier.position.set(aimX + ox, 0, DEFENSE_Z + 1);
        soldier.userData.offsetX = ox;
        soldier.userData.phase = Math.random() * Math.PI * 2;
        scene.add(soldier);
        return soldier;
    }

    function rebuildSquad() {
        squad.forEach(s => scene.remove(s));
        squad = [];
        for (let i = 0; i < squadCount; i++) squad.push(spawnSquadMember(i));
    }

    // Enemy types: 'normal', 'flanker', 'brute', 'splitter', 'tracker'
    function spawnEnemy(z, hp, type) {
        type = type || 'normal';

        // Spawn position depends on type — enemies use FULL road width
        let cx;
        if (type === 'flanker') {
            const side = Math.random() < 0.5 ? -1 : 1;
            cx = side * (ROAD_W / 2 - 0.5 - Math.random() * 0.8);
        } else if (type === 'brute') {
            cx = (Math.random() - 0.5) * (ROAD_W - 2);
        } else {
            const spawnW = Math.min(ROAD_W - 1, 2 + wave * 1.5);
            cx = (Math.random() - 0.5) * spawnW;
        }

        const group = new THREE.Group();
        group.position.set(cx, 0, z);

        // Instead of multiple 3D zombie meshes, use sprite count for visual density
        const count = Math.min(hp, 25);
        const zombieSprites = [];
        const spread = Math.min(1.8, 0.3 + count * 0.1);
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * spread;
            const zombie = createZombieSprite(type);
            zombie.position.set(Math.cos(a) * r, zombie.position.y, Math.sin(a) * r);
            group.add(zombie);
            zombieSprites.push(zombie);
        }

        // Scale: brutes are bigger
        group.scale.setScalar(type === 'brute' ? 1.4 : 1.1);

        // Speed varies by type
        let speed;
        if (type === 'flanker') {
            speed = diff.enemySpeed * (2.2 + Math.random() * 0.6) * (1 + wave * 0.06);
        } else if (type === 'brute') {
            speed = diff.enemySpeed * (0.5 + Math.random() * 0.2) * (1 + wave * 0.03);
        } else if (type === 'tracker') {
            speed = diff.enemySpeed * (1.4 + Math.random() * 0.4) * (1 + wave * 0.05);
        } else {
            speed = diff.enemySpeed * (0.8 + Math.random() * 0.4) * (1 + wave * 0.05);
        }

        group.userData = { hp, maxHp: hp, speed, wobble: Math.random() * Math.PI * 2, zombies: zombieSprites, type, spawnTime: Date.now() };
        scene.add(group);
        enemies.push(group);
    }

    let lastBarrelSide = 1;
    function spawnBarrel(z) {
        lastBarrelSide *= -1;
        const side = lastBarrelSide;
        const x = side * (ROAD_W / 2 - 1.5 + Math.random() * 0.5);

        const types = ['squad', 'weapon', 'coins', 'squad'];
        const weights = [4, 3, 3, 3];
        let total = weights.reduce((a, b) => a + b), r = Math.random() * total, type = types[0];
        for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) { type = types[i]; break; } }

        const hp = Math.ceil((4 + wave * 2) * diff.enemyHP);
        const labels = { squad: 'ALLY+', weapon: weaponLevel < WEAPONS.length - 1 ? WEAPONS[weaponLevel + 1].name : 'MAX', coins: 'COINS' };

        const crate = createBarrelObj(type);
        crate.position.set(x, 0, z);

        // Big cyan HP number
        const hpLabel = createTextSprite(hp.toString(), '#00ffdd', 1.5);
        hpLabel.position.set(0, 2.8, 0);
        crate.add(hpLabel);

        // Type label above
        const typeLabel = createTextSprite(labels[type], '#ffffff', 0.5);
        typeLabel.position.set(0, 3.8, 0);
        crate.add(typeLabel);

        crate.userData = { hp, maxHp: hp, type, speed: diff.enemySpeed * 0.35, hpLabel, life: 8 + Math.random() * 2 };
        scene.add(crate);
        barrels.push(crate);
    }

    // ── Bullet creation ──
    function createBullet(fromX, fromZ) {
        const w = WEAPONS[weaponLevel];
        const g = new THREE.Group();
        g.position.set(fromX + (Math.random()-0.5)*0.15, 0.4, fromZ);

        // Bright core
        const core = new THREE.Mesh(new THREE.SphereGeometry(w.size * 2.2, 4, 4),
            new THREE.MeshBasicMaterial({ color: 0xffffaa }));
        g.add(core);

        // Glow
        const glow = new THREE.Mesh(new THREE.SphereGeometry(w.size * 4, 4, 4),
            new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.4 }));
        g.add(glow);

        const vx = (Math.random() - 0.5) * 0.8;
        const vz = -bulletSpeed;

        g.userData = { damage: bulletDamage, life: 2.5, vx, vz };
        scene.add(g); bullets.push(g);
    }

    // ── Muzzle flash — simplified ──
    function spawnMuzzleFlash(x, z) {
        const flash = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 1.0 })
        );
        flash.position.set(x, 0.7, z - 0.5);
        flash.userData = { life: 0.08 };
        scene.add(flash);
        muzzleFlashes.push(flash);

        // Dynamic muzzle light
        const mLight = new THREE.PointLight(0xff8822, 2.5, 8);
        mLight.position.set(x, 1, z - 0.5);
        mLight.userData = { life: 0.06 };
        scene.add(mLight);
        muzzleFlashes.push(mLight);
    }

    // ── Particles — with cap enforcement ──
    function addParticle(mesh) {
        scene.add(mesh);
        particles.push(mesh);
        // Enforce particle cap
        while (particles.length > MAX_PARTICLES) {
            const old = particles.shift();
            scene.remove(old);
        }
    }

    function spawnParticles(x, y, z, color, count) {
        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.12, 0.12),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
            );
            mesh.position.set(x, y, z);
            mesh.userData = {
                vel: new THREE.Vector3((Math.random()-0.5)*6, Math.random()*6+2, (Math.random()-0.5)*6),
                life: 0.4 + Math.random() * 0.4,
            };
            addParticle(mesh);
        }
    }

    // ── Explosion — reduced from 60 to 20 particles, no secondary fireballs ──
    function spawnExplosion(x, z) {
        // Small fireball
        const fireball = new THREE.Mesh(
            new THREE.SphereGeometry(0.8, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.8 })
        );
        fireball.position.set(x, 0.8, z);
        fireball.userData = { vel: new THREE.Vector3(0, 1, 0), life: 0.25 };
        addParticle(fireball);

        // Brief flash
        const flash = new THREE.Mesh(
            new THREE.SphereGeometry(1.2, 4, 4),
            new THREE.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 0.5 })
        );
        flash.position.set(x, 0.5, z);
        flash.userData = { vel: new THREE.Vector3(0, 0, 0), life: 0.06 };
        addParticle(flash);

        // Explosion light
        const eLight = new THREE.PointLight(0xff6600, 3.0, 10);
        eLight.position.set(x, 1.5, z);
        eLight.userData = { life: 0.2 };
        scene.add(eLight); muzzleFlashes.push(eLight);

        // Fire particles — 10 (smaller, tighter)
        const colors = [0xff4400, 0xff8800, 0xffcc00, 0xff6600];
        for (let i = 0; i < 10; i++) {
            const c = colors[Math.floor(Math.random() * colors.length)];
            const size = 0.08 + Math.random() * 0.15;
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(size, 3, 3),
                new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1 })
            );
            mesh.position.set(
                x + (Math.random()-0.5) * 0.8,
                0.2 + Math.random() * 0.5,
                z + (Math.random()-0.5) * 0.8
            );
            mesh.userData = {
                vel: new THREE.Vector3(
                    (Math.random()-0.5) * 5,
                    Math.random() * 5 + 2,
                    (Math.random()-0.5) * 5
                ),
                life: 0.2 + Math.random() * 0.4,
            };
            addParticle(mesh);
        }

        // 3 smoke puffs
        for (let i = 0; i < 3; i++) {
            const smoke = new THREE.Mesh(
                new THREE.SphereGeometry(0.2 + Math.random() * 0.3, 3, 3),
                new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.3 })
            );
            smoke.position.set(x + (Math.random()-0.5)*0.8, 0.8, z + (Math.random()-0.5)*0.8);
            smoke.userData = {
                vel: new THREE.Vector3((Math.random()-0.5)*1.5, Math.random()*2+1, (Math.random()-0.5)*1.5),
                life: 0.4 + Math.random() * 0.5,
            };
            addParticle(smoke);
        }
    }

    function spawnGroundFire(x, z) {
        const decalSize = 1.5 + Math.random() * 1.0;
        const glow = new THREE.Mesh(
            new THREE.CircleGeometry(decalSize, 10),
            new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.4 })
        );
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(x, 0.03, z);
        glow.userData = { vel: new THREE.Vector3(0, 0, 0), life: 2.0 + Math.random() * 1.0, isGroundFire: true };
        addParticle(glow);
    }

    function spawnCoinPickup(x, z, amount) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 6), MAT.coin);
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
        const baseScale = 0.4 + Math.random() * 0.2;
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
    const WHITE_SPRITE_MAT = new THREE.SpriteMaterial({ color: 0xffffff });
    function flashEnemyWhite(enemyGroup) {
        const origMaterials = [];
        enemyGroup.userData.zombies.forEach(zombie => {
            if (zombie.isSprite) {
                origMaterials.push({ sprite: zombie, mat: zombie.material });
                zombie.material = WHITE_SPRITE_MAT;
            }
        });
        setTimeout(() => {
            origMaterials.forEach(({ sprite, mat }) => {
                if (sprite.parent) sprite.material = mat;
            });
        }, 50);
    }

    // ─── Wave System — difficulty curve ────────────────────────────
    let waveSpawnQueue = [];
    let waveSpawnIndex = 0;
    let waveElapsed = 0;

    function buildWaveSpawnQueue(waveNum) {
        const queue = [];
        const p = pressure;

        if (waveNum === 1) {
            // Wave 1: aggressive — trackers + flankers from close range
            queue.push({ hp: 1, type: 'flanker', delay: 0.0, spawnZ: -10 });
            queue.push({ hp: 1, type: 'tracker', delay: 0.2, spawnZ: -12 });
            queue.push({ hp: 1, type: 'flanker', delay: 0.4, spawnZ: -10 });
            queue.push({ hp: 1, type: 'normal', delay: 0.6, spawnZ: -16 });
            queue.push({ hp: 1, type: 'tracker', delay: 0.8, spawnZ: -12 });
            queue.push({ hp: 1, type: 'flanker', delay: 1.2, spawnZ: -10 });
            queue.push({ hp: 1, type: 'normal', delay: 1.5, spawnZ: -18 });
            queue.push({ hp: 1, type: 'flanker', delay: 1.8, spawnZ: -12 });
            queue.push({ hp: 1, type: 'tracker', delay: 2.0, spawnZ: -10 });
            queue.push({ hp: 1, type: 'normal', delay: 2.3, spawnZ: -16 });
            queue.push({ hp: 1, type: 'flanker', delay: 2.6, spawnZ: -10 });
            queue.push({ hp: 1, type: 'tracker', delay: 2.9, spawnZ: -12 });
        } else if (waveNum === 2) {
            // Wave 2: more trackers, tighter spacing
            for (let i = 0; i < 6; i++) {
                queue.push({ hp: Math.ceil(2 * diff.enemyHP * p), type: 'normal', delay: 0.3 + i * 0.6 });
            }
            for (let i = 0; i < 5; i++) {
                queue.push({ hp: 1, type: 'flanker', delay: 0.2 + i * 0.7 });
            }
            for (let i = 0; i < 4; i++) {
                queue.push({ hp: Math.ceil(2 * diff.enemyHP * p), type: 'tracker', delay: 0.5 + i * 1.0 });
            }
        } else if (waveNum === 3) {
            // Brute + flankers + trackers
            for (let i = 0; i < 8; i++) {
                const hp = Math.ceil((2 + waveNum * 0.4) * diff.enemyHP * p);
                queue.push({ hp, type: 'normal', delay: 0.3 + i * 0.6 });
            }
            for (let i = 0; i < 5; i++) {
                queue.push({ hp: 1, type: 'flanker', delay: 0.8 + i * 1.0 });
            }
            queue.push({ hp: Math.ceil(6 * diff.enemyHP * p), type: 'brute', delay: 1.5 });
            for (let i = 0; i < 3; i++) {
                queue.push({ hp: Math.ceil(2.5 * diff.enemyHP * p), type: 'tracker', delay: 2.0 + i * 1.2 });
            }
        } else if (waveNum === 4) {
            // Splitters + all types
            for (let i = 0; i < 10; i++) {
                const hp = Math.ceil((2.5 + waveNum * 0.5) * diff.enemyHP * p);
                queue.push({ hp, type: 'normal', delay: 0.3 + i * 0.5 });
            }
            for (let i = 0; i < 5; i++) {
                queue.push({ hp: 1, type: 'flanker', delay: 0.3 + i * 0.8 });
            }
            for (let i = 0; i < 4; i++) {
                queue.push({ hp: Math.ceil(2.5 * diff.enemyHP * p), type: 'tracker', delay: 0.8 + i * 1.2 });
            }
            queue.push({ hp: Math.ceil(4 * diff.enemyHP * p), type: 'splitter', delay: 2.0 });
            queue.push({ hp: Math.ceil(4 * diff.enemyHP * p), type: 'splitter', delay: 3.5 });
            queue.push({ hp: Math.ceil(8 * diff.enemyHP * p), type: 'brute', delay: 4.0 });
        } else {
            // Wave 5+: escalating
            const baseCount = Math.floor(10 + waveNum * 3.5 + waveNum * waveNum * 0.5);
            const enemyCount = Math.floor(baseCount * diff.spawnRate * p);

            const flankerRatio = Math.min(0.30, 0.14 + waveNum * 0.025);
            const trackerRatio = Math.min(0.22, 0.10 + waveNum * 0.025);
            const bruteRatio = Math.min(0.12, 0.04 + waveNum * 0.012);
            const splitterRatio = Math.min(0.10, 0.03 + waveNum * 0.01);
            const normalRatio = 1 - flankerRatio - trackerRatio - bruteRatio - splitterRatio;

            const normals = Math.floor(enemyCount * normalRatio);
            const flankers = Math.max(3, Math.floor(enemyCount * flankerRatio));
            const trackers = Math.max(3, Math.floor(enemyCount * trackerRatio));
            const brutes = Math.max(1, Math.floor(enemyCount * bruteRatio));
            const splitters = Math.max(1, Math.floor(enemyCount * splitterRatio));

            let delay = 0.2;
            const spawnGap = Math.max(0.15, 1.2 - waveNum * 0.1);

            for (let i = 0; i < normals; i++) {
                const hp = Math.ceil((1.5 + waveNum * 0.6 + Math.random() * waveNum * 0.3) * diff.enemyHP * p);
                queue.push({ hp, type: 'normal', delay });
                delay += spawnGap * (0.4 + Math.random() * 0.5);
            }
            for (let i = 0; i < flankers; i++) {
                queue.push({ hp: Math.ceil((1.5 + waveNum * 0.3) * diff.enemyHP * p), type: 'flanker', delay: 0.3 + i * spawnGap * 0.9 });
            }
            for (let i = 0; i < trackers; i++) {
                queue.push({ hp: Math.ceil((2.5 + waveNum * 0.4) * diff.enemyHP * p), type: 'tracker', delay: 0.5 + i * spawnGap * 1.1 });
            }
            for (let i = 0; i < brutes; i++) {
                const hp = Math.ceil((5 + waveNum * 1.0) * diff.enemyHP * p);
                queue.push({ hp, type: 'brute', delay: 1.5 + i * spawnGap * 1.8 });
            }
            for (let i = 0; i < splitters; i++) {
                const hp = Math.ceil((3 + waveNum * 0.5) * diff.enemyHP * p);
                queue.push({ hp, type: 'splitter', delay: 1.0 + i * spawnGap * 1.4 });
            }
        }

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

        // Barrels: reduced rate — wave 1 gets 1, then modest scaling
        const barrelCount = wave === 1 ? 1 : Math.floor((1.5 + Math.min(wave * 0.4, 3)) * diff.barrelRate);
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

    // ─── Ambient Fire (reduced) ─────────────────────────────────────
    let ambientFireTimer = 0;
    const FIRE_COLORS = [0xff4400, 0xff6600, 0xff8800, 0xffaa00];
    function spawnAmbientFire(dt) {
        ambientFireTimer += dt;
        // Reduced: spawn 2 embers every 0.12s (was 5 every 0.06s)
        if (ambientFireTimer >= 0.12) {
            ambientFireTimer = 0;
            for (let i = 0; i < 2; i++) {
                const ember = new THREE.Mesh(
                    new THREE.SphereGeometry(0.03 + Math.random() * 0.05, 3, 3),
                    new THREE.MeshBasicMaterial({ color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)], transparent: true, opacity: 0.8 })
                );
                ember.position.set(
                    (Math.random() - 0.5) * ROAD_W,
                    Math.random() * 0.3,
                    -3 - Math.random() * 40
                );
                ember.userData = {
                    vel: new THREE.Vector3((Math.random()-0.5)*0.6, 1.5 + Math.random()*2, (Math.random()-0.5)*0.4),
                    life: 0.8 + Math.random() * 1.5,
                };
                addParticle(ember);
            }
        }
    }

    // ─── Main Update ────────────────────────────────────────────────
    function update(dt) {
        if (state !== 'playing') return;

        if (freezeTimer > 0) {
            freezeTimer -= dt;
            return;
        }

        const time = Date.now() * 0.001;

        // Animate fire lights
        for (const fl of fireLights) {
            fl.intensity = fl.userData.baseIntensity + Math.sin(time * 8 + fl.userData.phase) * 0.25
                + Math.sin(time * 13 + fl.userData.phase * 2) * 0.15;
        }
        if (pLight) pLight.intensity = 1.2 + Math.sin(time * 7) * 0.3 + Math.sin(time * 11) * 0.15;
        if (pLight2) pLight2.intensity = 0.8 + Math.sin(time * 6 + 1) * 0.25;

        // Combo timer
        if (comboTimer > 0) {
            comboTimer -= dt;
            if (comboTimer <= 0) comboCount = 0;
        }

        spawnAmbientFire(dt);
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

        // Spawn barrels (reduced rate)
        const bInt = Math.max(2.0, 5 - wave * 0.15) / diff.barrelRate;
        barrelTimer += dt;
        if (waveBarrelsLeft > 0 && barrelTimer >= bInt) {
            barrelTimer = 0;
            spawnBarrel(SPAWN_Z_MIN + Math.random() * 5);
            waveBarrelsLeft--;
        }

        // Move enemies — with intra-wave speed ramp
        const waveSpeedRamp = 1.0 + waveElapsed * 0.015;
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            const effectiveSpeed = e.userData.speed * waveSpeedRamp;
            e.position.z += effectiveSpeed * dt;

            if (e.userData.type === 'flanker') {
                e.position.x += Math.sin(time * 2 + e.userData.wobble) * 0.15 * dt;
            } else if (e.userData.type === 'tracker') {
                // Trackers home aggressively toward player
                const dx = aimX - e.position.x;
                e.position.x += Math.sign(dx) * Math.min(Math.abs(dx), 3.0 * dt);
            } else {
                e.position.x += Math.sin(time * 1.5 + e.userData.wobble) * 0.3 * dt;
            }
            e.position.x = Math.max(-ROAD_W/2+0.5, Math.min(ROAD_W/2-0.5, e.position.x));

            // Animate zombie sprites (simple bob)
            for (const z of e.userData.zombies) {
                const p = z.userData.phase;
                z.position.y = (z.scale.y > 2 ? 1.2 : 0.9) + Math.abs(Math.sin(time * 3 + p)) * 0.1;
            }

            // Reached defense line
            if (e.position.z >= DEFENSE_Z) {
                const rem = e.userData.hp;
                for (let k = 0; k < rem && squad.length > 0; k++) {
                    const lost = squad.pop();
                    spawnParticles(lost.position.x, 0.5, lost.position.z, 0x556B2F, 6);
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

        // Move barrels
        for (let i = barrels.length - 1; i >= 0; i--) {
            const b = barrels[i];
            b.position.z += b.userData.speed * dt;
            b.userData.life -= dt;
            if (b.userData.life < 2) {
                const flash = Math.sin(b.userData.life * 8) > 0;
                b.visible = flash;
            }
            if (b.position.z >= DEFENSE_Z + 5 || b.userData.life <= 0) {
                scene.remove(b); barrels.splice(i, 1);
            }
        }

        // Auto-fire
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
            b.position.z += (b.userData.vz || -bulletSpeed) * dt;
            b.position.x += (b.userData.vx || 0) * dt;
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
                const hr = 1.0 + e.userData.zombies.length * 0.05;
                if (dx < hr && dz < hr) {
                    const effectiveDamage = spawnDamageNumber(
                        b.position.x, 1.5, b.position.z, b.userData.damage
                    );
                    const kills = Math.min(effectiveDamage, e.userData.hp);
                    e.userData.hp -= kills;
                    SFX.hit();
                    e.position.z -= 0.3;
                    flashEnemyWhite(e);

                    for (let k = 0; k < kills && e.userData.zombies.length > 0; k++) {
                        const dead = e.userData.zombies.pop();
                        spawnParticles(e.position.x + dead.position.x, 0.5, e.position.z + (dead.position.z || 0), 0x779966, 3);
                        e.remove(dead);
                    }

                    if (e.userData.hp <= 0) {
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

                        // Splitter children
                        if (e.userData.type === 'splitter') {
                            const childCount = 2 + Math.floor(Math.random() * 2);
                            for (let c = 0; c < childCount; c++) {
                                const childHp = Math.max(1, Math.ceil(e.userData.maxHp * 0.3));
                                const childZ = e.position.z + (Math.random() - 0.5) * 2;
                                const childX = e.position.x + (Math.random() - 0.5) * 3;
                                spawnEnemy(childZ, childHp, 'flanker');
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

        // Squad position
        squad.forEach(s => {
            s.position.x = aimX + s.userData.offsetX;
        });

        // Muzzle flashes
        for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
            const m = muzzleFlashes[i];
            m.userData.life -= dt;
            if (m.scale) m.scale.setScalar(1 + (0.08 - m.userData.life) * 12);
            if (m.intensity !== undefined) m.intensity *= 0.85;
            if (m.userData.life <= 0) { scene.remove(m); muzzleFlashes.splice(i, 1); }
        }

        // Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            if (p.userData.isGroundFire) {
                p.userData.life -= dt;
                const flicker = 0.8 + Math.sin(Date.now() * 0.01 + i * 7) * 0.2;
                p.material.opacity = Math.max(0, Math.min(1, p.userData.life * 0.4) * flicker);
                if (p.userData.life <= 0) { scene.remove(p); particles.splice(i, 1); }
            } else {
                p.position.add(p.userData.vel.clone().multiplyScalar(dt));
                p.userData.vel.y -= 10 * dt;
                p.userData.vel.multiplyScalar(0.98);
                p.userData.life -= dt;
                p.material.opacity = Math.max(0, p.userData.life * 2);
                const scale = 1 + (1 - p.userData.life) * 1.2;
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

        // Damage numbers
        for (let i = damageNums.length - 1; i >= 0; i--) {
            const d = damageNums[i];
            d.position.y += d.userData.vy * dt;
            d.userData.life -= dt;
            d.material.opacity = Math.max(0, d.userData.life / d.userData.maxLife);
            if (d.userData.life <= 0) {
                scene.remove(d); damageNums.splice(i, 1);
            }
        }

        // Danger vignette
        let dangerClose = false;
        for (const e of enemies) {
            if (e.position.z > DEFENSE_Z - 3) { dangerClose = true; break; }
        }
        if (dangerVignette) {
            if (dangerClose) {
                const pulse = 0.6 + Math.sin(Date.now() * 0.008) * 0.4;
                dangerVignette.style.opacity = pulse;
            } else {
                dangerVignette.style.opacity = '0';
            }
        }

        // Wave progress
        const spawned = waveSpawnIndex;
        const alive = enemies.length;
        const killed = spawned - alive;
        waveBarFill.style.width = (waveEnemiesTotal > 0 ? killed / waveEnemiesTotal * 100 : 100) + '%';
        updateHUD();

        // Wave complete
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

    document.addEventListener('mousedown', e => onDown(e.clientX));
    document.addEventListener('mousemove', e => onMove(e.clientX));
    document.addEventListener('mouseup', onUp);

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
    initSpriteTextures();
    initEnvironment();
    requestAnimationFrame(loop);
})();
