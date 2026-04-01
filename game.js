// Barrel Defense — LastTokens
// Shoot barrels for upgrades. Shoot enemies to survive. The game that doesn't exist... until now.

(function () {
    'use strict';

    // ─── Three.js Setup ─────────────────────────────────────────────
    let scene, camera, renderer;
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    function initRenderer() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);
        scene.fog = new THREE.FogExp2(0x1a1a2e, 0.012);

        // Angled top-down camera — enemies approach from far end
        camera = new THREE.PerspectiveCamera(50, W() / H(), 0.1, 200);
        camera.position.set(0, 18, 14);
        camera.lookAt(0, 0, -5);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(W(), H());
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.insertBefore(renderer.domElement, document.body.firstChild);

        // Lights
        scene.add(new THREE.AmbientLight(0x6688cc, 0.5));

        const sun = new THREE.DirectionalLight(0xffeedd, 0.9);
        sun.position.set(5, 25, 10);
        sun.castShadow = true;
        sun.shadow.camera.left = -25;
        sun.shadow.camera.right = 25;
        sun.shadow.camera.top = 30;
        sun.shadow.camera.bottom = -15;
        sun.shadow.mapSize.width = 1024;
        sun.shadow.mapSize.height = 1024;
        scene.add(sun);

        // Orange point light at player position for warmth
        const playerLight = new THREE.PointLight(0xff8844, 0.6, 20);
        playerLight.position.set(0, 3, 5);
        scene.add(playerLight);

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
    const hudEl = document.getElementById('hud');
    const waveBar = document.getElementById('wave-bar');
    const waveBarFill = document.getElementById('wave-bar-fill');
    const actionText = document.getElementById('action-text');
    const upgradeButtons = document.getElementById('upgrade-buttons');

    // ─── Audio (Web Audio API) ──────────────────────────────────────
    let audioCtx;
    function ensureAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    function playTone(freq, dur, type, vol, ramp) {
        ensureAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        if (ramp) osc.frequency.linearRampToValueAtTime(ramp, audioCtx.currentTime + dur);
        gain.gain.setValueAtTime(vol || 0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + dur);
    }

    function playNoise(dur, vol) {
        ensureAudio();
        const bufSize = audioCtx.sampleRate * dur;
        const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(vol || 0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        src.connect(gain);
        gain.connect(audioCtx.destination);
        src.start();
    }

    const SFX = {
        shoot: () => playNoise(0.03, 0.05),
        hit: () => playTone(200, 0.06, 'square', 0.08, 100),
        enemyDie: () => { playTone(120, 0.1, 'sine', 0.1); playNoise(0.05, 0.06); },
        barrelBreak: () => { playNoise(0.2, 0.15); playTone(400, 0.1, 'sine', 0.12, 800); },
        upgrade: () => {
            playTone(523, 0.08, 'sine', 0.1);
            setTimeout(() => playTone(784, 0.12, 'sine', 0.12), 80);
        },
        waveClear: () => {
            [523, 659, 784, 1047].forEach((f, i) => {
                setTimeout(() => playTone(f, 0.15, 'sine', 0.1), i * 80);
            });
        },
        gameOver: () => {
            [330, 262, 220, 165].forEach((f, i) => {
                setTimeout(() => playTone(f, 0.3, 'sine', 0.1), i * 180);
            });
        },
        coin: () => playTone(1200, 0.05, 'sine', 0.06, 1800),
    };

    // ─── Materials ──────────────────────────────────────────────────
    const MAT = {
        ground: new THREE.MeshStandardMaterial({ color: 0x2a2a3e }),
        arena: new THREE.MeshStandardMaterial({ color: 0x333350 }),
        arenaLine: new THREE.MeshStandardMaterial({ color: 0x444466 }),
        barrel: new THREE.MeshStandardMaterial({ color: 0x8B5E3C, metalness: 0.2, roughness: 0.7 }),
        barrelRing: new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.5 }),
        barrelGold: new THREE.MeshStandardMaterial({ color: 0xDAA520, metalness: 0.6, roughness: 0.3 }),
        enemy: new THREE.MeshStandardMaterial({ color: 0xCC3333 }),
        enemySkin: new THREE.MeshStandardMaterial({ color: 0xDDBB88 }),
        ally: new THREE.MeshStandardMaterial({ color: 0x3377DD }),
        allySkin: new THREE.MeshStandardMaterial({ color: 0xFFDCB0 }),
        gun: new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.3 }),
        bullet: new THREE.MeshBasicMaterial({ color: 0xffee44 }),
        bulletGlow: new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.5 }),
        particle: new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true }),
        coin: new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.8, roughness: 0.2 }),
    };

    // ─── Difficulty ─────────────────────────────────────────────────
    const DIFF = {
        easy:   { enemySpeed: 1.5, enemyHP: 0.6, spawnRate: 0.7, barrelRate: 1.3, coins: 1.5, label: 'EASY' },
        normal: { enemySpeed: 2.2, enemyHP: 1.0, spawnRate: 1.0, barrelRate: 1.0, coins: 1.0, label: 'NORMAL' },
        hard:   { enemySpeed: 3.0, enemyHP: 1.4, spawnRate: 1.4, barrelRate: 0.7, coins: 0.7, label: 'HARD' },
    };
    let diff = DIFF.normal;

    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            diff = DIFF[btn.dataset.diff];
        });
    });

    // ─── Game State ─────────────────────────────────────────────────
    let state = 'menu'; // menu | playing | waveclear | gameover
    let wave = 0;
    let score = 0;
    let coins = 0;

    // Player squad
    let squad = [];       // array of shooter objects in scene
    let squadCount = 1;
    let fireRate = 2.5;   // shots per second per shooter
    let bulletDamage = 1;
    let bulletSpeed = 30;

    // Upgrades
    let upgrades = {
        damage: 0,    // +1 damage per level
        fireRate: 0,  // +0.5 fire rate per level
        squad: 0,     // +1 squad member per level
        range: 0,     // not used yet, placeholder
    };

    // Entities
    let enemies = [];
    let barrels = [];
    let bullets = [];
    let particles = [];
    let coinPickups = [];
    let aimX = 0;       // aim position X (world coords)
    let fireCooldown = 0;
    let shakeAmount = 0;

    // Wave config
    let waveEnemiesLeft = 0;
    let waveEnemiesTotal = 0;
    let waveBarrelsLeft = 0;
    let spawnTimer = 0;
    let barrelTimer = 0;

    // Defense line — enemies reaching this Z = damage
    const DEFENSE_Z = 4;
    const SPAWN_Z_MIN = -35;
    const SPAWN_Z_MAX = -20;
    const ARENA_WIDTH = 12;

    // ─── Ground / Arena ─────────────────────────────────────────────
    let groundMeshes = [];

    function initArena() {
        groundMeshes.forEach(m => scene.remove(m));
        groundMeshes = [];

        // Large ground plane
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(80, 120),
            MAT.ground
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, -0.1, -20);
        ground.receiveShadow = true;
        scene.add(ground);
        groundMeshes.push(ground);

        // Arena floor (lighter)
        const arena = new THREE.Mesh(
            new THREE.PlaneGeometry(ARENA_WIDTH, 50),
            MAT.arena
        );
        arena.rotation.x = -Math.PI / 2;
        arena.position.set(0, -0.05, -10);
        arena.receiveShadow = true;
        scene.add(arena);
        groundMeshes.push(arena);

        // Defense line marker
        const line = new THREE.Mesh(
            new THREE.PlaneGeometry(ARENA_WIDTH + 2, 0.15),
            new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.6 })
        );
        line.rotation.x = -Math.PI / 2;
        line.position.set(0, 0.01, DEFENSE_Z);
        scene.add(line);
        groundMeshes.push(line);

        // Side walls (visual only)
        for (const side of [-1, 1]) {
            const wall = new THREE.Mesh(
                new THREE.BoxGeometry(0.3, 1.5, 50),
                MAT.arenaLine
            );
            wall.position.set(side * (ARENA_WIDTH / 2 + 0.15), 0.5, -10);
            wall.castShadow = true;
            scene.add(wall);
            groundMeshes.push(wall);
        }
    }

    // ─── Pixel Art Sprites ────────────────────────────────────────
    // 16x16 pixel art drawn pixel-by-pixel, scaled up with nearest-neighbor for crisp retro look
    const charTexCache = {};

    // Color palette
    const P = {
        _: null,               // transparent
        K: '#111111',          // black outline
        S: '#EEBB88',          // skin
        Sd: '#CC9966',         // skin shadow
        // Warrior colors
        B: '#3377DD',          // blue armor
        Bd: '#2255AA',         // blue dark
        Bl: '#55AAFF',         // blue light
        G: '#444444',          // gun metal
        Gd: '#333333',         // gun dark
        Gl: '#666666',         // gun light
        R: '#CC3333',          // red bandana
        Rd: '#992222',         // red dark
        Y: '#FFD700',          // gold/yellow
        Br: '#8B5E3C',         // brown leather
        Brd: '#6B4423',        // brown dark
        Gy: '#888888',         // grey
        W: '#FFFFFF',          // white
        Bl2: '#88CCEE',        // lens blue
        Bk: '#555555',         // dark armor
        // Viking colors
        Vr: '#AA2222',         // viking red
        Vrd: '#882222',        // viking red dark
        Vb: '#654321',         // viking brown
        Vbd: '#4A3015',        // viking brown dark
        Vh: '#999999',         // helmet grey
        Vhd: '#777777',        // helmet dark
        F: '#F5DEB3',          // horn/fur
        Fd: '#DAC298',         // horn dark
        Be: '#D2691E',         // beard
        Bed: '#A0521E',        // beard dark
        Sh: '#8B7355',         // shield
    };

    // 16x16 pixel art — warrior with gun (front-facing)
    function getWarriorPixels(v) {
        const _ = '_', K = 'K', S = 'S', Sd = 'Sd';
        const B = v % 2 === 0 ? 'B' : 'Bl', Bd2 = 'Bd', G = 'G', Gd = 'Gd', Gl = 'Gl';
        const R = 'R', Rd2 = 'Rd', Y = 'Y', Br = 'Br', Bk = 'Bk', Bl2 = 'Bl2', W = 'W';
        return [
            //0  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15
            [_,  _,  _,  _,  _,  K, K, K, K, K, K, _,  _,  _,  _,  _],  // 0: bandana top
            [_,  _,  _,  _,  K, R, R, R, R, R, R, K,  _,  _,  _,  _],  // 1: bandana
            [_,  _,  _,  K, R, Rd2,R, R, R, Rd2,R, R,  K,  _,  _,  _],  // 2: bandana + goggles
            [_,  _,  _,  K, Y, Bl2,Y, K, K, Y, Bl2,Y,  K,  _,  _,  _],  // 3: goggles
            [_,  _,  _,  K, S, S, S, S, S, S, S, S,  K,  _,  _,  _],  // 4: face
            [_,  _,  _,  K, S, K, S, S, S, S, K, S,  K,  _,  _,  _],  // 5: eyes
            [_,  _,  _,  _,  K, S, S, Sd, Sd,S, S, K,  _,  _,  _,  _],  // 6: chin
            [_,  _,  K, K, B, B, B, B, B, B, B, B,  K, K, _,  _],  // 7: shoulders
            [_,  K, S, K, B, Bk, Bk,B, B, Bk,Bk,B,  K, G, K, _],  // 8: chest + arm + gun
            [_,  K, S, K, B, Bk, Bk,B, B, Bk,Bk,B,  K, G, K, _],  // 9: chest
            [_,  _,  K, K, B, B, B, B, B, B, B, B,  K, Gl,K, _],  // 10: waist + gun barrel
            [_,  _,  _,  K, Br, Br,Y, Br,Br,Y, Br,Br, K, K, _,  _],  // 11: belt
            [_,  _,  _,  K, Bd2,Bd2,Bd2,K, K, Bd2,Bd2,Bd2,K, _,  _,  _],  // 12: pants
            [_,  _,  _,  K, Bd2,Bd2,Bd2,K, K, Bd2,Bd2,Bd2,K, _,  _,  _],  // 13: pants
            [_,  _,  _,  K, K, K, K, _,  _,  K, K, K, K, _,  _,  _],  // 14: boots top
            [_,  _,  K, K, Bk,Bk,K, _,  _,  K, Bk,Bk,K, K, _,  _],  // 15: boots
        ];
    }

    // 16x16 pixel art — viking with axe and shield
    function getVikingPixels(v) {
        const _ = '_', K = 'K';
        const Vh = 'Vh', Vhd = 'Vhd', F = 'F', Fd = 'Fd';
        const S = 'S', Sd = 'Sd', Be = v % 2 === 0 ? 'Be' : 'Y';
        const Vr = v % 2 === 0 ? 'Vr' : 'Vrd', Y = 'Y';
        const Vb = 'Vb', Vbd = 'Vbd', Sh = 'Sh', Gy = 'Gy', W = 'W';
        return [
            [_,  _,  F,  _,  _,  K, K, K, K, K, K, _,  _,  F,  _,  _],  // 0: horns + helmet
            [_,  F,  Fd, _,  K, Vh,Vh,Vh,Vh,Vh,Vh, K,  _,  Fd, F,  _],  // 1: horns + helmet
            [_,  _,  _,  K, Vh,Vhd,Vh,Vh,Vh,Vhd,Vh,Vh, K,  _,  _,  _],  // 2: helmet
            [_,  _,  _,  K, S, S, S, S, S, S, S, S,  K,  _,  _,  _],  // 3: face
            [_,  _,  _,  K, S, W, K, S, S, K, W, S,  K,  _,  _,  _],  // 4: eyes (angry)
            [_,  _,  _,  K, S, Be,Be,Be,Be,Be,Be,S,  K,  _,  _,  _],  // 5: beard
            [_,  _,  _,  _,  K, Be,Be,Be,Be,Be,Be,K,  _,  _,  _,  _],  // 6: beard
            [_,  K, Sh,K, Vr,Vr,Y, Vr,Vr,Y, Vr,Vr, K, Vb,K, _],  // 7: shoulders + shield + axe handle
            [K,  Sh,Sh,K, Vr,Vr,Y, Vr,Vr,Y, Vr,Vr, K, Vb,K, _],  // 8: chest + shield
            [K,  Sh,Y, K, Vr,Vr,Vr,Vr,Vr,Vr,Vr,Vr, K, Gy,Gy,K],  // 9: chest + shield boss + axe head
            [K,  Sh,Sh,K, Vr,Vr,Y, Vr,Vr,Y, Vr,Vr, K, Gy,Gy,K],  // 10: waist + axe
            [_,  K, Sh,K, Vb,Vb,Y, Vb,Vb,Y, Vb,Vb, K, Vb,K, _],  // 11: belt
            [_,  _,  K, K, Vb,Vb,Vb,K, K, Vb,Vb,Vb, K, K, _,  _],  // 12: pants
            [_,  _,  _,  K, Vb,Vb,Vb,K, K, Vb,Vb,Vb, K, _,  _,  _],  // 13: pants
            [_,  _,  _,  K, F, F, K, _,  _,  K, F, F, K, _,  _,  _],  // 14: fur boots
            [_,  _,  K, K, Sh,Sh,K, _,  _,  K, Sh,Sh,K, K, _,  _],  // 15: boots
        ];
    }

    function renderPixelSprite(pixels, size) {
        const canvas = document.createElement('canvas');
        const s = size || 8; // scale factor: each pixel = s screen pixels
        canvas.width = 16 * s;
        canvas.height = 16 * s;
        const ctx = canvas.getContext('2d');

        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const key = pixels[y][x];
                if (key === '_') continue;
                ctx.fillStyle = P[key];
                ctx.fillRect(x * s, y * s, s, s);
            }
        }
        return canvas;
    }

    function getCharTexture(type, variant) {
        const key = type + variant;
        if (charTexCache[key]) return charTexCache[key];

        const pixels = type === 'viking' ? getVikingPixels(variant) : getWarriorPixels(variant);
        const canvas = renderPixelSprite(pixels, 8);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter; // crisp pixel art, no smoothing
        charTexCache[key] = tex;
        return tex;
    }

    // ─── Create Entities ────────────────────────────────────────────

    function createCharSprite(x, z, type) {
        const variant = Math.floor(Math.random() * 4);
        const tex = getCharTexture(type, variant);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(1.8, 1.8, 1);
        sprite.position.set(x, 0.9, z);
        scene.add(sprite);
        return sprite;
    }

    function createSquadMember(index) {
        const spread = Math.min(squadCount - 1, 5) * 0.8;
        const offsetX = squadCount === 1 ? 0 : -spread / 2 + (index / Math.max(1, squadCount - 1)) * spread;
        const sprite = createCharSprite(aimX + offsetX, DEFENSE_Z + 2, 'warrior');
        sprite.userData = { index, offsetX, phase: Math.random() * Math.PI * 2 };
        return sprite;
    }

    function rebuildSquad() {
        squad.forEach(s => scene.remove(s));
        squad = [];
        for (let i = 0; i < squadCount; i++) {
            squad.push(createSquadMember(i));
        }
    }

    function spawnEnemy(z, hp) {
        const x = (Math.random() - 0.5) * (ARENA_WIDTH - 2);
        const sprite = createCharSprite(x, z, 'viking');
        sprite.userData.hp = hp;
        sprite.userData.maxHp = hp;
        sprite.userData.speed = diff.enemySpeed * (0.8 + Math.random() * 0.4) * (1 + wave * 0.05);
        sprite.userData.wobble = Math.random() * Math.PI * 2;

        // HP label
        const hpSprite = createTextSprite(hp.toString(), '#ffffff', 0.7);
        hpSprite.position.set(x, 2.2, z);
        scene.add(hpSprite);
        sprite.userData.hpSprite = hpSprite;

        enemies.push(sprite);
    }

    function spawnBarrel(z) {
        const x = (Math.random() - 0.5) * (ARENA_WIDTH - 3);
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        // Barrel body
        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.6, 0.7, 1.2, 12),
            MAT.barrel
        );
        body.position.y = 0.6;
        body.castShadow = true;
        group.add(body);

        // Metal rings
        for (const ry of [0.2, 0.6, 1.0]) {
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.63, 0.04, 4, 12),
                MAT.barrelRing
            );
            ring.position.y = ry;
            ring.rotation.x = Math.PI / 2;
            group.add(ring);
        }

        // Determine barrel type
        const types = ['damage', 'fireRate', 'squad', 'coins'];
        const weights = [3, 3, 1, 4];
        let total = weights.reduce((a, b) => a + b);
        let r = Math.random() * total;
        let type = types[0];
        for (let i = 0; i < weights.length; i++) {
            r -= weights[i];
            if (r <= 0) { type = types[i]; break; }
        }

        const hp = Math.ceil((3 + wave * 1.5) * diff.enemyHP);
        const colors = { damage: '#ff4444', fireRate: '#44aaff', squad: '#44ff88', coins: '#ffdd44' };
        const labels = { damage: 'DMG+', fireRate: 'FIRE+', squad: 'ALLY+', coins: 'COINS' };

        // Glow top
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 8, 8),
            new THREE.MeshBasicMaterial({ color: colors[type], transparent: true, opacity: 0.7 })
        );
        glow.position.y = 1.4;
        group.add(glow);

        // Label
        const label = createTextSprite(labels[type], colors[type], 0.6);
        label.position.set(0, 2, 0);
        group.add(label);

        // HP label
        const hpLabel = createTextSprite(hp.toString(), '#ffffff', 0.5);
        hpLabel.position.set(0, 0.6, 0.8);
        group.add(hpLabel);

        group.userData = { hp, maxHp: hp, type, speed: diff.enemySpeed * 0.5, hpLabel, glow };
        scene.add(group);
        barrels.push(group);
    }

    function createBullet(fromX, fromZ) {
        // Always shoot straight forward (negative Z)
        const dir = new THREE.Vector3(0, 0, -1);

        const group = new THREE.Group();
        group.position.set(fromX, 1, fromZ);

        const core = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 6, 6),
            MAT.bullet
        );
        group.add(core);

        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.25, 6, 6),
            MAT.bulletGlow
        );
        group.add(glow);

        group.userData = { dir, damage: bulletDamage, life: 2.5 };
        scene.add(group);
        bullets.push(group);

        SFX.shoot();
    }

    function spawnParticles(x, y, z, color, count) {
        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.15, 0.15),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
            );
            mesh.position.set(x, y, z);
            mesh.userData = {
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * 6,
                    Math.random() * 5 + 2,
                    (Math.random() - 0.5) * 6
                ),
                life: 0.6 + Math.random() * 0.4,
            };
            scene.add(mesh);
            particles.push(mesh);
        }
    }

    function spawnCoinPickup(x, z, amount) {
        const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8),
            MAT.coin
        );
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(x, 1.5, z);
        mesh.userData = { amount, life: 2, vy: 3 };
        scene.add(mesh);
        coinPickups.push(mesh);
    }

    // ─── Text Sprites ───────────────────────────────────────────────
    function createTextSprite(text, color, scale) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color;
        ctx.font = 'bold 72px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 5;
        ctx.strokeText(text, 128, 64);
        ctx.fillText(text, 128, 64);

        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(scale * 2, scale, 1);
        sprite.userData.canvas = canvas;
        sprite.userData.ctx = ctx;
        sprite.userData.tex = tex;
        return sprite;
    }

    function updateSpriteText(sprite, text, color) {
        const { canvas, ctx, tex } = sprite.userData;
        ctx.clearRect(0, 0, 256, 128);
        ctx.fillStyle = color || '#ffffff';
        ctx.font = 'bold 72px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 5;
        ctx.strokeText(text, 128, 64);
        ctx.fillText(text, 128, 64);
        tex.needsUpdate = true;
    }

    // ─── Wave System ────────────────────────────────────────────────
    function startWave() {
        wave++;
        // Exponential enemy scaling — upgrades feel earned but pressure mounts
        const enemyCount = Math.floor((5 + wave * 4 + wave * wave * 0.8) * diff.spawnRate);
        const barrelCount = Math.floor((2 + Math.min(wave * 0.6, 5)) * diff.barrelRate);
        waveEnemiesLeft = enemyCount;
        waveEnemiesTotal = enemyCount;
        waveBarrelsLeft = barrelCount;
        spawnTimer = 0;
        barrelTimer = 0;

        state = 'playing';
        hudEl.style.display = 'flex';
        waveBar.style.display = 'block';

        rebuildSquad();
        updateHUD();
        showActionText('WAVE ' + wave, '#ff6b35');
    }

    function clearEntities() {
        enemies.forEach(e => { scene.remove(e); if (e.userData.hpSprite) scene.remove(e.userData.hpSprite); });
        barrels.forEach(b => scene.remove(b));
        bullets.forEach(b => scene.remove(b));
        particles.forEach(p => scene.remove(p));
        coinPickups.forEach(c => scene.remove(c));
        squad.forEach(s => scene.remove(s));
        enemies = []; barrels = []; bullets = []; particles = []; coinPickups = []; squad = [];
    }

    // ─── Upgrades ───────────────────────────────────────────────────
    const UPGRADE_DEFS = [
        {
            id: 'damage', name: 'Bullet Damage',
            maxLevel: 10,
            cost: lvl => 5 + lvl * 5,
            apply: lvl => { bulletDamage = 1 + lvl; },
            desc: lvl => `DMG ${1 + lvl} → ${2 + lvl}`,
        },
        {
            id: 'fireRate', name: 'Fire Rate',
            maxLevel: 8,
            cost: lvl => 8 + lvl * 6,
            apply: lvl => { fireRate = 2.5 + lvl * 0.8; },
            desc: lvl => `${(2.5 + lvl * 0.8).toFixed(1)} → ${(2.5 + (lvl + 1) * 0.8).toFixed(1)}/s`,
        },
        {
            id: 'squad', name: 'Extra Shooter',
            maxLevel: 5,
            cost: lvl => 15 + lvl * 12,
            apply: lvl => { squadCount = 1 + lvl; },
            desc: lvl => `${1 + lvl} → ${2 + lvl} shooters`,
        },
    ];

    function showUpgradeShop() {
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
            const canAfford = coins >= cost;
            const btn = document.createElement('button');
            btn.className = 'upgrade-btn' + (maxed ? ' maxed' : '');
            btn.innerHTML = `${def.name}<br><small>${maxed ? 'MAXED' : def.desc(lvl)}</small><span class="cost">${maxed ? '' : cost + ' coins'}</span>`;
            if (!maxed && canAfford) {
                btn.addEventListener('click', () => {
                    coins -= cost;
                    upgrades[def.id]++;
                    def.apply(upgrades[def.id]);
                    SFX.upgrade();
                    showUpgradeShop(); // refresh
                });
            } else if (!maxed) {
                btn.style.opacity = '0.5';
            }
            upgradeButtons.appendChild(btn);
        });
    }

    // ─── Effects ────────────────────────────────────────────────────
    function shake(amount) { shakeAmount = Math.max(shakeAmount, amount); }

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
    }

    // ─── Main Update ────────────────────────────────────────────────
    function update(dt) {
        if (state !== 'playing') return;
        const time = Date.now() * 0.001;

        // ── Spawn enemies ──
        // Spawn faster as waves progress, enemies get tankier
        const spawnInterval = Math.max(0.25, 2.0 - wave * 0.15) / diff.spawnRate;
        spawnTimer += dt;
        if (waveEnemiesLeft > 0 && spawnTimer >= spawnInterval) {
            spawnTimer = 0;
            const hp = Math.ceil((2 + wave * 2 + wave * wave * 0.3 + Math.random() * wave) * diff.enemyHP);
            const z = SPAWN_Z_MIN + Math.random() * (SPAWN_Z_MAX - SPAWN_Z_MIN);
            spawnEnemy(z, hp);
            waveEnemiesLeft--;
        }

        // ── Spawn barrels ──
        const barrelInterval = Math.max(1.5, 4 - wave * 0.15) / diff.barrelRate;
        barrelTimer += dt;
        if (waveBarrelsLeft > 0 && barrelTimer >= barrelInterval) {
            barrelTimer = 0;
            const z = SPAWN_Z_MIN + Math.random() * 5;
            spawnBarrel(z);
            waveBarrelsLeft--;
        }

        // ── Move enemies toward defense line ──
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            // Slow steady march + wobble
            e.position.z += e.userData.speed * dt;
            e.position.x += Math.sin(time * 2 + e.userData.wobble) * 0.3 * dt;
            e.position.x = Math.max(-ARENA_WIDTH / 2 + 0.5, Math.min(ARENA_WIDTH / 2 - 0.5, e.position.x));
            e.position.y = 0.9 + Math.abs(Math.sin(time * 3 + e.userData.wobble)) * 0.1;

            // Update HP sprite position
            if (e.userData.hpSprite) {
                e.userData.hpSprite.position.copy(e.position);
                e.userData.hpSprite.position.y += 1.3;
            }

            // Reached defense line?
            if (e.position.z >= DEFENSE_Z) {
                // Remove a squad member
                if (squad.length > 0) {
                    const lost = squad.pop();
                    spawnParticles(lost.position.x, 1, lost.position.z, 0x3377DD, 8);
                    scene.remove(lost);
                    squadCount = Math.max(0, squadCount - 1);
                    upgrades.squad = Math.max(0, upgrades.squad - 1);
                    shake(0.5);
                }

                // Remove enemy
                scene.remove(e);
                if (e.userData.hpSprite) scene.remove(e.userData.hpSprite);
                enemies.splice(i, 1);
                spawnParticles(e.position.x, 1, DEFENSE_Z, 0xff4444, 5);

                if (squadCount <= 0) {
                    doGameOver();
                    return;
                }
            }
        }

        // ── Move barrels ──
        for (let i = barrels.length - 1; i >= 0; i--) {
            const b = barrels[i];
            b.position.z += b.userData.speed * dt;
            // Rotate barrel slightly
            b.rotation.y += dt * 0.5;
            // Glow pulse
            if (b.userData.glow) {
                b.userData.glow.material.opacity = 0.5 + Math.sin(time * 4) * 0.3;
            }

            // Past defense line = lost barrel
            if (b.position.z >= DEFENSE_Z + 3) {
                scene.remove(b);
                barrels.splice(i, 1);
            }
        }

        // ── Fire straight ahead ──
        fireCooldown -= dt;

        if (fireCooldown <= 0 && (enemies.length > 0 || barrels.length > 0)) {
            // Each squad member fires straight forward
            for (const s of squad) {
                createBullet(s.position.x, s.position.z);
            }
            fireCooldown = 1 / fireRate;
        }

        // ── Move bullets ──
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.position.add(b.userData.dir.clone().multiplyScalar(bulletSpeed * dt));
            b.userData.life -= dt;

            if (b.userData.life <= 0 || b.position.z < SPAWN_Z_MIN - 10) {
                scene.remove(b);
                bullets.splice(i, 1);
                continue;
            }

            // Hit enemies (check if bullet is close in X and Z)
            let hit = false;
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j];
                const dx = Math.abs(b.position.x - e.position.x);
                const dz = Math.abs(b.position.z - e.position.z);
                if (dx < 0.9 && dz < 0.9) {
                    e.userData.hp -= b.userData.damage;
                    SFX.hit();

                    if (e.userData.hp <= 0) {
                        // Kill enemy
                        const reward = Math.ceil(e.userData.maxHp * 0.3 * diff.coins);
                        coins += reward;
                        score += e.userData.maxHp;
                        spawnParticles(e.position.x, 1, e.position.z, 0xCC3333, 8);
                        spawnCoinPickup(e.position.x, e.position.z, reward);
                        SFX.enemyDie();
                        scene.remove(e);
                        if (e.userData.hpSprite) scene.remove(e.userData.hpSprite);
                        enemies.splice(j, 1);
                    } else {
                        updateSpriteText(e.userData.hpSprite, e.userData.hp.toString(), '#ffffff');
                    }

                    scene.remove(b);
                    bullets.splice(i, 1);
                    hit = true;
                    break;
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

                    // Update HP label
                    if (br.userData.hp > 0) {
                        updateSpriteText(br.userData.hpLabel, br.userData.hp.toString(), '#ffffff');
                    }

                    if (br.userData.hp <= 0) {
                        // Barrel destroyed — apply reward
                        applyBarrelReward(br.userData.type, br.position.x, br.position.z);
                        spawnParticles(br.position.x, 0.8, br.position.z, 0x8B5E3C, 12);
                        SFX.barrelBreak();
                        scene.remove(br);
                        barrels.splice(j, 1);
                        score += 10;
                    }

                    scene.remove(b);
                    bullets.splice(i, 1);
                    break;
                }
            }
        }

        // ── Animate squad (follows aimX) ──
        squad.forEach(s => {
            s.position.x = aimX + s.userData.offsetX;
            s.position.y = 0.9 + Math.abs(Math.sin(time * 2 + s.userData.phase)) * 0.06;
        });

        // ── Update particles ──
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.position.add(p.userData.vel.clone().multiplyScalar(dt));
            p.userData.vel.y -= 15 * dt;
            p.userData.life -= dt;
            p.material.opacity = Math.max(0, p.userData.life);
            if (p.userData.life <= 0) {
                scene.remove(p);
                particles.splice(i, 1);
            }
        }

        // ── Update coin pickups ──
        for (let i = coinPickups.length - 1; i >= 0; i--) {
            const c = coinPickups[i];
            c.position.y += c.userData.vy * dt;
            c.userData.vy -= 8 * dt;
            c.rotation.y += dt * 5;
            c.userData.life -= dt;
            if (c.userData.life <= 0) {
                scene.remove(c);
                coinPickups.splice(i, 1);
                SFX.coin();
            }
        }

        // ── Camera shake ──
        if (shakeAmount > 0.01) {
            camera.position.x = (Math.random() - 0.5) * shakeAmount * 2;
            camera.position.y = 18 + (Math.random() - 0.5) * shakeAmount;
            shakeAmount *= 0.88;
        } else {
            camera.position.x = 0;
            camera.position.y = 18;
            shakeAmount = 0;
        }

        // ── Wave progress ──
        const killed = waveEnemiesTotal - waveEnemiesLeft - enemies.length;
        const progress = waveEnemiesTotal > 0 ? killed / waveEnemiesTotal : 1;
        waveBarFill.style.width = (progress * 100) + '%';

        updateHUD();

        // ── Check wave complete ──
        if (waveEnemiesLeft <= 0 && enemies.length === 0) {
            SFX.waveClear();
            showUpgradeShop();
        }
    }

    function applyBarrelReward(type, x, z) {
        switch (type) {
            case 'damage':
                bulletDamage += 1;
                showActionText('DMG UP!', '#ff4444');
                break;
            case 'fireRate':
                fireRate = Math.min(fireRate + 0.5, 10);
                showActionText('FIRE RATE UP!', '#44aaff');
                break;
            case 'squad':
                squadCount++;
                upgrades.squad++;
                rebuildSquad();
                showActionText('NEW ALLY!', '#44ff88');
                break;
            case 'coins':
                const amount = Math.ceil((5 + wave * 2) * diff.coins);
                coins += amount;
                spawnCoinPickup(x, z, amount);
                showActionText('+' + amount + ' COINS', '#ffdd44');
                break;
        }
        shake(0.2);
        SFX.upgrade();
    }

    // ─── Game Flow ──────────────────────────────────────────────────
    function startGame() {
        clearEntities();
        state = 'playing';
        wave = 0;
        score = 0;
        coins = 0;
        squadCount = 1;
        bulletDamage = 1;
        fireRate = 2.5;
        bulletSpeed = 30;
        upgrades = { damage: 0, fireRate: 0, squad: 0, range: 0 };

        startScreen.classList.add('hidden');
        startScreen.classList.remove('active');
        gameoverScreen.classList.add('hidden');
        gameoverScreen.classList.remove('active');
        waveScreen.classList.add('hidden');
        waveScreen.classList.remove('active');

        startWave();
    }

    function nextWave() {
        clearEntities();
        waveScreen.classList.add('hidden');
        waveScreen.classList.remove('active');
        startWave();
    }

    function doGameOver() {
        state = 'gameover';
        SFX.gameOver();
        hudEl.style.display = 'none';
        waveBar.style.display = 'none';
        goTitle.textContent = 'OVERRUN';
        goTitle.className = 'lose';
        goWave.textContent = wave;
        goScore.textContent = score;
        gameoverScreen.classList.remove('hidden');
        gameoverScreen.classList.add('active');
    }

    // ─── Input ──────────────────────────────────────────────────────
    // Swipe/drag to move aim position; auto-aim to nearest target
    let dragging = false;
    let lastPointerX = 0;

    function onDown(x) {
        dragging = true;
        lastPointerX = x;
        ensureAudio();
    }
    function onMove(x) {
        if (!dragging) return;
        const dx = x - lastPointerX;
        lastPointerX = x;
        aimX = Math.max(-ARENA_WIDTH / 2, Math.min(ARENA_WIDTH / 2, aimX + dx * 0.04));
    }
    function onUp() { dragging = false; }

    document.addEventListener('mousedown', e => onDown(e.clientX));
    document.addEventListener('mousemove', e => onMove(e.clientX));
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchstart', e => { e.preventDefault(); onDown(e.touches[0].clientX); }, { passive: false });
    document.addEventListener('touchmove', e => { e.preventDefault(); onMove(e.touches[0].clientX); }, { passive: false });
    document.addEventListener('touchend', onUp);

    // Keyboard
    const keys = {};
    document.addEventListener('keydown', e => { keys[e.key] = true; });
    document.addEventListener('keyup', e => { keys[e.key] = false; });

    // ─── Render Loop ────────────────────────────────────────────────
    let lastTime = 0;

    function loop(timestamp) {
        const dt = Math.min((timestamp - (lastTime || timestamp)) / 1000, 0.05);
        lastTime = timestamp;

        // Keyboard aim
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) aimX = Math.max(-ARENA_WIDTH / 2, aimX - 8 * dt);
        if (keys['ArrowRight'] || keys['d'] || keys['D']) aimX = Math.min(ARENA_WIDTH / 2, aimX + 8 * dt);

        update(dt);
        renderer.render(scene, camera);
        requestAnimationFrame(loop);
    }

    // ─── Init ───────────────────────────────────────────────────────
    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-retry').addEventListener('click', startGame);
    document.getElementById('btn-next').addEventListener('click', nextWave);

    initRenderer();
    initArena();
    requestAnimationFrame(loop);
})();
