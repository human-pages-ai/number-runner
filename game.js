// Number Runner — LastTokens
// 3D gates-runner with shooting. Built with leftover AI tokens.

(function () {
    'use strict';

    // ─── Three.js Setup ─────────────────────────────────────────────
    let scene, camera, renderer;
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    function initRenderer() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb);
        scene.fog = new THREE.Fog(0x87ceeb, 40, 120);

        camera = new THREE.PerspectiveCamera(60, W() / H(), 0.1, 500);
        camera.position.set(0, 10, 16);
        camera.lookAt(0, 0, -8);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(W(), H());
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.insertBefore(renderer.domElement, document.body.firstChild);

        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.65);
        scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xffffff, 0.85);
        sun.position.set(8, 20, 10);
        sun.castShadow = true;
        sun.shadow.camera.left = -20;
        sun.shadow.camera.right = 20;
        sun.shadow.camera.top = 20;
        sun.shadow.camera.bottom = -20;
        sun.shadow.mapSize.width = 1024;
        sun.shadow.mapSize.height = 1024;
        scene.add(sun);

        window.addEventListener('resize', () => {
            camera.aspect = W() / H();
            camera.updateProjectionMatrix();
            renderer.setSize(W(), H());
        });
    }

    // ─── DOM ────────────────────────────────────────────────────────
    const startScreen = document.getElementById('start-screen');
    const gameoverScreen = document.getElementById('gameover-screen');
    const goTitle = document.getElementById('go-title');
    const goLevel = document.getElementById('go-level');
    const goScore = document.getElementById('go-score');
    const countDisplay = document.getElementById('count-display');
    const levelDisplay = document.getElementById('level-display');
    const hudEl = document.getElementById('hud');
    const progressEl = document.getElementById('progress');
    const progressFill = document.getElementById('progress-fill');
    const actionText = document.getElementById('action-text');

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
        shoot: () => playNoise(0.02, 0.04),
        hit: () => playTone(80, 0.05, 'sine', 0.1),
        wallBreak: () => { playNoise(0.15, 0.12); playTone(60, 0.15, 'sine', 0.15); },
        gateGood: () => { playTone(800, 0.12, 'sine', 0.12, 1200); },
        gateGreat: () => {
            playTone(523, 0.1, 'sine', 0.1);
            setTimeout(() => playTone(659, 0.1, 'sine', 0.1), 60);
            setTimeout(() => playTone(784, 0.15, 'sine', 0.12), 120);
        },
        gateBad: () => playTone(400, 0.1, 'square', 0.06, 200),
        bossHit: () => playTone(60, 0.1, 'sine', 0.15),
        levelComplete: () => {
            [523, 659, 784, 1047].forEach((f, i) => {
                setTimeout(() => playTone(f, 0.15, 'sine', 0.12), i * 100);
            });
        },
        gameOver: () => {
            [330, 262, 220].forEach((f, i) => {
                setTimeout(() => playTone(f, 0.25, 'sine', 0.1), i * 200);
            });
        },
    };

    // ─── Materials (reusable) ───────────────────────────────────────
    // 5-color palette: blue (player), red (enemy), green (good), soft grey (track), green (grass)
    const MAT = {
        ally: new THREE.MeshStandardMaterial({ color: 0x4A90D9 }),
        allySkin: new THREE.MeshStandardMaterial({ color: 0xffdcb0 }),
        enemy: new THREE.MeshStandardMaterial({ color: 0xE84040 }),
        enemySkin: new THREE.MeshStandardMaterial({ color: 0xffbbaa }),
        gateGood: new THREE.MeshStandardMaterial({ color: 0x2ECC71, transparent: true, opacity: 0.8, emissive: 0x115533, emissiveIntensity: 0.3 }),
        gateGreat: new THREE.MeshStandardMaterial({ color: 0x3498DB, transparent: true, opacity: 0.8, emissive: 0x112255, emissiveIntensity: 0.3 }),
        gateBad: new THREE.MeshStandardMaterial({ color: 0xE74C3C, transparent: true, opacity: 0.8, emissive: 0x551111, emissiveIntensity: 0.3 }),
        wall: new THREE.MeshStandardMaterial({ color: 0xE74C3C }),
        wallDark: new THREE.MeshStandardMaterial({ color: 0xC0392B }),
        boss: new THREE.MeshStandardMaterial({ color: 0xA93226, emissive: 0x330000, emissiveIntensity: 0.4 }),
        ground: new THREE.MeshStandardMaterial({ color: 0x90C695 }),
        track: new THREE.MeshStandardMaterial({ color: 0xE0D8CC }),
        trackLine: new THREE.MeshStandardMaterial({ color: 0xF0EBE0 }),
        trackEdge: new THREE.MeshStandardMaterial({ color: 0xCCC5B8 }),
        bullet: new THREE.MeshBasicMaterial({ color: 0xffee44 }),
        bulletGlow: new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6 }),
        bulletTrail: new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.4 }),
        pillar: new THREE.MeshStandardMaterial({ color: 0xBBBBBB }),
    };

    // ─── Geometries (reusable) ──────────────────────────────────────
    const GEO = {
        body: new THREE.CylinderGeometry(0.25, 0.3, 0.8, 6),
        head: new THREE.SphereGeometry(0.22, 8, 8),
        gun: new THREE.BoxGeometry(0.1, 0.1, 0.4),
        bullet: new THREE.SphereGeometry(0.15, 6, 6),
        bulletTrail: new THREE.CylinderGeometry(0.05, 0.08, 0.6, 4),
        wallBlock: new THREE.BoxGeometry(1, 1, 1),
        gateFrame: new THREE.BoxGeometry(5, 3.5, 0.25),
        pillar: new THREE.CylinderGeometry(0.15, 0.15, 4, 6),
    };

    // ─── Game State ─────────────────────────────────────────────────
    let state = 'menu'; // menu | running | battle | smashing | complete | gameover
    let level = 1;
    let score = 0;
    let crowdCount = 0;
    let crowdX = 0;
    let targetX = 0;
    let distance = 0;
    let levelDist = 0;
    let speed = 0;
    let timescale = 1;
    let timescaleTarget = 1;

    let runners = [];      // player army 3D objects
    let gates = [];         // gate pair groups
    let walls = [];         // wall obstacles
    let enemies = [];       // enemy groups
    let bullets3d = [];     // bullet meshes
    let particles3d = [];   // particle meshes
    let groundTiles = [];

    let bossObj = null;
    let bossHP = 0;
    let bossMaxHP = 0;
    let battleTimer = 0;
    let fireCooldown = 0;

    // Floating crowd count sprite
    let crowdSprite = null;

    // Camera shake
    let shakeAmount = 0;

    // Number animation
    let countAnim = { scale: 1, targetScale: 1, color: null };

    // ─── Level Generation ───────────────────────────────────────────
    function clearLevel() {
        // Remove all dynamic objects
        [...runners, ...bullets3d, ...particles3d].forEach(o => scene.remove(o));
        gates.forEach(g => scene.remove(g.group));
        walls.forEach(w => scene.remove(w.group));
        enemies.forEach(eg => { eg.units.forEach(u => scene.remove(u)); scene.remove(eg.countSprite); });
        if (bossObj) scene.remove(bossObj);
        if (crowdSprite) scene.remove(crowdSprite);
        runners = []; gates = []; walls = []; enemies = [];
        bullets3d = []; particles3d = [];
        bossObj = null;
        crowdSprite = null;
    }

    function generateLevel(lvl) {
        clearLevel();

        speed = 0.38 + lvl * 0.025;
        crowdCount = 2 + Math.floor(lvl / 3);
        crowdX = 0;
        targetX = 0;
        distance = 0;
        fireCooldown = 0;
        timescale = 1;
        timescaleTarget = 1;

        // Large floating crowd count above player
        crowdSprite = createTextSprite(crowdCount.toString(), '#ffffff', 3, true);
        crowdSprite.position.set(0, 4, 0);
        scene.add(crowdSprite);

        const segments = 7 + Math.floor(lvl * 1.5);
        let z = -20;

        for (let i = 0; i < segments; i++) {
            if (i % 2 === 0) {
                // Gate pair
                const pair = createGatePair(z, lvl);
                gates.push(pair);
            } else {
                // Wall with enemies
                const hp = Math.floor((10 + lvl * 6) * (0.7 + Math.random() * 0.6));
                const wall = createWall(z, hp);
                walls.push(wall);

                // Enemy group in front of wall
                const enemyCount = Math.min(Math.ceil(hp / 4), 15);
                const eg = createEnemyGroup(z + 3, enemyCount, lvl);
                enemies.push(eg);
            }
            z -= 18;
        }

        // Boss
        bossMaxHP = Math.floor(40 + lvl * 25 + lvl * lvl * 2);
        bossHP = bossMaxHP;
        bossObj = createBoss(z - 15);

        levelDist = Math.abs(z - 15) + 30;

        updateRunners();
        updateHUD();
    }

    // ─── Create Entities ────────────────────────────────────────────
    function createRunner(x, z, isEnemy) {
        const g = new THREE.Group();

        // Simple capsule body (pill shape) — genre standard
        const bodyMat = isEnemy ? MAT.enemy : MAT.ally;
        const body = new THREE.Mesh(GEO.body, bodyMat);
        body.position.y = 0.5;
        body.castShadow = true;
        g.add(body);

        // Head (same color as body for blob look at distance)
        const head = new THREE.Mesh(GEO.head, isEnemy ? MAT.enemySkin : MAT.allySkin);
        head.position.y = 1.0;
        head.castShadow = true;
        g.add(head);

        g.position.set(x, 0, z);
        g.userData = {
            baseX: x, baseZ: z,
            phase: Math.random() * Math.PI * 2,
            isEnemy, dead: false
        };

        scene.add(g);
        return g;
    }

    function updateRunners() {
        const target = Math.min(Math.round(crowdCount), 80);
        while (runners.length < target) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * Math.min(3.5, Math.sqrt(runners.length + 1) * 0.6);
            runners.push(createRunner(Math.cos(a) * r, Math.sin(a) * r, false));
        }
        while (runners.length > target) {
            scene.remove(runners.pop());
        }
    }

    function createGatePair(z, lvl) {
        const group = new THREE.Group();
        group.position.z = z;

        // Generate operations
        let leftOp, rightOp;
        if (Math.random() < 0.5) {
            const m = Math.random() < 0.25 + lvl * 0.02 ? 3 : 2;
            leftOp = { op: 'x', val: m, label: '×' + m };
        } else {
            const a = 3 + Math.floor(Math.random() * (4 + lvl * 2));
            leftOp = { op: '+', val: a, label: '+' + a };
        }

        const r = Math.random();
        if (r < 0.3) {
            const s = 2 + Math.floor(Math.random() * (2 + lvl));
            rightOp = { op: '-', val: s, label: '-' + s };
        } else if (r < 0.55) {
            rightOp = { op: '/', val: 2, label: '÷2' };
        } else if (r < 0.75) {
            const a = 1 + Math.floor(Math.random() * 4);
            rightOp = { op: '+', val: a, label: '+' + a };
        } else {
            rightOp = { op: 'x', val: 2, label: '×2' };
        }

        if (Math.random() < 0.5) { const tmp = leftOp; leftOp = rightOp; rightOp = tmp; }

        // Create gate meshes
        const leftGate = createGateMesh(leftOp, -3);
        const rightGate = createGateMesh(rightOp, 3);
        group.add(leftGate);
        group.add(rightGate);

        // Pillars
        [-5.5, 0, 5.5].forEach(px => {
            const p = new THREE.Mesh(GEO.pillar, MAT.pillar);
            p.position.set(px, 2, 0);
            p.castShadow = true;
            group.add(p);
        });

        // Top bar
        const topBar = new THREE.Mesh(
            new THREE.BoxGeometry(11, 0.3, 0.3),
            MAT.pillar
        );
        topBar.position.set(0, 4, 0);
        group.add(topBar);

        scene.add(group);

        return {
            group, z, leftOp, rightOp,
            passed: false,
        };
    }

    function createGateMesh(op, xPos) {
        const isGood = op.op === '+' || op.op === 'x';
        const isGreat = op.op === 'x' && op.val >= 3;
        const mat = isGreat ? MAT.gateGreat : isGood ? MAT.gateGood : MAT.gateBad;

        const g = new THREE.Group();
        const frame = new THREE.Mesh(GEO.gateFrame, mat);
        frame.position.set(0, 1.75, 0);
        g.add(frame);

        // Text sprite
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = isGreat ? '#7c3aed' : isGood ? '#00aa44' : '#cc3333';
        ctx.fillRect(0, 0, 256, 128);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 80px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(op.label, 128, 64);

        const tex = new THREE.CanvasTexture(canvas);
        const textMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(4, 2),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true })
        );
        textMesh.position.set(0, 2, 0.15);
        g.add(textMesh);

        g.position.x = xPos;
        return g;
    }

    function createWall(z, hp) {
        const group = new THREE.Group();
        group.position.z = z;

        // Build wall from blocks
        const cols = 8;
        const rows = 3;
        for (let r = 0; r < rows; r++) {
            const offset = r % 2 === 0 ? 0 : 0.5;
            for (let c = 0; c < cols; c++) {
                const block = new THREE.Mesh(GEO.wallBlock, MAT.wall);
                block.position.set(-3.5 + c + offset, 0.5 + r, 0);
                block.castShadow = true;
                group.add(block);
            }
        }

        // Number sprite
        const sprite = createTextSprite(hp.toString(), '#ffffff', 1.5);
        sprite.position.set(0, 1.5, 0.6);
        group.add(sprite);

        scene.add(group);

        return { group, z, hp, maxHp: hp, sprite, smashed: false };
    }

    function createEnemyGroup(z, count, lvl) {
        const units = [];
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * Math.min(3, Math.sqrt(count) * 0.6);
            const unit = createRunner(Math.cos(a) * r, z + Math.sin(a) * r - 2, true);
            units.push(unit);
        }

        const sprite = createTextSprite(count.toString(), '#ff6666', 0.8);
        sprite.position.set(0, 2.5, z - 1);
        scene.add(sprite);

        return { units, z, alive: count, countSprite: sprite, wallIndex: walls.length - 1 };
    }

    function createBoss(z) {
        const group = new THREE.Group();
        group.position.z = z;

        // Large boss body
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(10, 5, 2),
            MAT.boss
        );
        body.position.y = 2.5;
        body.castShadow = true;
        group.add(body);

        // Eyes
        const eyeGeo = new THREE.SphereGeometry(0.5, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfeca57 });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-1.5, 3.2, 1.1);
        group.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(1.5, 3.2, 1.1);
        group.add(rightEye);

        // Pupils
        const pupilGeo = new THREE.SphereGeometry(0.2, 6, 6);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const lp = new THREE.Mesh(pupilGeo, pupilMat);
        lp.position.set(-1.5, 3.2, 1.5);
        group.add(lp);
        const rp = new THREE.Mesh(pupilGeo, pupilMat);
        rp.position.set(1.5, 3.2, 1.5);
        group.add(rp);

        // Mouth (jagged teeth)
        for (let i = 0; i < 6; i++) {
            const tooth = new THREE.Mesh(
                new THREE.ConeGeometry(0.2, 0.5, 3),
                new THREE.MeshStandardMaterial({ color: 0xffffff })
            );
            tooth.position.set(-2 + i * 0.8, 1.8 + (i % 2 === 0 ? 0 : 0.2), 1.1);
            tooth.rotation.x = Math.PI;
            group.add(tooth);
        }

        // HP text
        const sprite = createTextSprite(bossMaxHP.toString(), '#ffffff', 2);
        sprite.position.set(0, 0.5, 1.5);
        group.add(sprite);
        group.userData = { hpSprite: sprite };

        scene.add(group);
        return group;
    }

    function createTextSprite(text, color, scale, large) {
        const canvas = document.createElement('canvas');
        const w = large ? 512 : 256;
        const h = large ? 256 : 128;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color;
        ctx.font = large ? 'bold 180px system-ui' : 'bold 90px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = large ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)';
        ctx.lineWidth = large ? 12 : 6;
        ctx.strokeText(text, w / 2, h / 2);
        ctx.fillText(text, w / 2, h / 2);

        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(scale * 2, scale, 1);
        sprite.userData = { canvas, ctx, tex, large: !!large };
        return sprite;
    }

    function updateSpriteText(sprite, text, color) {
        const { canvas, ctx, tex, large } = sprite.userData;
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = color || '#ffffff';
        ctx.font = large ? 'bold 180px system-ui' : 'bold 90px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = large ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)';
        ctx.lineWidth = large ? 12 : 6;
        ctx.strokeText(text, w / 2, h / 2);
        ctx.fillText(text, w / 2, h / 2);
        tex.needsUpdate = true;
    }

    // ─── Ground ─────────────────────────────────────────────────────
    function initGround() {
        groundTiles.forEach(t => scene.remove(t));
        groundTiles = [];

        // Wide grass ground
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(60, 600),
            MAT.ground
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.z = -250;
        ground.receiveShadow = true;
        scene.add(ground);
        groundTiles.push(ground);

        // Wider track (warm beige)
        const track = new THREE.Mesh(
            new THREE.PlaneGeometry(12, 600),
            MAT.track
        );
        track.rotation.x = -Math.PI / 2;
        track.position.y = 0.01;
        track.position.z = -250;
        track.receiveShadow = true;
        scene.add(track);
        groundTiles.push(track);

        // Track edge strips
        [-6.1, 6.1].forEach(x => {
            const edge = new THREE.Mesh(
                new THREE.PlaneGeometry(0.25, 600),
                MAT.trackEdge
            );
            edge.rotation.x = -Math.PI / 2;
            edge.position.set(x, 0.015, -250);
            scene.add(edge);
            groundTiles.push(edge);
        });

        // Subtle center dashes (no solid line — just track color contrast)
        const centerLine = new THREE.Mesh(
            new THREE.PlaneGeometry(0.12, 600),
            MAT.trackLine
        );
        centerLine.rotation.x = -Math.PI / 2;
        centerLine.position.y = 0.02;
        centerLine.position.z = -250;
        scene.add(centerLine);
        groundTiles.push(centerLine);
    }

    // ─── Shooting ───────────────────────────────────────────────────
    function findTarget() {
        // Find nearest enemy or wall ahead
        let best = null;
        let bestDist = Infinity;

        for (const eg of enemies) {
            if (eg.alive <= 0) continue;
            const dz = -(eg.z - distance * (1 / speed));
            if (dz > 2 && dz < 40 && dz < bestDist) {
                bestDist = dz;
                best = { type: 'enemy', eg };
            }
        }

        for (const w of walls) {
            if (w.smashed) continue;
            const wz = w.group.position.z;
            if (wz < -2 && wz > -40 && -wz < bestDist) {
                bestDist = -wz;
                best = { type: 'wall', wall: w };
            }
        }

        if (bossObj && bossHP > 0) {
            const bz = bossObj.position.z;
            if (bz < 0 && bz > -50 && -bz < bestDist) {
                best = { type: 'boss' };
            }
        }

        return best;
    }

    function fireBullets(dt) {
        fireCooldown -= dt;
        if (fireCooldown > 0 || runners.length === 0) return;

        const target = findTarget();
        if (!target) return;

        const shotsPerSec = Math.min(3 + crowdCount * 0.4, 15);
        fireCooldown = 1 / shotsPerSec;

        const count = Math.min(Math.ceil(crowdCount / 4), 4);
        for (let i = 0; i < count; i++) {
            const r = runners[Math.floor(Math.random() * runners.length)];
            if (!r) continue;

            // Bullet group: bright core + glow halo + trail
            const bulletGroup = new THREE.Group();

            // Core (bright yellow)
            const core = new THREE.Mesh(GEO.bullet, MAT.bullet);
            bulletGroup.add(core);

            // Glow halo (larger, transparent)
            const glow = new THREE.Mesh(
                new THREE.SphereGeometry(0.3, 6, 6),
                MAT.bulletGlow
            );
            bulletGroup.add(glow);

            // Trail cylinder
            const trail = new THREE.Mesh(GEO.bulletTrail, MAT.bulletTrail);
            trail.rotation.x = Math.PI / 2;
            trail.position.z = 0.35;
            bulletGroup.add(trail);

            bulletGroup.position.copy(r.position);
            bulletGroup.position.y += 0.8;

            let targetPos;
            if (target.type === 'enemy') {
                const alive = target.eg.units.filter(u => !u.userData.dead);
                if (alive.length > 0) {
                    const t = alive[Math.floor(Math.random() * alive.length)];
                    targetPos = t.position.clone();
                } else continue;
            } else if (target.type === 'wall') {
                targetPos = target.wall.group.position.clone();
                targetPos.y = 1.5;
                targetPos.x += (Math.random() - 0.5) * 4;
            } else {
                targetPos = bossObj.position.clone();
                targetPos.y = 2.5;
                targetPos.x += (Math.random() - 0.5) * 4;
            }

            const dir = targetPos.sub(bulletGroup.position).normalize();
            // Orient bullet toward target
            bulletGroup.lookAt(bulletGroup.position.clone().add(dir));

            bulletGroup.userData = {
                vel: dir.multiplyScalar(40),
                life: 2.0,
                target: target.type,
            };

            scene.add(bulletGroup);
            bullets3d.push(bulletGroup);

            if (Math.random() < 0.3) SFX.shoot();
        }
    }

    function updateBullets(dt) {
        for (let i = bullets3d.length - 1; i >= 0; i--) {
            const b = bullets3d[i];
            b.position.add(b.userData.vel.clone().multiplyScalar(dt));
            b.userData.life -= dt;

            // Pulse the glow
            if (b.children && b.children[1]) {
                const s = 0.8 + Math.sin(Date.now() * 0.03 + i) * 0.3;
                b.children[1].scale.setScalar(s);
            }

            if (b.userData.life <= 0) {
                scene.remove(b);
                bullets3d.splice(i, 1);
                continue;
            }

            let hit = false;

            // Check enemy hits
            for (const eg of enemies) {
                if (eg.alive <= 0) continue;
                for (const u of eg.units) {
                    if (u.userData.dead) continue;
                    if (b.position.distanceTo(u.position) < 0.8) {
                        u.userData.dead = true;
                        scene.remove(u);
                        eg.alive--;
                        updateSpriteText(eg.countSprite, eg.alive.toString(), '#ff6666');

                        spawnParticles(u.position, 0xcc2222, 5);
                        SFX.hit();

                        // Damage associated wall
                        if (eg.wallIndex >= 0 && eg.wallIndex < walls.length) {
                            const w = walls[eg.wallIndex];
                            if (!w.smashed) {
                                w.hp = Math.max(0, w.hp - 1);
                                updateSpriteText(w.sprite, w.hp.toString(), '#ffffff');
                                if (w.hp <= 0) smashWall(w);
                            }
                        }
                        hit = true;
                        break;
                    }
                }
                if (hit) break;
            }

            // Check gate hits — shooting gates changes their values!
            if (!hit) {
                for (const g of gates) {
                    if (g.passed) continue;
                    const gp = g.group.position;
                    if (Math.abs(b.position.z - gp.z) < 0.8 && b.position.y < 4.5) {
                        // Which gate did we hit? Left (x < 0) or right (x > 0)?
                        const bx = b.position.x;
                        let hitOp = null;
                        let side = null;
                        if (bx < 0 && bx > -5.5) { hitOp = g.leftOp; side = 'left'; }
                        else if (bx > 0 && bx < 5.5) { hitOp = g.rightOp; side = 'right'; }

                        if (hitOp) {
                            const isGood = hitOp.op === '+' || hitOp.op === 'x';
                            if (isGood) {
                                // Shooting good gates increases their value
                                if (hitOp.op === '+') {
                                    hitOp.val += 1;
                                    hitOp.label = '+' + hitOp.val;
                                } else if (hitOp.op === 'x') {
                                    // Small chance to increment multiplier
                                    if (Math.random() < 0.15) {
                                        hitOp.val = Math.min(hitOp.val + 1, 5);
                                        hitOp.label = '×' + hitOp.val;
                                    }
                                }
                                spawnParticles(b.position, 0x00ff88, 4);
                            } else {
                                // Shooting bad gates reduces their penalty
                                if (hitOp.op === '-') {
                                    hitOp.val = Math.max(0, hitOp.val - 1);
                                    hitOp.label = hitOp.val === 0 ? '±0' : '-' + hitOp.val;
                                } else if (hitOp.op === '/') {
                                    // Chance to neutralize divide
                                    if (Math.random() < 0.2) {
                                        hitOp.op = '+'; hitOp.val = 1; hitOp.label = '+1';
                                    }
                                }
                                spawnParticles(b.position, 0xff8844, 4);
                            }

                            // Update the gate's text visually
                            const gateGroup = side === 'left' ? g.group.children[0] : g.group.children[1];
                            if (gateGroup) {
                                // Find the text mesh (PlaneGeometry child)
                                gateGroup.traverse(child => {
                                    if (child.material && child.material.map) {
                                        const c = child.material.map.image.getContext('2d');
                                        const isG = hitOp.op === '+' || hitOp.op === 'x';
                                        const isGr = hitOp.op === 'x' && hitOp.val >= 3;
                                        c.clearRect(0, 0, 256, 128);
                                        c.fillStyle = isGr ? '#7c3aed' : isG ? '#00aa44' : '#cc3333';
                                        c.fillRect(0, 0, 256, 128);
                                        c.fillStyle = '#ffffff';
                                        c.font = 'bold 80px system-ui';
                                        c.textAlign = 'center';
                                        c.textBaseline = 'middle';
                                        c.fillText(hitOp.label, 128, 64);
                                        child.material.map.needsUpdate = true;
                                    }
                                });
                            }

                            hit = true;
                            break;
                        }
                    }
                }
            }

            // Check wall hits
            if (!hit) {
                for (const w of walls) {
                    if (w.smashed) continue;
                    const wp = w.group.position;
                    if (Math.abs(b.position.z - wp.z) < 1 &&
                        Math.abs(b.position.x - wp.x) < 4 &&
                        b.position.y < 4) {
                        w.hp = Math.max(0, w.hp - 1);
                        updateSpriteText(w.sprite, w.hp.toString(), '#ffffff');
                        spawnParticles(b.position, 0xcc4444, 3);
                        if (w.hp <= 0) smashWall(w);
                        hit = true;
                        break;
                    }
                }
            }

            // Check boss hits
            if (!hit && bossObj && bossHP > 0) {
                const bp = bossObj.position;
                if (Math.abs(b.position.z - bp.z) < 1.5 &&
                    Math.abs(b.position.x - bp.x) < 5 &&
                    b.position.y < 6) {
                    bossHP = Math.max(0, bossHP - 1);
                    updateSpriteText(bossObj.userData.hpSprite, Math.ceil(bossHP).toString(), '#ffffff');
                    spawnParticles(b.position, 0xfeca57, 3);
                    SFX.bossHit();
                    if (bossHP <= 0) {
                        defeatBoss();
                    }
                    hit = true;
                }
            }

            if (hit) {
                scene.remove(b);
                bullets3d.splice(i, 1);
            }
        }
    }

    function smashWall(w) {
        w.smashed = true;
        score += w.maxHp * 10;
        spawnParticles(w.group.position.clone().setY(1.5), 0xcc4444, 20);
        SFX.wallBreak();
        shake(0.3);

        // Animate wall falling apart
        w.group.children.forEach(child => {
            if (child.isMesh && child.geometry === GEO.wallBlock) {
                const vx = (Math.random() - 0.5) * 8;
                const vy = 3 + Math.random() * 5;
                const vz = (Math.random() - 0.5) * 4;
                animateDebris(child, w.group, vx, vy, vz);
            }
        });

        setTimeout(() => { scene.remove(w.group); }, 1500);
    }

    function animateDebris(mesh, parent, vx, vy, vz) {
        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);
        parent.remove(mesh);
        mesh.position.copy(worldPos);
        scene.add(mesh);

        const startTime = Date.now();
        function animStep() {
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 1.5) { scene.remove(mesh); return; }
            mesh.position.x += vx * 0.016;
            mesh.position.y += (vy - 9.8 * elapsed) * 0.016;
            mesh.position.z += vz * 0.016;
            mesh.rotation.x += 0.1;
            mesh.rotation.z += 0.05;
            requestAnimationFrame(animStep);
        }
        animStep();
    }

    function defeatBoss() {
        score += bossMaxHP * 20;
        spawnParticles(bossObj.position.clone().setY(2.5), 0xfeca57, 40);
        spawnParticles(bossObj.position.clone().setY(2.5), 0xff6b9d, 30);
        shake(0.8);
        SFX.levelComplete();

        showActionText('LEVEL COMPLETE!', '#51cf66');

        // Slow-mo
        timescaleTarget = 0.3;
        setTimeout(() => { timescaleTarget = 1; }, 800);

        state = 'complete';
        setTimeout(() => {
            level++;
            startLevel();
        }, 2500);
    }

    // ─── Particles ──────────────────────────────────────────────────
    function spawnParticles(pos, color, count) {
        for (let i = 0; i < count; i++) {
            const geo = new THREE.SphereGeometry(0.08 + Math.random() * 0.1, 4, 4);
            const mat = new THREE.MeshBasicMaterial({ color });
            const p = new THREE.Mesh(geo, mat);
            p.position.copy(pos);
            p.userData = {
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * 6,
                    2 + Math.random() * 5,
                    (Math.random() - 0.5) * 6
                ),
                life: 0.6 + Math.random() * 0.4,
            };
            scene.add(p);
            particles3d.push(p);
        }
    }

    function updateParticles(dt) {
        for (let i = particles3d.length - 1; i >= 0; i--) {
            const p = particles3d[i];
            p.position.add(p.userData.vel.clone().multiplyScalar(dt));
            p.userData.vel.y -= 12 * dt;
            p.userData.life -= dt;
            p.material.opacity = Math.max(0, p.userData.life / 0.8);
            p.material.transparent = true;
            if (p.userData.life <= 0) {
                scene.remove(p);
                particles3d.splice(i, 1);
            }
        }
    }

    // ─── Effects ────────────────────────────────────────────────────
    function shake(amount) { shakeAmount = Math.max(shakeAmount, amount); }

    function showActionText(text, color) {
        actionText.textContent = text;
        actionText.style.color = color || '#fff';
        actionText.classList.add('show');
        setTimeout(() => actionText.classList.remove('show'), 1500);
    }

    function updateHUD() {
        countDisplay.textContent = Math.round(crowdCount);
        levelDisplay.textContent = level;
    }

    // ─── Gate Logic ─────────────────────────────────────────────────
    function applyGate(op) {
        const old = crowdCount;
        switch (op.op) {
            case '+': crowdCount += op.val; break;
            case '-': crowdCount = Math.max(1, crowdCount - op.val); break;
            case 'x': crowdCount *= op.val; break;
            case '/': crowdCount = Math.max(1, Math.ceil(crowdCount / op.val)); break;
        }
        crowdCount = Math.min(crowdCount, 999);
        const diff = crowdCount - old;

        if (diff > 0) {
            if (op.op === 'x' && op.val >= 3) {
                SFX.gateGreat();
                showActionText(op.label + '!', '#a78bfa');
                timescaleTarget = 0.4;
                setTimeout(() => { timescaleTarget = 1; }, 200);
                shake(0.4);
            } else {
                SFX.gateGood();
                shake(0.15);
            }
            // Haptic
            if (navigator.vibrate) navigator.vibrate(30);
        } else {
            SFX.gateBad();
            shake(0.25);
            if (navigator.vibrate) navigator.vibrate([20, 20, 40]);
        }

        updateRunners();
        updateHUD();

        // Number animation
        countAnim.scale = 1.5;
        countAnim.targetScale = 1;
        countAnim.color = diff > 0 ? '#51cf66' : '#ff6b6b';
        countAnim.colorTimer = 0.4;

        return diff;
    }

    // ─── Main Update ────────────────────────────────────────────────
    function update(dt) {
        if (state === 'menu' || state === 'gameover') return;

        // Timescale
        timescale += (timescaleTarget - timescale) * Math.min(1, dt * 8);
        dt *= timescale;

        // Smooth crowd movement
        crowdX += (targetX - crowdX) * 0.1;

        if (state === 'running' || state === 'complete') {
            // Move everything toward camera (world scrolls, player stays at z=0)
            const moveZ = speed * dt * 60;

            gates.forEach(g => g.group.position.z += moveZ);
            walls.forEach(w => { if (!w.smashed) w.group.position.z += moveZ; });
            enemies.forEach(eg => {
                eg.units.forEach(u => { if (!u.userData.dead) u.position.z += moveZ; });
                eg.countSprite.position.z += moveZ;
            });
            if (bossObj) bossObj.position.z += moveZ;

            distance += moveZ;

            // Progress
            const prog = Math.min(distance / levelDist, 1);
            progressFill.style.width = (prog * 100) + '%';

            if (state === 'running') {
                // Shooting
                fireBullets(dt);
                updateBullets(dt);

                // Gate collisions
                for (const g of gates) {
                    if (g.passed) continue;
                    if (g.group.position.z > -0.5 && g.group.position.z < 1) {
                        g.passed = true;
                        // Which side?
                        const op = crowdX < 0 ? g.leftOp : g.rightOp;
                        applyGate(op);
                        // Fade out the gate
                        g.group.visible = false;
                    }
                }

                // Wall collisions (if player reaches wall that isn't smashed)
                for (const w of walls) {
                    if (w.smashed) continue;
                    if (w.group.position.z > -0.5 && w.group.position.z < 1) {
                        // Smash through — costs HP
                        const damage = w.hp;
                        crowdCount -= damage;
                        w.smashed = true;
                        smashWall(w);

                        if (crowdCount <= 0) {
                            crowdCount = 0;
                            doGameOver();
                            return;
                        }
                        updateRunners();
                        updateHUD();
                    }
                }

                // Boss collision
                if (bossObj && bossHP > 0 && bossObj.position.z > -3) {
                    state = 'smashing';
                    battleTimer = 0;
                }
            }
        }

        if (state === 'smashing' && bossObj) {
            battleTimer += dt;
            fireBullets(dt);
            updateBullets(dt);

            // Contact drain
            const drain = Math.max(bossMaxHP / 3, crowdCount * 2) * dt;
            const actual = Math.min(drain, bossHP, crowdCount);
            bossHP -= actual;
            crowdCount -= actual * 0.3;
            crowdCount = Math.max(0, Math.round(crowdCount));
            bossHP = Math.max(0, bossHP);

            updateSpriteText(bossObj.userData.hpSprite, Math.ceil(bossHP).toString(), '#ffffff');
            updateRunners();
            updateHUD();

            if (Math.random() < 0.4) {
                const bp = bossObj.position.clone();
                bp.x += (Math.random() - 0.5) * 6;
                bp.y = 1 + Math.random() * 3;
                spawnParticles(bp, 0xff6348, 2);
            }
            shake(0.1);

            if (bossHP <= 0) defeatBoss();
            else if (crowdCount <= 0) doGameOver();
        }

        // Animate runners
        const time = Date.now() * 0.01;
        runners.forEach(r => {
            const spread = 1 + runners.length * 0.008;
            r.position.x = crowdX + r.userData.baseX * spread;
            r.position.z = r.userData.baseZ * spread * 0.5;
            r.position.y = Math.abs(Math.sin(time + r.userData.phase)) * 0.12;
        });

        // Update floating crowd number
        if (crowdSprite) {
            crowdSprite.position.x = crowdX;
            crowdSprite.position.y = 3.5 + Math.sin(time * 0.3) * 0.15;
            // Color timer — flash green/red then back to white
            if (countAnim.colorTimer > 0) {
                countAnim.colorTimer -= dt;
                if (countAnim.colorTimer <= 0) countAnim.color = '#ffffff';
            }
            const displayCount = Math.round(crowdCount);
            const color = countAnim.color || '#ffffff';
            if (crowdSprite.userData.lastText !== displayCount.toString() || crowdSprite.userData.lastColor !== color) {
                updateSpriteText(crowdSprite, displayCount.toString(), color);
                crowdSprite.userData.lastText = displayCount.toString();
                crowdSprite.userData.lastColor = color;
            }
            // Punch scale animation
            const s = countAnim.scale * 3;
            crowdSprite.scale.set(s * 2, s, 1);
        }

        // Animate enemy units
        enemies.forEach(eg => {
            eg.units.forEach(u => {
                if (u.userData.dead) return;
                u.position.y = Math.abs(Math.sin(time + u.userData.phase)) * 0.08;
            });
        });

        // Boss pulse
        if (bossObj && bossHP > 0) {
            const pulse = Math.sin(Date.now() * 0.005) * 0.1;
            bossObj.scale.setScalar(1 + pulse);
        }

        // Particles
        updateParticles(dt);

        // Camera shake
        if (shakeAmount > 0.01) {
            camera.position.x = (Math.random() - 0.5) * shakeAmount * 2;
            camera.position.y = 10 + (Math.random() - 0.5) * shakeAmount;
            shakeAmount *= 0.9;
        } else {
            camera.position.x = 0;
            camera.position.y = 10;
            shakeAmount = 0;
        }

        // Number animation
        countAnim.scale += (countAnim.targetScale - countAnim.scale) * 0.15;
    }

    // ─── Input ──────────────────────────────────────────────────────
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
        targetX = Math.max(-4.5, Math.min(4.5, targetX + dx * 0.03));
    }
    function onUp() { dragging = false; }

    document.addEventListener('mousedown', e => onDown(e.clientX));
    document.addEventListener('mousemove', e => onMove(e.clientX));
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchstart', e => { e.preventDefault(); onDown(e.touches[0].clientX); }, { passive: false });
    document.addEventListener('touchmove', e => { e.preventDefault(); onMove(e.touches[0].clientX); }, { passive: false });
    document.addEventListener('touchend', e => { e.preventDefault(); onUp(); }, { passive: false });

    // Keyboard
    const keys = {};
    window.addEventListener('keydown', e => { keys[e.key] = true; });
    window.addEventListener('keyup', e => { keys[e.key] = false; });

    // ─── Game Lifecycle ─────────────────────────────────────────────
    function startLevel() {
        state = 'running';
        generateLevel(level);
        initGround();

        hudEl.style.display = 'flex';
        progressEl.style.display = 'block';
        progressFill.style.width = '0%';
        startScreen.classList.add('hidden');
        startScreen.classList.remove('active');
        gameoverScreen.classList.add('hidden');
        gameoverScreen.classList.remove('active');
    }

    function startGame() {
        level = 1;
        score = 0;
        startLevel();
    }

    function doGameOver() {
        state = 'gameover';
        SFX.gameOver();
        hudEl.style.display = 'none';
        progressEl.style.display = 'none';
        goTitle.textContent = 'GAME OVER';
        goTitle.className = 'lose';
        goLevel.textContent = level;
        goScore.textContent = score;
        gameoverScreen.classList.remove('hidden');
        gameoverScreen.classList.add('active');
    }

    // ─── Render Loop ────────────────────────────────────────────────
    let lastTime = 0;

    function loop(timestamp) {
        const dt = Math.min((timestamp - (lastTime || timestamp)) / 1000, 0.05);
        lastTime = timestamp;

        // Keyboard
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) targetX = Math.max(-4.5, targetX - 0.15);
        if (keys['ArrowRight'] || keys['d'] || keys['D']) targetX = Math.min(4.5, targetX + 0.15);

        update(dt);
        renderer.render(scene, camera);
        requestAnimationFrame(loop);
    }

    // ─── Init ───────────────────────────────────────────────────────
    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-retry').addEventListener('click', startGame);

    initRenderer();
    initGround();
    requestAnimationFrame(loop);
})();
