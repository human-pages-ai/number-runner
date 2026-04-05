// Math Swarm Survivor — LastTokens
// Lane-runner with upgrade gates, instanced rendering for 200+ zombie swarms.

(function () {
    'use strict';

    // ─── Three.js Setup ─────────────────────────────────────────────
    let scene, camera, renderer, composer;
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    function initRenderer() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);
        scene.fog = new THREE.FogExp2(0x1a1a2e, 0.012);

        camera = new THREE.PerspectiveCamera(55, W() / H(), 0.1, 300);
        camera.position.set(0, 16, 12);
        camera.lookAt(0, 0, -8);

        renderer = new THREE.WebGLRenderer({ antialias: false });
        renderer.setSize(W(), H());
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.9;
        document.body.insertBefore(renderer.domElement, document.body.firstChild);

        try {
            if (THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass) {
                composer = new THREE.EffectComposer(renderer);
                composer.addPass(new THREE.RenderPass(scene, camera));
                const bloomPass = new THREE.UnrealBloomPass(
                    new THREE.Vector2(W(), H()), 0.35, 0.4, 0.9
                );
                composer.addPass(bloomPass);
            }
        } catch (e) {
            console.warn('Bloom unavailable:', e);
            composer = null;
        }

        scene.add(new THREE.AmbientLight(0x667788, 0.6));
        scene.add(new THREE.HemisphereLight(0x4466aa, 0x443322, 0.5));

        const sun = new THREE.DirectionalLight(0xffeedd, 0.7);
        sun.position.set(5, 20, 10);
        scene.add(sun);

        window.addEventListener('resize', () => {
            camera.aspect = W() / H();
            camera.updateProjectionMatrix();
            renderer.setSize(W(), H());
            if (composer) composer.setSize(W(), H());
            if (overlayCanvas) {
                overlayCanvas.width = W();
                overlayCanvas.height = H();
            }
        });
    }

    // ─── DOM ────────────────────────────────────────────────────────
    const startScreen = document.getElementById('start-screen');
    const gameoverScreen = document.getElementById('gameover-screen');
    const goTitle = document.getElementById('go-title');
    const goWave = document.getElementById('go-wave');
    const goScore = document.getElementById('go-score');
    const distDisplay = document.getElementById('wave-display');
    const squadDisplay = document.getElementById('squad-display');
    const coinDisplay = document.getElementById('coin-display');
    const statsDisplay = document.getElementById('weapon-display');
    const hudEl = document.getElementById('hud');
    const waveBar = document.getElementById('wave-bar');
    const waveBarFill = document.getElementById('wave-bar-fill');
    const actionText = document.getElementById('action-text');
    const dangerVignette = document.getElementById('danger-vignette');
    let overlayCanvas, overlayCtx;

    function initOverlay() {
        overlayCanvas = document.getElementById('overlay-canvas');
        if (!overlayCanvas) {
            overlayCanvas = document.createElement('canvas');
            overlayCanvas.id = 'overlay-canvas';
            overlayCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:4;';
            document.body.appendChild(overlayCanvas);
        }
        overlayCanvas.width = W();
        overlayCanvas.height = H();
        overlayCtx = overlayCanvas.getContext('2d');
    }

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
        gateBad: () => { playTone(220, 0.2, 'sawtooth', 0.1, 110); },
        gameOver: () => { [330,262,220,165].forEach((f,i) => setTimeout(() => playTone(f,0.3,'sine',0.1), i*180)); },
        coin: () => playTone(1200, 0.05, 'sine', 0.06, 1800),
        combo: () => { playTone(660, 0.06, 'sine', 0.08); playTone(880, 0.06, 'sine', 0.06); },
    };

    // ─── Seeded PRNG (deterministic levels) ────────────────────────
    // Mulberry32 — fast 32-bit PRNG, seeded per level so the same level
    // always generates the same layout.
    let _seed = 0;
    function seedRandom(s) { _seed = s | 0; }
    function rng() {
        _seed += 0x6D2B79F5;
        let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // ─── Constants ──────────────────────────────────────────────────
    const ROAD_W = 10;
    const FORWARD_SPEED = 0;       // player is STATIONARY
    let WORLD_SPEED = 6;           // world scrolls toward player (set per level)
    const SEGMENT_LEN = 12;
    const SPAWN_DIST = 40;         // how far ahead things spawn
    const CLEANUP_BEHIND = 8;      // cleanup objects that passed player
    const VIEW_AHEAD = 50;
    const MAX_PARTICLES = 80;
    const MAX_ZOMBIES = 200;
    const MAX_SOLDIERS = 60;
    const BULLET_POOL_SIZE = 150;
    const BULLET_SPEED = 40;
    const STEER_SPEED = 8;

    // ─── Level Definitions ──────────────────────────────────────────
    // Each level defines: sections to complete, base difficulty offset,
    // scaling multiplier, world speed, and thematic name.
    const LEVELS = [
        // --- Act 1: Tutorial & Basics (Levels 1-5) ---
        { name: 'First Steps',       sections: 3,  diffOffset: 0,  diffScale: 0.4,  speed: 4,    startSquad: 15, startFR: 6, startDMG: 1,
          desc: 'Learn to dodge and shoot' },
        { name: 'Gate Runner',        sections: 3,  diffOffset: 0,  diffScale: 0.5,  speed: 4.5,  startSquad: 12, startFR: 6, startDMG: 1,
          desc: 'Choose your upgrades wisely' },
        { name: 'Fast Lane',          sections: 4,  diffOffset: 0,  diffScale: 0.6,  speed: 5,    startSquad: 12, startFR: 7, startDMG: 1,
          desc: 'Cyan runners incoming!' },
        { name: 'Barrel Alley',       sections: 4,  diffOffset: 1,  diffScale: 0.65, speed: 5,    startSquad: 14, startFR: 7, startDMG: 1,
          desc: 'Barrels block the path' },
        { name: 'The Gauntlet',       sections: 5,  diffOffset: 1,  diffScale: 0.7,  speed: 5.5,  startSquad: 12, startFR: 7, startDMG: 2,
          desc: 'Survive the first real test' },
        // --- Act 2: Rising Threat (Levels 6-10) ---
        { name: 'Brute Force',        sections: 5,  diffOffset: 2,  diffScale: 0.75, speed: 5.5,  startSquad: 15, startFR: 8, startDMG: 2,
          desc: 'Red brutes absorb damage' },
        { name: 'Tracker Swarm',      sections: 5,  diffOffset: 2,  diffScale: 0.8,  speed: 6,    startSquad: 14, startFR: 8, startDMG: 2,
          desc: 'They home in on you' },
        { name: 'Bad Gates',          sections: 6,  diffOffset: 3,  diffScale: 0.85, speed: 6,    startSquad: 12, startFR: 8, startDMG: 2,
          desc: 'Most gates are traps' },
        { name: 'Speed Demon',        sections: 6,  diffOffset: 3,  diffScale: 0.9,  speed: 7,    startSquad: 15, startFR: 9, startDMG: 2,
          desc: 'Everything moves faster' },
        { name: 'The Horde',          sections: 6,  diffOffset: 4,  diffScale: 0.95, speed: 6.5,  startSquad: 18, startFR: 9, startDMG: 3,
          desc: 'Massive zombie waves' },
        // --- Act 3: Endgame (Levels 11-14) ---
        { name: 'Mixed Nightmare',    sections: 7,  diffOffset: 4,  diffScale: 1.0,  speed: 7,    startSquad: 16, startFR: 10, startDMG: 3,
          desc: 'All enemy types at once' },
        { name: 'Bullet Hell',        sections: 7,  diffOffset: 5,  diffScale: 1.05, speed: 7.5,  startSquad: 18, startFR: 10, startDMG: 3,
          desc: 'Overwhelm with firepower' },
        { name: 'No Margin',          sections: 7,  diffOffset: 5,  diffScale: 1.05, speed: 7,    startSquad: 12, startFR: 11, startDMG: 4,
          desc: 'Tiny squad, big problems' },
        { name: 'Apocalypse',         sections: 8,  diffOffset: 6,  diffScale: 1.15, speed: 8,    startSquad: 20, startFR: 11, startDMG: 4,
          desc: 'The final wave' },
        { name: 'Endless',            sections: 999, diffOffset: 0, diffScale: 1.0,  speed: 5,    startSquad: 10, startFR: 6, startDMG: 1,
          desc: 'How far can you go?' },
    ];

    let currentLevel = 0;
    let levelSectionsCompleted = 0;
    let levelComplete = false;
    let unlockedLevel = 0; // persisted to localStorage

    function loadProgress() {
        try {
            const saved = localStorage.getItem('mss_unlocked');
            if (saved !== null) unlockedLevel = Math.min(parseInt(saved, 10) || 0, LEVELS.length - 1);
        } catch(e) {}
    }
    function saveProgress() {
        try { localStorage.setItem('mss_unlocked', unlockedLevel); } catch(e) {}
    }

    // ─── Sprite Textures (PNG assets + canvas fallbacks) ──────────
    const SPRITE_TEXTURES = {};

    function initSpriteTextures() {
        const loader = new THREE.TextureLoader();
        const SZ = 256;
        function rrect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}

        // Load PNG sprites — TextureLoader returns texture immediately,
        // Three.js updates the material when the image finishes loading
        SPRITE_TEXTURES.soldier = loader.load('assets/soldier.png');
        SPRITE_TEXTURES.zombie_normal = loader.load('assets/zombie.png');
        SPRITE_TEXTURES.zombie_fast = loader.load('assets/zombie_fast.png');
        SPRITE_TEXTURES.zombie_brute = loader.load('assets/zombie_brute.png');

        // Barrel — canvas-drawn (no PNG asset)
        function makeBarrelTexture(glowHex) {
            const c = document.createElement('canvas'); c.width = SZ; c.height = SZ;
            const ctx = c.getContext('2d');
            const bx=50,by=40,bw=SZ-100,bh=SZ-80,bcx=SZ/2,bcy=SZ/2;
            ctx.save();ctx.globalAlpha=0.3;const gg=ctx.createRadialGradient(bcx,bcy,20,bcx,bcy,90);gg.addColorStop(0,glowHex);gg.addColorStop(1,'transparent');ctx.fillStyle=gg;ctx.fillRect(0,0,SZ,SZ);ctx.restore();
            const wg=ctx.createLinearGradient(bx,by,bx+bw,by);wg.addColorStop(0,'#5D4037');wg.addColorStop(0.3,'#795548');wg.addColorStop(0.5,'#8D6E63');wg.addColorStop(0.7,'#795548');wg.addColorStop(1,'#5D4037');
            rrect(ctx,bx,by,bw,bh,12);ctx.fillStyle=wg;ctx.fill();ctx.strokeStyle='#3E2723';ctx.lineWidth=3;ctx.stroke();
            ctx.strokeStyle='rgba(62,39,35,0.4)';ctx.lineWidth=1;for(let px=bx+26;px<bx+bw;px+=26){ctx.beginPath();ctx.moveTo(px,by+6);ctx.lineTo(px,by+bh-6);ctx.stroke();}
            for(const bandY of [by+20,bcy-4,by+bh-24]){ctx.fillStyle='#78909C';ctx.strokeStyle='#455A64';ctx.lineWidth=2;rrect(ctx,bx-4,bandY,bw+8,10,3);ctx.fill();ctx.stroke();ctx.fillStyle='#90A4AE';ctx.beginPath();ctx.arc(bx+4,bandY+5,3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(bx+bw-4,bandY+5,3,0,Math.PI*2);ctx.fill();}
            const lg=ctx.createLinearGradient(bcx-24,bcy-24,bcx+24,bcy+24);lg.addColorStop(0,glowHex);lg.addColorStop(1,'#E65100');
            rrect(ctx,bcx-28,bcy-28,56,56,6);ctx.fillStyle=lg;ctx.fill();ctx.strokeStyle='#BF360C';ctx.lineWidth=2;ctx.stroke();
            ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(bcx,bcy-6,12,0,Math.PI*2);ctx.fill();ctx.fillRect(bcx-8,bcy+4,16,8);
            ctx.fillStyle=glowHex;ctx.beginPath();ctx.arc(bcx-5,bcy-8,3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(bcx+5,bcy-8,3,0,Math.PI*2);ctx.fill();ctx.fillRect(bcx-1,bcy-2,2,4);
            return new THREE.CanvasTexture(c);
        }
        SPRITE_TEXTURES.barrel = makeBarrelTexture('#FF6D00');
    }

    // ─── Canvas texture helper ──────────────────────────────────────
    function makeCanvasTexture(w, h, drawFn) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        drawFn(ctx, w, h);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    // ─── Road / Environment ─────────────────────────────────────────
    let skyMesh = null;
    let roadSegments = [];
    let buildingGroups = [];
    const ROAD_SEG_LEN = 20;
    const NUM_ROAD_SEGS = 8;
    const NUM_BUILDING_GROUPS = 6;

    function initEnvironment() {
        // Sky dome
        const skyGeo = new THREE.SphereGeometry(140, 12, 8);
        const skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {},
            vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
            fragmentShader: `varying vec3 vPos;
                void main(){
                    float h = normalize(vPos).y;
                    vec3 top = vec3(0.02, 0.02, 0.06);
                    vec3 mid = vec3(0.08, 0.03, 0.02);
                    vec3 bot = vec3(0.15, 0.04, 0.01);
                    vec3 col = h > 0.0 ? mix(mid, top, h) : mix(mid, bot, -h * 2.0);
                    gl_FragColor = vec4(col, 1.0);
                }`
        });
        skyMesh = new THREE.Mesh(skyGeo, skyMat);
        scene.add(skyMesh);

        // Road texture
        const roadTex = makeCanvasTexture(128, 256, (ctx, w, h) => {
            ctx.fillStyle = '#6b6b7a';
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 1000; i++) {
                const v = 95 + Math.random() * 30;
                ctx.fillStyle = `rgb(${v},${v - 2},${v - 3})`;
                ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
            }
        });
        roadTex.repeat.set(1, 2);

        const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95, color: 0xbbbbbb });
        const edgeLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const centerDashMat = new THREE.MeshBasicMaterial({ color: 0xcccccc });
        const wallTex = makeCanvasTexture(64, 32, (ctx, w, h) => {
            ctx.fillStyle = '#444440'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 200; i++) {
                const v = 55 + Math.random() * 25;
                ctx.fillStyle = `rgb(${v},${v},${v - 3})`;
                ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
            }
        });
        const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
        const dirtTex = makeCanvasTexture(64, 64, (ctx, w, h) => {
            ctx.fillStyle = '#1a1410'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 400; i++) {
                const v = 20 + Math.random() * 15;
                ctx.fillStyle = `rgb(${v + 5},${v},${v - 3})`;
                ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
            }
        });
        dirtTex.repeat.set(3, 2);
        const dirtMat = new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1.0, color: 0x999999 });

        for (let i = 0; i < NUM_ROAD_SEGS; i++) {
            const group = new THREE.Group();
            const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, ROAD_SEG_LEN), roadMat);
            road.rotation.x = -Math.PI / 2;
            group.add(road);

            for (const side of [-1, 1]) {
                const line = new THREE.Mesh(new THREE.PlaneGeometry(0.2, ROAD_SEG_LEN), edgeLineMat);
                line.rotation.x = -Math.PI / 2;
                line.position.set(side * (ROAD_W / 2 - 0.3), 0.01, 0);
                group.add(line);
            }

            for (let dz = -ROAD_SEG_LEN / 2 + 1; dz < ROAD_SEG_LEN / 2; dz += 3) {
                const dash = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, 1.2), centerDashMat);
                dash.position.set(0, 0.01, dz);
                group.add(dash);
            }

            for (const side of [-1, 1]) {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, ROAD_SEG_LEN), wallMat);
                wall.position.set(side * (ROAD_W / 2 + 0.4), 0.35, 0);
                group.add(wall);
                const gnd = new THREE.Mesh(new THREE.PlaneGeometry(25, ROAD_SEG_LEN), dirtMat);
                gnd.rotation.x = -Math.PI / 2;
                gnd.position.set(side * 18, -0.05, 0);
                group.add(gnd);
            }

            group.userData.baseZ = -i * ROAD_SEG_LEN;
            group.position.z = group.userData.baseZ;
            scene.add(group);
            roadSegments.push(group);
        }

        // Building silhouettes
        const buildingMat = new THREE.MeshStandardMaterial({ color: 0x101015, roughness: 1.0 });
        const windowMat = new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.7 });

        for (let gi = 0; gi < NUM_BUILDING_GROUPS; gi++) {
            const group = new THREE.Group();
            for (const side of [-1, 1]) {
                for (let bi = 0; bi < 3; bi++) {
                    const bw = 3 + Math.random() * 5;
                    const bh = 5 + Math.random() * 12;
                    const bd = 3 + Math.random() * 5;
                    const bx = side * (ROAD_W / 2 + 3 + Math.random() * 12);
                    const bz = -ROAD_SEG_LEN / 2 + bi * (ROAD_SEG_LEN / 3) + Math.random() * 3;
                    const building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), buildingMat);
                    building.position.set(bx, bh / 2, bz);
                    group.add(building);
                    if (Math.random() < 0.6) {
                        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), windowMat);
                        win.position.set(bx + (side > 0 ? -bw / 2 - 0.01 : bw / 2 + 0.01), 2 + Math.random() * (bh - 3), bz + (Math.random() - 0.5) * (bd - 1));
                        win.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
                        group.add(win);
                    }
                }
            }
            group.userData.baseZ = -gi * ROAD_SEG_LEN;
            group.position.z = group.userData.baseZ;
            scene.add(group);
            buildingGroups.push(group);
        }
    }

    // ─── Instanced Rendering ────────────────────────────────────────
    const zombieMeshes = [null, null, null]; // 0=normal, 1=fast, 2=brute
    let soldierMesh = null;
    const _dummy = new THREE.Object3D();
    const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    // Soldier jitter for organic formation
    const soldierJitter = new Float32Array(MAX_SOLDIERS * 2);

    function initInstancedMeshes() {
        const planeGeo = new THREE.PlaneGeometry(1, 1);

        // Zombie meshes (one per type)
        const typeKeys = ['zombie_normal', 'zombie_fast', 'zombie_brute'];
        for (let t = 0; t < 3; t++) {
            const mat = new THREE.MeshBasicMaterial({
                map: SPRITE_TEXTURES[typeKeys[t]],
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

        // Soldier mesh
        const soldierMat = new THREE.MeshBasicMaterial({
            map: SPRITE_TEXTURES.soldier,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        soldierMesh = new THREE.InstancedMesh(planeGeo, soldierMat, MAX_SOLDIERS);
        soldierMesh.frustumCulled = false;
        soldierMesh.userData = { lastCount: 0 };
        for (let i = 0; i < MAX_SOLDIERS; i++) soldierMesh.setMatrixAt(i, _zeroMatrix);
        soldierMesh.instanceMatrix.needsUpdate = true;
        scene.add(soldierMesh);

        // Pre-generate jitter
        for (let i = 0; i < MAX_SOLDIERS * 2; i++) {
            soldierJitter[i] = (Math.random() - 0.5) * 2;
        }
    }

    // ─── Game State ─────────────────────────────────────────────────
    let state = 'menu';
    let playerZ = 0, playerX = 0, targetX = 0;
    let score = 0, coins = 0;
    let squadCount = 5;
    let fireRateStat = 2.5, damageStat = 1;
    let sectionCount = 0;
    let nextSegmentZ = 0;
    let worldScroll = 0;           // virtual distance for generation
    let shakeAmount = 0;
    let baseFov = 55, fovTarget = 55;

    // Combo tracking
    let comboCount = 0, comboTimer = 0;
    let bestCombo = 0;

    // Zombie SoA (struct-of-arrays)
    const zX = new Float32Array(MAX_ZOMBIES);
    const zZ = new Float32Array(MAX_ZOMBIES);
    const zHP = new Int32Array(MAX_ZOMBIES);
    const zMaxHP = new Int32Array(MAX_ZOMBIES);
    const zSpeed = new Float32Array(MAX_ZOMBIES);
    const zActive = new Uint8Array(MAX_ZOMBIES);
    const zType = new Uint8Array(MAX_ZOMBIES); // 0=normal 1=fast 2=brute
    const zTracker = new Uint8Array(MAX_ZOMBIES);
    const zWobble = new Float32Array(MAX_ZOMBIES);
    let zombieHighWater = 0;

    // Barrels (few enough to keep as objects)
    let barrels = [];
    let gates = [];
    let particles = [];
    let coinPickups = [];
    let damageNums = [];
    let muzzleFlashes = [];

    // Bullet pool
    let bulletPool = [];
    let activeBullets = [];
    let fireCooldown = 0;

    // Segment tracking
    // Every segment spawns zombies. Gates appear every 3rd segment, barrels every 3rd (offset).
    const GATE_OFFSET = 3;
    const ZOMBIE_OFFSET = 0;
    const BARREL_OFFSET = 6;
    let segmentIndex = 0;

    // FPS counter + debug
    let fpsFrames = 0, lastFPS = 0;
    let debugActiveZombies = 0;
    setInterval(() => { lastFPS = fpsFrames; fpsFrames = 0; }, 1000);
    // Expose debug for testing
    window._gameDebug = () => ({ activeZombies: debugActiveZombies, fps: lastFPS, squad: squadCount, section: sectionCount });

    // ─── Bullet Pool ────────────────────────────────────────────────
    function initBulletPool() {
        for (let i = 0; i < BULLET_POOL_SIZE; i++) {
            const g = new THREE.Group();
            const core = new THREE.Mesh(
                new THREE.SphereGeometry(0.15, 4, 4),
                new THREE.MeshBasicMaterial({ color: 0xFFD600 })
            );
            g.add(core);
            const glow = new THREE.Mesh(
                new THREE.SphereGeometry(0.3, 4, 4),
                new THREE.MeshBasicMaterial({ color: 0xFFAB00, transparent: true, opacity: 0.5 })
            );
            g.add(glow);
            g.userData = { active: false, damage: 1, vz: 0 };
            g.visible = false;
            scene.add(g);
            bulletPool.push(g);
        }
    }

    function getBullet(x, y, z, damage) {
        for (let i = 0; i < bulletPool.length; i++) {
            const b = bulletPool[i];
            if (!b.userData.active) {
                b.userData.active = true;
                b.userData.damage = damage;
                b.userData.vz = -BULLET_SPEED;
                b.position.set(x + (Math.random() - 0.5) * 0.15, y, z);
                b.visible = true;
                activeBullets.push(b);
                return b;
            }
        }
        return null;
    }

    function releaseBullet(b) {
        b.userData.active = false;
        b.visible = false;
        const idx = activeBullets.indexOf(b);
        if (idx >= 0) activeBullets.splice(idx, 1);
    }

    // ─── Text Sprites (for gate labels, damage nums) ────────────────
    function createTextSprite(text, color, scale) {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 72px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 6;
        ctx.strokeText(text, 256, 64);
        ctx.fillStyle = color; ctx.fillText(text, 256, 64);
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(scale * 4, scale, 1);
        sprite.userData = { canvas, ctx, tex };
        return sprite;
    }

    function updateSpriteText(sprite, text, color) {
        const { canvas, ctx, tex } = sprite.userData;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 72px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 6;
        ctx.strokeText(text, canvas.width / 2, 64);
        ctx.fillStyle = color || '#fff'; ctx.fillText(text, canvas.width / 2, 64);
        tex.needsUpdate = true;
    }

    // ─── Barrel Creation (stays as objects — max ~3 onscreen) ───────
    function createBarrelObj() {
        const g = new THREE.Group();
        const mat = new THREE.SpriteMaterial({
            map: SPRITE_TEXTURES.barrel,
            transparent: true,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(2.0, 2.0, 1);
        sprite.position.y = 0.8;
        g.add(sprite);
        return g;
    }

    // ─── Gate Creation ──────────────────────────────────────────────
    function createGate(z, side, type, stat, value) {
        const gateX = side * (ROAD_W / 4);
        const w = ROAD_W / 2 - 0.5;
        const h = 2.5;

        const isGood = (type === 'add' && value > 0) || (type === 'multiply' && value > 1);
        const color = isGood ? 0x00E676 : 0xFF1744;
        const colorHex = isGood ? '#00E676' : '#FF1744';

        const geo = new THREE.BoxGeometry(w, h, 0.5);
        const mat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(gateX, h / 2, z);

        const edgeGeo = new THREE.EdgesGeometry(geo);
        const edgeMat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.9 });
        mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));
        scene.add(mesh);

        const statNames = { squad: 'Squad', fireRate: 'Fire Rate', damage: 'Damage' };
        const opStr = type === 'add' ? (value >= 0 ? '+' : '') + value : 'x' + value;
        const labelText = opStr + ' ' + statNames[stat];
        const label = createTextSprite(labelText, colorHex, 0.8);
        label.position.set(gateX, h + 0.8, z);
        scene.add(label);

        const gate = { mesh, label, type, stat, value, side, z, used: false, isGood };
        gates.push(gate);
        return gate;
    }

    // ─── Wave Configuration ─────────────────────────────────────────
    function getWaveConfig(sec) {
        const lvl = LEVELS[currentLevel] || LEVELS[LEVELS.length - 1];
        const effectiveSec = (sec + lvl.diffOffset) * lvl.diffScale;
        const s = effectiveSec; // shorthand
        return {
            zombieCount: Math.min(Math.round(8 + s * 5), 60),
            zombieHP: Math.max(1, Math.ceil(s * 0.8)),
            zombieBaseSpeed: 3.0 + s * 0.35,
            fastRatio: s >= 2 ? Math.min(0.15 + (s - 2) * 0.04, 0.45) : 0,
            bruteRatio: s >= 3 ? Math.min(0.08 + (s - 3) * 0.03, 0.3) : 0,
            trackerRatio: s >= 4 ? Math.min(0.2 + (s - 4) * 0.06, 0.55) : 0,
            barrelHP: 6 + Math.round(s * 5),
            barrelCount: Math.min(1 + Math.floor(s / 2), 4),
        };
    }

    // ─── Segment Generation ─────────────────────────────────────────
    function generateSegment(segZ) {
        // Don't generate more content if level is complete or all sections generated
        if (levelComplete) return;
        const lvl = LEVELS[currentLevel];
        if (currentLevel < LEVELS.length - 1 && sectionCount >= lvl.sections) return;

        segmentIndex++;

        // Every segment gets zombies
        generateZombieWave(segZ + ZOMBIE_OFFSET);

        // Gates every 3rd segment
        if (segmentIndex % 3 === 1) {
            sectionCount++;
            generateGatePair(segZ + GATE_OFFSET);
        }

        // Barrels every 3rd segment (offset from gates)
        if (segmentIndex % 3 === 2) {
            generateBarrelRow(segZ + BARREL_OFFSET);
        }
    }

    function generateGatePair(z) {
        const sec = sectionCount;
        const stats = ['squad', 'fireRate', 'damage'];
        const s1 = stats[Math.floor(rng() * stats.length)];
        const s2 = stats[Math.floor(rng() * stats.length)];

        function makeGoodValue(stat) {
            if (stat === 'squad') {
                if (sec < 3) return { type: 'add', value: 2 + Math.floor(rng() * 2) };
                if (sec < 6) return { type: 'add', value: 3 + Math.floor(rng() * 4) };
                if (rng() < 0.25) return { type: 'multiply', value: 2 };
                return { type: 'add', value: 4 + Math.floor(rng() * 6) };
            } else if (stat === 'fireRate') {
                return { type: 'add', value: 1 + (sec > 4 ? Math.floor(rng() * 2) : 0) };
            } else {
                if (sec > 5 && rng() < 0.2) return { type: 'multiply', value: 2 };
                return { type: 'add', value: 1 + (sec > 3 ? 1 : 0) };
            }
        }

        function makeBadValue(stat) {
            if (stat === 'squad') {
                return { type: 'add', value: -Math.min(2 + Math.floor(sec * 0.7), 10) };
            } else if (stat === 'fireRate') {
                return { type: 'add', value: -(1 + Math.floor(Math.min(sec * 0.4, 3))) };
            } else {
                if (sec > 6 && rng() < 0.3) return { type: 'multiply', value: 0.5 };
                return { type: 'add', value: -Math.max(1, Math.floor(sec * 0.3)) };
            }
        }

        // Chance of bad gate increases with section
        const badChance = Math.min(0.75, 0.35 + sec * 0.06);
        const leftIsGood = rng() < 0.5;
        const goodVal = makeGoodValue(s1);
        const otherVal = rng() < badChance ? makeBadValue(s2) : makeGoodValue(s2);

        const spawnZ = -(z - worldScroll);
        if (leftIsGood) {
            createGate(spawnZ, -1, goodVal.type, s1, goodVal.value);
            createGate(spawnZ, 1, otherVal.type, s2, otherVal.value);
        } else {
            createGate(spawnZ, -1, otherVal.type, s2, otherVal.value);
            createGate(spawnZ, 1, goodVal.type, s1, goodVal.value);
        }
    }

    function generateZombieWave(z) {
        const cfg = getWaveConfig(sectionCount);
        const count = cfg.zombieCount;

        for (let i = 0; i < count; i++) {
            // Find free slot
            let idx = -1;
            for (let j = 0; j < MAX_ZOMBIES; j++) {
                if (!zActive[j]) { idx = j; break; }
            }
            if (idx < 0) break;

            // Determine type
            const r = rng();
            let type = 0; // normal
            if (r < cfg.bruteRatio) type = 2;
            else if (r < cfg.bruteRatio + cfg.fastRatio) type = 1;

            const hp = type === 2 ? Math.ceil(cfg.zombieHP * 2.5) : (type === 1 ? Math.max(1, cfg.zombieHP - 1) : cfg.zombieHP);
            const speed = type === 1 ? cfg.zombieBaseSpeed * 1.6 : (type === 2 ? cfg.zombieBaseSpeed * 0.65 : cfg.zombieBaseSpeed);
            const isTracker = rng() < cfg.trackerRatio;

            zX[idx] = (rng() - 0.5) * (ROAD_W - 2);
            zZ[idx] = -(z - worldScroll) - rng() * 10;
            zHP[idx] = hp;
            zMaxHP[idx] = hp;
            zSpeed[idx] = speed + (rng() - 0.5) * 1.0;
            zActive[idx] = 1;
            zType[idx] = type;
            zTracker[idx] = isTracker ? 1 : 0;
            zWobble[idx] = rng() * Math.PI * 2;

            if (idx >= zombieHighWater) zombieHighWater = idx + 1;
        }
    }

    function generateBarrelRow(z) {
        const cfg = getWaveConfig(sectionCount);
        const count = cfg.barrelCount;
        const hp = cfg.barrelHP;

        const positions = [];
        if (count === 1) {
            positions.push(rng() < 0.5 ? (rng() - 0.5) * 1.5 : (rng() - 0.5) * (ROAD_W - 3));
        } else if (count === 2) {
            positions.push(-ROAD_W / 4 + (rng() - 0.5) * 1.5);
            positions.push(ROAD_W / 4 + (rng() - 0.5) * 1.5);
        } else {
            positions.push(-ROAD_W / 3);
            positions.push(0);
            positions.push(ROAD_W / 3);
        }

        for (const bx of positions) {
            const barrel = createBarrelObj();
            barrel.position.set(bx, 0, -(z - worldScroll));
            barrel.userData = { hp, maxHp: hp };
            scene.add(barrel);
            barrels.push(barrel);
        }
    }

    // ─── Particles ──────────────────────────────────────────────────
    function addParticle(mesh) {
        scene.add(mesh);
        particles.push(mesh);
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
                vel: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 6 + 2, (Math.random() - 0.5) * 6),
                life: 0.4 + Math.random() * 0.4,
            };
            addParticle(mesh);
        }
    }

    function spawnExplosion(x, z) {
        const fireball = new THREE.Mesh(
            new THREE.SphereGeometry(0.8, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xFFAB00, transparent: true, opacity: 0.9 })
        );
        fireball.position.set(x, 0.8, z);
        fireball.userData = { vel: new THREE.Vector3(0, 1, 0), life: 0.25 };
        addParticle(fireball);

        const colors = [0xFF6D00, 0xFFAB00, 0xFFD600];
        for (let i = 0; i < 6; i++) {
            const c = colors[Math.floor(Math.random() * colors.length)];
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.08 + Math.random() * 0.12, 3, 3),
                new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1 })
            );
            mesh.position.set(x + (Math.random() - 0.5) * 0.8, 0.2 + Math.random() * 0.5, z + (Math.random() - 0.5) * 0.8);
            mesh.userData = {
                vel: new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 5 + 2, (Math.random() - 0.5) * 5),
                life: 0.2 + Math.random() * 0.4,
            };
            addParticle(mesh);
        }
    }

    function spawnCoinPickup(x, z, amount) {
        const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.25, 0.08, 6),
            new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.8, roughness: 0.2 })
        );
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(x, 1.5, z);
        mesh.userData = { amount, life: 1.5, vy: 3 };
        scene.add(mesh); coinPickups.push(mesh);
    }

    // ─── Damage Numbers ─────────────────────────────────────────────
    function spawnDamageNumber(x, y, z, damage) {
        const sprite = createTextSprite(damage.toString(), '#FFD600', 0.4 + Math.random() * 0.2);
        sprite.position.set(x + (Math.random() - 0.5) * 0.6, y, z);
        sprite.userData.vy = 3;
        sprite.userData.life = 0.6;
        sprite.userData.maxLife = 0.6;
        scene.add(sprite);
        damageNums.push(sprite);
    }

    // ─── Muzzle Flash ───────────────────────────────────────────────
    function spawnMuzzleFlash(x, z) {
        const flash = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xFFFF88, transparent: true, opacity: 1.0 })
        );
        flash.position.set(x, 0.7, z - 0.5);
        flash.userData = { life: 0.06 };
        scene.add(flash);
        muzzleFlashes.push(flash);
    }

    // ─── Effects ────────────────────────────────────────────────────
    function shake(amt) { shakeAmount = Math.max(shakeAmount, amt); }

    function showActionText(text, color) {
        actionText.textContent = text;
        actionText.style.color = color || '#fff';
        actionText.classList.add('show');
        setTimeout(() => actionText.classList.remove('show'), 1200);
    }

    function registerKill() {
        comboTimer = 2.0;
        comboCount++;
        if (comboCount >= 5) {
            fovTarget = baseFov - 5; // zoom in
            SFX.combo();
        }
        bestCombo = Math.max(bestCombo, comboCount);
    }

    function updateHUD() {
        const dist = Math.floor(worldScroll);
        const lvl = LEVELS[currentLevel];
        if (currentLevel < LEVELS.length - 1) {
            distDisplay.textContent = 'Lv.' + (currentLevel + 1) + ' §' + levelSectionsCompleted + '/' + lvl.sections;
        } else {
            distDisplay.textContent = dist + 'm (§' + sectionCount + ')';
        }
        squadDisplay.textContent = squadCount;
        coinDisplay.textContent = coins;
        statsDisplay.textContent = 'DMG:' + damageStat + ' FR:' + fireRateStat.toFixed(1);
    }

    // ─── Apply Gate Effect ──────────────────────────────────────────
    function applyGateEffect(gate) {
        if (gate.used) return;
        gate.used = true;

        const val = gate.value;
        const stat = gate.stat;
        const type = gate.type;

        if (stat === 'squad') {
            if (type === 'add') squadCount = Math.max(1, squadCount + val);
            else squadCount = Math.max(1, Math.floor(squadCount * val));
        } else if (stat === 'fireRate') {
            if (type === 'add') fireRateStat = Math.max(0.5, Math.min(12, fireRateStat + val));
            else fireRateStat = Math.max(0.5, Math.min(12, fireRateStat * val));
        } else if (stat === 'damage') {
            if (type === 'add') damageStat = Math.max(1, damageStat + val);
            else damageStat = Math.max(1, Math.floor(damageStat * val));
        }

        // Regenerate jitter for new squad size
        for (let i = 0; i < MAX_SOLDIERS * 2; i++) {
            soldierJitter[i] = (rng() - 0.5) * 2;
        }

        const opStr = type === 'add' ? (val >= 0 ? '+' : '') + val : 'x' + val;
        const statNames = { squad: 'Squad', fireRate: 'Fire Rate', damage: 'Damage' };
        const txt = opStr + ' ' + statNames[stat] + '!';

        if (gate.isGood) {
            SFX.upgrade();
            showActionText(txt, '#00E676');
        } else {
            SFX.gateBad();
            showActionText(txt, '#FF1744');
        }

        gate.mesh.material.opacity = 0.1;
        gate.label.material.opacity = 0.3;
        shake(0.3);
    }

    // ─── Cleanup ────────────────────────────────────────────────────
    function cleanupBehind() {
        const behindZ = playerZ + CLEANUP_BEHIND;

        // Zombies behind
        for (let i = 0; i < zombieHighWater; i++) {
            if (zActive[i] && zZ[i] > behindZ) {
                zActive[i] = 0;
            }
        }

        // Barrels behind
        for (let i = barrels.length - 1; i >= 0; i--) {
            if (barrels[i].position.z > behindZ) {
                scene.remove(barrels[i]);
                barrels.splice(i, 1);
            }
        }

        // Gates behind
        for (let i = gates.length - 1; i >= 0; i--) {
            if (gates[i].mesh.position.z > behindZ) {
                scene.remove(gates[i].mesh);
                scene.remove(gates[i].label);
                gates.splice(i, 1);
            }
        }
    }

    // ─── Generation Control ─────────────────────────────────────────
    function generateAhead() {
        while (nextSegmentZ < worldScroll + VIEW_AHEAD) {
            generateSegment(nextSegmentZ);
            nextSegmentZ += SEGMENT_LEN;
        }
    }

    // ─── Recycle Road ───────────────────────────────────────────────
    function scrollAndRecycleRoad(dt) {
        const scrollDelta = WORLD_SPEED * dt;
        const totalLen = NUM_ROAD_SEGS * ROAD_SEG_LEN;
        for (const seg of roadSegments) {
            seg.position.z += scrollDelta;
            if (seg.position.z > ROAD_SEG_LEN) seg.position.z -= totalLen;
        }
        const btotalLen = NUM_BUILDING_GROUPS * ROAD_SEG_LEN;
        for (const bg of buildingGroups) {
            bg.position.z += scrollDelta;
            if (bg.position.z > ROAD_SEG_LEN) bg.position.z -= btotalLen;
        }
    }

    // ─── Find Nearest Target ────────────────────────────────────────
    function findNearestTarget() {
        let nearest = null;
        let nearestDist = Infinity;

        for (let i = 0; i < zombieHighWater; i++) {
            if (!zActive[i]) continue;
            if (zZ[i] > playerZ) continue;
            const dist = Math.abs(zZ[i] - playerZ);
            if (dist < nearestDist && dist < 28) {
                nearestDist = dist;
                nearest = { x: zX[i], z: zZ[i], isZombie: true };
            }
        }

        for (const b of barrels) {
            if (b.position.z > playerZ) continue;
            const dist = Math.abs(b.position.z - playerZ);
            if (dist < nearestDist && dist < 28) {
                nearestDist = dist;
                nearest = { x: b.position.x, z: b.position.z, isZombie: false };
            }
        }

        return nearest;
    }

    // ─── Update Instanced Meshes ────────────────────────────────────
    function updateZombieInstances() {
        const counts = [0, 0, 0];

        for (let i = 0; i < zombieHighWater; i++) {
            if (!zActive[i]) continue;
            const type = zType[i];
            const idx = counts[type]++;
            const mesh = zombieMeshes[type];
            const scale = type === 2 ? 1.2 : 0.8;
            const yOff = type === 2 ? 0.5 : 0.35;

            _dummy.position.set(zX[i], yOff, zZ[i]);
            _dummy.quaternion.copy(camera.quaternion);
            _dummy.scale.set(scale, scale, 1);
            _dummy.updateMatrix();
            mesh.setMatrixAt(idx, _dummy.matrix);
        }

        for (let t = 0; t < 3; t++) {
            const mesh = zombieMeshes[t];
            const prev = mesh.userData.lastCount || 0;
            // Hide remaining from last frame
            for (let i = counts[t]; i < prev; i++) {
                mesh.setMatrixAt(i, _zeroMatrix);
            }
            mesh.userData.lastCount = counts[t];
            mesh.count = Math.max(counts[t], 1);
            mesh.instanceMatrix.needsUpdate = true;
        }
    }

    function updateSoldierInstances(time) {
        const count = Math.min(squadCount, MAX_SOLDIERS);
        const cols = Math.min(count, 8);

        for (let i = 0; i < count; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const spacing = 0.7;
            const ox = (col - (cols - 1) / 2) * spacing + soldierJitter[i * 2] * 0.15;
            const oz = row * spacing * 0.5 + soldierJitter[i * 2 + 1] * 0.1;
            const bob = Math.sin(time * 4 + i * 0.5) * 0.1;

            _dummy.position.set(playerX + ox, 0.3 + bob, playerZ + oz);
            _dummy.quaternion.copy(camera.quaternion);
            _dummy.scale.set(1.0, 1.0, 1);
            _dummy.updateMatrix();
            soldierMesh.setMatrixAt(i, _dummy.matrix);
        }

        const prev = soldierMesh.userData.lastCount || 0;
        for (let i = count; i < prev; i++) {
            soldierMesh.setMatrixAt(i, _zeroMatrix);
        }
        soldierMesh.userData.lastCount = count;
        soldierMesh.count = Math.max(count, 1);
        soldierMesh.instanceMatrix.needsUpdate = true;
    }

    // ─── Overlay Rendering (HP bars, combo) ─────────────────────────
    const _projVec = new THREE.Vector3();

    function worldToScreen(x, y, z) {
        _projVec.set(x, y, z);
        _projVec.project(camera);
        return {
            sx: (_projVec.x * 0.5 + 0.5) * overlayCanvas.width,
            sy: (-_projVec.y * 0.5 + 0.5) * overlayCanvas.height,
            visible: _projVec.z > 0 && _projVec.z < 1,
        };
    }

    function renderOverlay() {
        if (!overlayCtx) return;
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        // Zombie HP bars
        for (let i = 0; i < zombieHighWater; i++) {
            if (!zActive[i]) continue;
            if (zHP[i] >= zMaxHP[i] && zMaxHP[i] <= 2) continue; // skip trivial HP
            const p = worldToScreen(zX[i], 1.0, zZ[i]);
            if (!p.visible) continue;
            const barW = zType[i] === 2 ? 40 : 28;
            const barH = 4;
            const hpPct = zHP[i] / zMaxHP[i];
            overlayCtx.fillStyle = 'rgba(0,0,0,0.6)';
            overlayCtx.fillRect(p.sx - barW / 2, p.sy, barW, barH);
            overlayCtx.fillStyle = hpPct > 0.5 ? '#00E676' : (hpPct > 0.25 ? '#FFAB00' : '#FF1744');
            overlayCtx.fillRect(p.sx - barW / 2, p.sy, barW * hpPct, barH);

            // HP number
            if (zMaxHP[i] > 3) {
                overlayCtx.font = 'bold 10px system-ui';
                overlayCtx.fillStyle = '#fff';
                overlayCtx.textAlign = 'center';
                overlayCtx.fillText(zHP[i], p.sx, p.sy - 2);
            }
        }

        // Barrel HP bars
        for (const br of barrels) {
            const p = worldToScreen(br.position.x, 1.2, br.position.z);
            if (!p.visible) continue;
            const barW = 36;
            const barH = 5;
            const hpPct = br.userData.hp / br.userData.maxHp;
            overlayCtx.fillStyle = 'rgba(0,0,0,0.6)';
            overlayCtx.fillRect(p.sx - barW / 2, p.sy, barW, barH);
            overlayCtx.fillStyle = '#00BCD4';
            overlayCtx.fillRect(p.sx - barW / 2, p.sy, barW * hpPct, barH);
            overlayCtx.font = 'bold 11px system-ui';
            overlayCtx.fillStyle = '#fff';
            overlayCtx.textAlign = 'center';
            overlayCtx.fillText(br.userData.hp, p.sx, p.sy - 2);
        }

        // Combo display — only show big combos briefly
        if (comboCount >= 10) {
            const size = Math.min(20 + Math.floor(comboCount / 5) * 2, 32);
            overlayCtx.font = `bold ${size}px system-ui`;
            overlayCtx.textAlign = 'center';
            overlayCtx.strokeStyle = 'rgba(0,0,0,0.5)';
            overlayCtx.lineWidth = 3;
            const txt = `x${comboCount}`;
            const cy = overlayCanvas.height * 0.15;
            overlayCtx.strokeText(txt, overlayCanvas.width / 2, cy);
            overlayCtx.fillStyle = comboCount >= 20 ? '#FF1744' : '#FFD600';
            overlayCtx.fillText(txt, overlayCanvas.width / 2, cy);
        }

        // FPS (debug, small)
        overlayCtx.font = '10px monospace';
        overlayCtx.fillStyle = 'rgba(255,255,255,0.4)';
        overlayCtx.textAlign = 'right';
        overlayCtx.fillText(`FPS:${lastFPS}`, overlayCanvas.width - 5, overlayCanvas.height - 5);
    }

    // ─── Main Update ────────────────────────────────────────────────
    function update(dt) {
        if (state !== 'playing') return;

        const time = Date.now() * 0.001;

        // Forward movement — player stays at Z=0, world scrolls via worldScroll
        worldScroll += WORLD_SPEED * dt;

        // Scroll world entities toward player
        const scrollDelta = WORLD_SPEED * dt;
        for (const gate of gates) {
            gate.mesh.position.z += scrollDelta;
            gate.label.position.z += scrollDelta;
        }
        for (const barrel of barrels) {
            barrel.position.z += scrollDelta;
        }
        // Zombies also scroll with the world (on top of their own movement)
        for (let i = 0; i < zombieHighWater; i++) {
            if (zActive[i]) zZ[i] += scrollDelta;
        }

        // Steering
        playerX += (targetX - playerX) * Math.min(1, 10 * dt);
        playerX = Math.max(-ROAD_W / 2 + 1, Math.min(ROAD_W / 2 - 1, playerX));

        // Generate + scroll road + cleanup
        generateAhead();
        scrollAndRecycleRoad(dt);
        cleanupBehind();

        // Combo timer
        if (comboTimer > 0) {
            comboTimer -= dt;
            if (comboTimer <= 0) {
                comboCount = 0;
                fovTarget = baseFov;
            }
        }

        // Camera FOV lerp
        camera.fov += (fovTarget - camera.fov) * Math.min(1, 8 * dt);
        camera.updateProjectionMatrix();

        // Update soldier instances
        updateSoldierInstances(time);

        // Compute squad center for firing (use first few soldiers' approximate position)
        const squadVisual = Math.min(squadCount, MAX_SOLDIERS);
        const squadCols = Math.min(squadVisual, 8);

        // Auto-fire — always fires forward
        fireCooldown -= dt;
        if (fireCooldown <= 0 && squadCount > 0) {
            const firers = Math.min(squadVisual, 15);
            for (let i = 0; i < firers; i++) {
                const col = i % squadCols;
                const spacing = 0.7;
                const ox = (col - (squadCols - 1) / 2) * spacing;
                getBullet(playerX + ox, 0.3, playerZ - 0.5, damageStat);
            }
            spawnMuzzleFlash(playerX, playerZ);
            SFX.shoot();
            fireCooldown = 1 / fireRateStat;
        }

        // Update bullets
        for (let i = activeBullets.length - 1; i >= 0; i--) {
            const b = activeBullets[i];
            b.position.z += b.userData.vz * dt;

            if (b.position.z < playerZ - 30 || b.position.z > playerZ + 10) {
                releaseBullet(b);
                continue;
            }

            // Hit zombies
            let hit = false;
            for (let j = 0; j < zombieHighWater; j++) {
                if (!zActive[j]) continue;
                const dx = Math.abs(b.position.x - zX[j]);
                const dz = Math.abs(b.position.z - zZ[j]);
                const hr = zType[j] === 2 ? 0.5 : 0.35;
                if (dx < hr && dz < hr) {
                    const dmg = b.userData.damage;
                    zHP[j] -= dmg;
                    spawnDamageNumber(b.position.x, 1.5, b.position.z, dmg);
                    SFX.hit();
                    shake(0.05);

                    if (zHP[j] <= 0) {
                        const reward = Math.ceil(zMaxHP[j] * 0.5);
                        coins += reward;
                        score += zMaxHP[j] * 10;
                        spawnCoinPickup(zX[j], zZ[j], reward);
                        spawnExplosion(zX[j], zZ[j]);
                        // Death burst particles (type-colored)
                        const burstColor = zType[j] === 0 ? 0x76FF03 : (zType[j] === 1 ? 0x00E5FF : 0xFF1744);
                        spawnParticles(zX[j], 1.0, zZ[j], burstColor, 4);
                        SFX.enemyDie();
                        zActive[j] = 0;
                        registerKill();
                    }

                    releaseBullet(b);
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
                if (dx < 1.5 && dz < 1.5) {
                    const dmg = b.userData.damage;
                    br.userData.hp -= dmg;
                    spawnDamageNumber(b.position.x, 1.5, b.position.z, dmg);
                    SFX.hit();

                    if (br.userData.hp <= 0) {
                        coins += Math.ceil(br.userData.maxHp * 0.3);
                        score += br.userData.maxHp * 5;
                        spawnCoinPickup(br.position.x, br.position.z, Math.ceil(br.userData.maxHp * 0.3));
                        spawnExplosion(br.position.x, br.position.z);
                        SFX.barrelBreak();
                        scene.remove(br);
                        barrels.splice(j, 1);
                    }

                    releaseBullet(b);
                    break;
                }
            }
        }

        // Move zombies
        for (let i = 0; i < zombieHighWater; i++) {
            if (!zActive[i]) continue;

            // Move toward player Z
            const dz = playerZ - zZ[i];
            zZ[i] += Math.sign(dz) * zSpeed[i] * dt;

            // X behavior: trackers aggressively home, others wobble + slight attraction
            if (zTracker[i]) {
                zX[i] += (playerX - zX[i]) * 3.0 * dt;
            } else {
                const dx = playerX - zX[i];
                zX[i] += Math.sign(dx) * Math.min(Math.abs(dx), 1.5 * dt);
                zX[i] += Math.sin(time * 1.5 + zWobble[i]) * 0.3 * dt;
            }
            zX[i] = Math.max(-ROAD_W / 2 + 0.5, Math.min(ROAD_W / 2 - 0.5, zX[i]));

            // Collision with player
            if (Math.abs(zZ[i] - playerZ) < 0.8 && Math.abs(zX[i] - playerX) < 1.2) {
                // Each zombie kills 1 soldier on contact
                const kills = Math.min(1, squadCount);
                squadCount -= kills;
                spawnExplosion(zX[i], zZ[i]);
                spawnParticles(playerX, 1.0, playerZ, 0x2196F3, kills);
                SFX.enemyDie();
                shake(0.6);
                zActive[i] = 0;

                if (squadCount <= 0) {
                    doGameOver();
                    return;
                }
            }
        }

        // Barrel collision
        for (let i = barrels.length - 1; i >= 0; i--) {
            const br = barrels[i];
            if (Math.abs(br.position.z - playerZ) < 1.5 && Math.abs(br.position.x - playerX) < 2.0) {
                const kills = Math.min(2, squadCount); // barrel collision kills 2 soldiers
                squadCount -= kills;
                spawnExplosion(br.position.x, br.position.z);
                spawnParticles(br.position.x, 1.0, br.position.z, 0xFF6D00, 6);
                SFX.barrelBreak();
                shake(0.6);
                scene.remove(br);
                barrels.splice(i, 1);

                if (squadCount <= 0) {
                    doGameOver();
                    return;
                }
            }
        }

        // Gate collision
        for (const gate of gates) {
            if (gate.used) continue;
            const gateZ = gate.mesh.position.z;
            if (Math.abs(gateZ - playerZ) < 1.5) {
                const onLeftSide = playerX < 0;
                const isLeftGate = gate.side === -1;
                if ((onLeftSide && isLeftGate) || (!onLeftSide && !isLeftGate)) {
                    applyGateEffect(gate);
                }
                // Mark the paired gate as used too (counts as section passed)
                if (!gate.userData) gate.userData = {};
                if (!gate.userData.sectionCounted) {
                    gate.userData.sectionCounted = true;
                    levelSectionsCompleted++;
                    // Also mark the paired gate
                    for (const g2 of gates) {
                        if (g2 !== gate && Math.abs(g2.mesh.position.z - gateZ) < 0.5) {
                            g2.used = true;
                            g2.mesh.material.opacity = 0.1;
                            g2.label.material.opacity = 0.3;
                        }
                    }
                }
            }
        }

        // Update zombie instances
        debugActiveZombies = 0;
        for (let i = 0; i < zombieHighWater; i++) if (zActive[i]) debugActiveZombies++;
        updateZombieInstances();

        // Muzzle flashes
        for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
            const m = muzzleFlashes[i];
            m.userData.life -= dt;
            if (m.scale) m.scale.setScalar(1 + (0.06 - m.userData.life) * 15);
            if (m.userData.life <= 0) { scene.remove(m); muzzleFlashes.splice(i, 1); }
        }

        // Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.position.add(p.userData.vel.clone().multiplyScalar(dt));
            p.userData.vel.y -= 10 * dt;
            p.userData.vel.multiplyScalar(0.98);
            p.userData.life -= dt;
            p.material.opacity = Math.max(0, p.userData.life * 2);
            p.scale.setScalar(1 + (1 - p.userData.life) * 1.2);
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

        // Damage numbers
        for (let i = damageNums.length - 1; i >= 0; i--) {
            const d = damageNums[i];
            d.position.y += d.userData.vy * dt;
            d.userData.life -= dt;
            d.material.opacity = Math.max(0, d.userData.life / d.userData.maxLife);
            if (d.userData.life <= 0) { scene.remove(d); damageNums.splice(i, 1); }
        }

        // Camera — fixed position, player at Z=0
        const shakeX = shakeAmount > 0.01 ? (Math.random() - 0.5) * shakeAmount * 2 : 0;
        const shakeY = shakeAmount > 0.01 ? (Math.random() - 0.5) * shakeAmount : 0;
        camera.position.set(shakeX, 16 + shakeY, 12);
        camera.lookAt(playerX * 0.3, 0, -8);
        if (shakeAmount > 0.01) shakeAmount *= 0.88;
        else shakeAmount = 0;

        // Danger vignette — when zombies close OR squad low
        let danger = false;
        for (let i = 0; i < zombieHighWater; i++) {
            if (zActive[i] && Math.abs(zZ[i] - playerZ) < 5) { danger = true; break; }
        }
        if (squadCount <= 4) danger = true;
        if (dangerVignette) {
            if (danger) {
                const pulse = 0.6 + Math.sin(Date.now() * 0.008) * 0.4;
                dangerVignette.style.opacity = pulse;
            } else {
                dangerVignette.style.opacity = '0';
            }
        }

        // Progress bar — show level completion %
        const lvl = LEVELS[currentLevel];
        if (currentLevel < LEVELS.length - 1) {
            waveBarFill.style.width = (levelSectionsCompleted / lvl.sections * 100) + '%';
        } else {
            waveBarFill.style.width = ((worldScroll % SEGMENT_LEN) / SEGMENT_LEN * 100) + '%';
        }

        // Check level completion
        if (!levelComplete && currentLevel < LEVELS.length - 1) {
            const lvl = LEVELS[currentLevel];
            if (levelSectionsCompleted >= lvl.sections) {
                // Wait until all active zombies and barrels are cleared
                let activeEnemies = 0;
                for (let i = 0; i < zombieHighWater; i++) if (zActive[i]) activeEnemies++;
                activeEnemies += barrels.length;
                if (activeEnemies === 0) {
                    doLevelComplete();
                    return;
                }
            }
        }

        updateHUD();
        renderOverlay();
    }

    // ─── Game Flow ──────────────────────────────────────────────────
    function clearEntities() {
        // Reset zombie arrays
        for (let i = 0; i < MAX_ZOMBIES; i++) zActive[i] = 0;
        zombieHighWater = 0;

        // Release bullets
        for (let i = activeBullets.length - 1; i >= 0; i--) releaseBullet(activeBullets[i]);

        // Remove scene objects
        barrels.forEach(b => scene.remove(b));
        particles.forEach(p => scene.remove(p));
        coinPickups.forEach(c => scene.remove(c));
        muzzleFlashes.forEach(m => scene.remove(m));
        damageNums.forEach(d => scene.remove(d));
        gates.forEach(g => { scene.remove(g.mesh); scene.remove(g.label); });

        barrels = []; particles = []; coinPickups = [];
        muzzleFlashes = []; damageNums = []; gates = [];

        if (dangerVignette) dangerVignette.style.opacity = '0';
    }

    function startGame() {
        clearEntities();
        playerZ = 0; playerX = 0; targetX = 0;
        worldScroll = 0;
        score = 0; coins = 0;
        const lvl = LEVELS[currentLevel];
        squadCount = lvl.startSquad;
        fireRateStat = lvl.startFR; damageStat = lvl.startDMG;
        WORLD_SPEED = lvl.speed;
        sectionCount = 0; segmentIndex = 0;
        levelSectionsCompleted = 0; levelComplete = false;
        seedRandom(currentLevel * 7919 + 42); // deterministic seed per level
        nextSegmentZ = SEGMENT_LEN * 0.4;
        fireCooldown = 0; shakeAmount = 0;
        comboCount = 0; comboTimer = 0; bestCombo = 0;
        fovTarget = baseFov;

        state = 'playing';
        startScreen.classList.add('hidden'); startScreen.classList.remove('active');
        gameoverScreen.classList.add('hidden'); gameoverScreen.classList.remove('active');
        hudEl.style.display = 'flex';
        waveBar.style.display = 'block';

        // Refresh soldier jitter
        for (let i = 0; i < MAX_SOLDIERS * 2; i++) soldierJitter[i] = (rng() - 0.5) * 2;

        generateAhead();
        updateHUD();
        const lvlName = currentLevel < LEVELS.length - 1
            ? 'Lv.' + (currentLevel + 1) + ': ' + lvl.name
            : 'ENDLESS MODE';
        showActionText(lvlName, '#feca57');
        setTimeout(() => showActionText('GO!', '#00E676'), 1500);
    }

    function doGameOver() {
        state = 'gameover';
        SFX.gameOver();
        hudEl.style.display = 'none';
        waveBar.style.display = 'none';
        goTitle.textContent = 'OVERRUN';
        goTitle.className = 'lose';
        const dist = Math.floor(worldScroll);
        const lvl = LEVELS[currentLevel];
        goWave.textContent = 'Lv.' + (currentLevel + 1) + ' "' + lvl.name + '" — ' + dist + 'm (§' + levelSectionsCompleted + '/' + lvl.sections + ')';
        goScore.textContent = score + (bestCombo >= 5 ? ' (x' + bestCombo + ' best combo!)' : '');
        const retryBtn = document.getElementById('btn-retry');
        retryBtn.textContent = 'TRY AGAIN';
        retryBtn.className = 'btn retry';
        retryBtn.onclick = () => startGame();
        gameoverScreen.classList.remove('hidden');
        gameoverScreen.classList.add('active');
        if (overlayCtx) overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }

    function doLevelComplete() {
        state = 'levelcomplete';
        levelComplete = true;
        hudEl.style.display = 'none';
        waveBar.style.display = 'none';
        if (currentLevel + 1 > unlockedLevel && currentLevel < LEVELS.length - 2) {
            unlockedLevel = currentLevel + 1;
            saveProgress();
        }
        const lvl = LEVELS[currentLevel];
        SFX.upgrade();
        setTimeout(() => SFX.combo(), 200);
        goTitle.textContent = 'LEVEL CLEAR!';
        goTitle.className = 'win';
        goWave.textContent = '"' + lvl.name + '" — ' + Math.floor(worldScroll) + 'm';
        goScore.textContent = score + (bestCombo >= 5 ? ' (x' + bestCombo + ' best combo!)' : '');
        const retryBtn = document.getElementById('btn-retry');
        if (currentLevel < LEVELS.length - 2) {
            retryBtn.textContent = 'NEXT LEVEL';
            retryBtn.className = 'btn next';
            retryBtn.onclick = () => { currentLevel++; startGame(); };
        } else {
            retryBtn.textContent = 'PLAY AGAIN';
            retryBtn.className = 'btn retry';
            retryBtn.onclick = () => startGame();
        }
        gameoverScreen.classList.remove('hidden');
        gameoverScreen.classList.add('active');
        if (overlayCtx) overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }

    // ─── Input ──────────────────────────────────────────────────────
    let dragging = false, lastPointerX = 0;
    function onDown(x) { dragging = true; lastPointerX = x; ensureAudio(); }
    function onMove(x) {
        if (!dragging) return;
        const dx = x - lastPointerX; lastPointerX = x;
        targetX = Math.max(-ROAD_W / 2 + 1, Math.min(ROAD_W / 2 - 1, targetX + dx * 0.035));
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
        fpsFrames++;

        if (keys['ArrowLeft'] || keys['a'] || keys['A']) targetX = Math.max(-ROAD_W / 2 + 1, targetX - STEER_SPEED * dt);
        if (keys['ArrowRight'] || keys['d'] || keys['D']) targetX = Math.min(ROAD_W / 2 - 1, targetX + STEER_SPEED * dt);

        update(dt);

        if (composer) composer.render();
        else renderer.render(scene, camera);

        requestAnimationFrame(loop);
    }

    // ─── Level Select UI ────────────────────────────────────────────
    function renderLevelSelect() {
        const container = document.getElementById('level-select');
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < LEVELS.length; i++) {
            const btn = document.createElement('div');
            btn.className = 'level-btn';
            if (i === currentLevel) btn.classList.add('selected');
            if (i > unlockedLevel) btn.classList.add('locked');
            if (i < unlockedLevel) btn.classList.add('cleared');
            btn.innerHTML = '<span class="lvl-num">' + (i + 1) + '</span><span class="lvl-name">' + LEVELS[i].name + '</span>';
            if (i <= unlockedLevel) {
                btn.addEventListener('click', () => {
                    currentLevel = i;
                    renderLevelSelect();
                });
            }
            container.appendChild(btn);
        }
    }

    // ─── Init ───────────────────────────────────────────────────────
    loadProgress();
    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-retry').addEventListener('click', startGame);

    initRenderer();
    initSpriteTextures();
    initBulletPool();
    initEnvironment();
    initOverlay();
    initInstancedMeshes();
    renderLevelSelect();
    requestAnimationFrame(loop);

    // Expose debug + AI interface
    window._gameDebug = () => ({
        activeZombies: debugActiveZombies, fps: lastFPS, squad: squadCount,
        section: sectionCount, level: currentLevel, levelSections: levelSectionsCompleted,
        worldScroll, score, coins, state, levelComplete
    });

    // AI steering interface for automated testing
    window._steer = (x) => { targetX = Math.max(-ROAD_W / 2 + 1, Math.min(ROAD_W / 2 - 1, x)); };
    window._getState = () => ({
        playerX, playerZ, targetX, squadCount,
        zombies: (() => {
            const z = [];
            for (let i = 0; i < zombieHighWater; i++) {
                if (zActive[i]) z.push({ x: zX[i], z: zZ[i], hp: zHP[i], type: zType[i], tracker: zTracker[i] });
            }
            return z;
        })(),
        gates: gates.filter(g => !g.used).map(g => ({ z: g.mesh.position.z, side: g.side, isGood: g.isGood, stat: g.stat })),
        barrels: barrels.map(b => ({ x: b.position.x, z: b.position.z, hp: b.userData.hp })),
    });
    window._godMode = () => { squadCount = 999; };

})();
