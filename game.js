// Math Swarm Survivor — LastTokens
// Lane-runner with upgrade gates. Steer, shoot, survive.

(function () {
    'use strict';

    // ─── Three.js Setup ─────────────────────────────────────────────
    let scene, camera, renderer, composer;
    let ambientLight;
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    function initRenderer() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1520);
        scene.fog = new THREE.FogExp2(0x1a1520, 0.012);

        camera = new THREE.PerspectiveCamera(50, W() / H(), 0.1, 300);
        camera.position.set(0, 14, 12);
        camera.lookAt(0, 0, -3);

        renderer = new THREE.WebGLRenderer({ antialias: false });
        renderer.setSize(W(), H());
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        document.body.insertBefore(renderer.domElement, document.body.firstChild);

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

        ambientLight = new THREE.AmbientLight(0x556677, 0.5);
        scene.add(ambientLight);
        scene.add(new THREE.HemisphereLight(0x334466, 0x443322, 0.4));

        const sun = new THREE.DirectionalLight(0xffeedd, 0.6);
        sun.position.set(5, 20, 10);
        sun.castShadow = true;
        sun.shadow.camera.left = -20;
        sun.shadow.camera.right = 20;
        sun.shadow.camera.top = 40;
        sun.shadow.camera.bottom = -10;
        sun.shadow.mapSize.width = 1024;
        sun.shadow.mapSize.height = 1024;
        scene.add(sun);

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
    };

    // ─── Materials ──────────────────────────────────────────────────
    const MAT = {
        road: new THREE.MeshStandardMaterial({ color: 0x444455 }),
        bullet: new THREE.MeshBasicMaterial({ color: 0xffee44 }),
        coin: new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.8, roughness: 0.2 }),
    };

    // ─── Constants ──────────────────────────────────────────────────
    const ROAD_W = 10;
    const FORWARD_SPEED = 8;
    const SEGMENT_LEN = 40;
    const GATE_OFFSET = 5;   // distance into segment for gates
    const ZOMBIE_OFFSET = 18; // distance into segment for zombie wave
    const BARREL_OFFSET = 32; // distance into segment for barrel row
    const CLEANUP_BEHIND = 30;
    const VIEW_AHEAD = 80;
    const MAX_PARTICLES = 80;
    const MAX_ZOMBIES = 50;
    const BULLET_POOL_SIZE = 150;
    const BULLET_SPEED = 40;
    const STEER_SPEED = 8;

    // ─── Procedural Sprite Textures ─────────────────────────────────
    const SPRITE_TEXTURES = {};

    function initSpriteTextures() {
        // Soldier sprite (128x128, top-down view)
        const solC = document.createElement('canvas');
        solC.width = 128; solC.height = 128;
        const s = solC.getContext('2d');
        s.beginPath(); s.arc(64, 72, 36, 0, Math.PI*2);
        s.fillStyle = 'rgba(0,0,0,0.25)'; s.fill();
        s.beginPath(); s.arc(64, 70, 42, 0, Math.PI*2);
        s.strokeStyle = 'rgba(0,255,255,0.7)'; s.lineWidth = 5; s.stroke();
        s.beginPath(); s.arc(64, 70, 38, 0, Math.PI*2);
        s.fillStyle = 'rgba(0,255,255,0.1)'; s.fill();
        s.fillStyle = '#4a5a28'; s.fillRect(52, 76, 24, 16);
        s.strokeStyle = '#3a4a1a'; s.lineWidth = 1; s.strokeRect(52, 76, 24, 16);
        s.beginPath(); s.ellipse(64, 66, 22, 26, 0, 0, Math.PI*2);
        s.fillStyle = '#6b7a3a'; s.fill();
        s.strokeStyle = '#556b2f'; s.lineWidth = 2; s.stroke();
        s.beginPath(); s.ellipse(64, 64, 18, 20, 0, 0, Math.PI*2);
        s.fillStyle = '#7a8a44'; s.fill();
        s.fillStyle = '#5a6a2e';
        s.beginPath(); s.ellipse(40, 62, 10, 8, -0.2, 0, Math.PI*2); s.fill();
        s.beginPath(); s.ellipse(88, 62, 10, 8, 0.2, 0, Math.PI*2); s.fill();
        s.fillStyle = '#556b2f';
        s.beginPath(); s.ellipse(36, 58, 8, 14, -0.3, 0, Math.PI*2); s.fill();
        s.beginPath(); s.ellipse(92, 58, 8, 14, 0.3, 0, Math.PI*2); s.fill();
        s.fillStyle = '#ddb888';
        s.beginPath(); s.arc(34, 46, 5, 0, Math.PI*2); s.fill();
        s.beginPath(); s.arc(94, 46, 5, 0, Math.PI*2); s.fill();
        s.fillStyle = '#ddb888';
        s.beginPath(); s.ellipse(64, 44, 6, 5, 0, 0, Math.PI*2); s.fill();
        s.beginPath(); s.arc(64, 36, 14, 0, Math.PI*2);
        s.fillStyle = '#ddb888'; s.fill();
        s.beginPath(); s.arc(64, 34, 16, 0, Math.PI*2);
        s.fillStyle = '#6b7a3a'; s.fill();
        s.beginPath(); s.arc(64, 34, 18, 0, Math.PI*2);
        s.strokeStyle = '#556b2f'; s.lineWidth = 2; s.stroke();
        s.fillStyle = '#8a9a54'; s.fillRect(60, 30, 8, 8);
        s.fillStyle = '#2a2a2a'; s.fillRect(60, 6, 8, 30);
        s.fillStyle = '#444'; s.fillRect(58, 6, 12, 4);
        s.fillStyle = '#3a3a3a'; s.fillRect(54, 32, 20, 12);
        s.fillStyle = '#4a4a2a'; s.fillRect(56, 34, 6, 8);
        SPRITE_TEXTURES.soldier = new THREE.CanvasTexture(solC);

        // Zombie sprites
        function makeZombieTexture(bodyColor, armColor, eyeColor, isLarge) {
            const c = document.createElement('canvas');
            c.width = 128; c.height = 128;
            const cx = 64, cy = 64;
            const ctx = c.getContext('2d');
            const sc = isLarge ? 1.2 : 1.0;
            ctx.beginPath(); ctx.arc(cx, cy+4, 30*sc, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx, cy+4, 22*sc, 26*sc, 0, 0, Math.PI*2);
            ctx.fillStyle = bodyColor; ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = armColor;
            ctx.beginPath(); ctx.ellipse(cx-8, cy+8, 8*sc, 10*sc, 0.2, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = armColor;
            ctx.beginPath(); ctx.ellipse(cx-24*sc, cy-14*sc, 8*sc, 16*sc, -0.4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx+24*sc, cy-14*sc, 8*sc, 16*sc, 0.4, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            for (let i = -1; i <= 1; i++) {
                ctx.fillRect(cx-28*sc + i*5, cy-32*sc, 3, 8*sc);
                ctx.fillRect(cx+22*sc + i*5, cy-32*sc, 3, 8*sc);
            }
            ctx.beginPath(); ctx.arc(cx, cy-18*sc, 12*sc, 0, Math.PI*2);
            ctx.fillStyle = armColor; ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.ellipse(cx, cy-14*sc, 5*sc, 3*sc, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = eyeColor;
            ctx.shadowColor = eyeColor; ctx.shadowBlur = 6;
            ctx.beginPath(); ctx.arc(cx-5*sc, cy-22*sc, 4*sc, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx+5*sc, cy-22*sc, 4*sc, 0, Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(120,30,20,0.4)';
            ctx.beginPath(); ctx.arc(cx+10, cy+10, 4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx-14, cy+2, 3, 0, Math.PI*2); ctx.fill();
            return new THREE.CanvasTexture(c);
        }

        SPRITE_TEXTURES.zombie_normal = makeZombieTexture('#779966', '#667755', '#ff2200', false);
        SPRITE_TEXTURES.zombie_fast = makeZombieTexture('#55aa99', '#448877', '#ffaa00', false);
        SPRITE_TEXTURES.zombie_brute = makeZombieTexture('#884444', '#663333', '#ff4400', true);

        // Barrel/crate sprite
        function makeBarrelTexture(glowColor) {
            const c = document.createElement('canvas');
            c.width = 128; c.height = 128;
            const ctx = c.getContext('2d');
            const grad = ctx.createRadialGradient(64, 64, 20, 64, 64, 56);
            grad.addColorStop(0, glowColor + '44');
            grad.addColorStop(1, glowColor + '00');
            ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
            ctx.fillStyle = '#3a3a3a'; ctx.fillRect(16, 16, 96, 96);
            ctx.fillStyle = '#444444'; ctx.fillRect(24, 24, 80, 80);
            ctx.fillStyle = '#3a3a3a'; ctx.fillRect(28, 28, 72, 72);
            ctx.strokeStyle = glowColor; ctx.lineWidth = 4;
            ctx.strokeRect(16, 16, 96, 96);
            ctx.strokeStyle = glowColor + '66'; ctx.lineWidth = 2;
            ctx.strokeRect(24, 24, 80, 80);
            ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(64, 20); ctx.lineTo(64, 108);
            ctx.moveTo(20, 64); ctx.lineTo(108, 64);
            ctx.stroke();
            ctx.fillStyle = glowColor + 'cc';
            for (const [bx, by] of [[20,20],[104,20],[20,104],[104,104]]) {
                ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI*2); ctx.fill();
            }
            return new THREE.CanvasTexture(c);
        }

        SPRITE_TEXTURES.barrel = makeBarrelTexture('#ff4400');
    }

    // ─── Shared zombie materials ────────────────────────────────────
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

    // ─── Procedural canvas texture helper ───────────────────────────
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
    let roadTex = null;
    let roadSegments = [];  // recycled road tiles
    let buildingGroups = []; // recycled building groups
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
                    vec3 top = vec3(0.04, 0.03, 0.08);
                    vec3 mid = vec3(0.12, 0.06, 0.04);
                    vec3 bot = vec3(0.25, 0.08, 0.02);
                    vec3 col = h > 0.0 ? mix(mid, top, h) : mix(mid, bot, -h * 2.0);
                    gl_FragColor = vec4(col, 1.0);
                }`
        });
        skyMesh = new THREE.Mesh(skyGeo, skyMat);
        scene.add(skyMesh);

        // Road texture
        roadTex = makeCanvasTexture(128, 256, (ctx, w, h) => {
            ctx.fillStyle = '#3a3230';
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 1000; i++) {
                const v = 40 + Math.random() * 30;
                ctx.fillStyle = `rgb(${v},${v-5},${v-8})`;
                ctx.fillRect(Math.random()*w, Math.random()*h, 2, 2);
            }
            ctx.strokeStyle = '#2a2520'; ctx.lineWidth = 1;
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
        roadTex.repeat.set(1, 2);

        const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95, color: 0xcccccc });
        const edgeLineMat = new THREE.MeshBasicMaterial({ color: 0xaaaa88 });
        const centerDashMat = new THREE.MeshBasicMaterial({ color: 0x888877 });
        const wallTex = makeCanvasTexture(64, 32, (ctx, w, h) => {
            ctx.fillStyle = '#555550'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 200; i++) {
                const v = 70 + Math.random() * 30;
                ctx.fillStyle = `rgb(${v},${v},${v-5})`;
                ctx.fillRect(Math.random()*w, Math.random()*h, 2, 2);
            }
        });
        const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
        const dirtTex = makeCanvasTexture(64, 64, (ctx, w, h) => {
            ctx.fillStyle = '#332820'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 400; i++) {
                const v = 30 + Math.random() * 25;
                ctx.fillStyle = `rgb(${v+10},${v},${v-5})`;
                ctx.fillRect(Math.random()*w, Math.random()*h, 3, 3);
            }
        });
        dirtTex.repeat.set(3, 2);
        const dirtMat = new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1.0, color: 0xbbbbbb });

        // Create recycled road segments
        for (let i = 0; i < NUM_ROAD_SEGS; i++) {
            const group = new THREE.Group();

            const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, ROAD_SEG_LEN), roadMat);
            road.rotation.x = -Math.PI / 2;
            road.receiveShadow = true;
            group.add(road);

            // Edge lines
            for (const side of [-1, 1]) {
                const line = new THREE.Mesh(new THREE.PlaneGeometry(0.15, ROAD_SEG_LEN), edgeLineMat);
                line.rotation.x = -Math.PI / 2;
                line.position.set(side * (ROAD_W / 2 - 0.3), 0.01, 0);
                group.add(line);
            }

            // Center dashes
            for (let dz = -ROAD_SEG_LEN/2 + 1; dz < ROAD_SEG_LEN/2; dz += 3) {
                const dash = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 1.2), centerDashMat);
                dash.position.set(0, 0.01, dz);
                group.add(dash);
            }

            // Side walls
            for (const side of [-1, 1]) {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, ROAD_SEG_LEN), wallMat);
                wall.position.set(side * (ROAD_W / 2 + 0.4), 0.35, 0);
                wall.castShadow = true;
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

        // Building silhouettes (recycled groups)
        const buildingMat = new THREE.MeshStandardMaterial({ color: 0x151518, roughness: 1.0 });
        const windowMat = new THREE.MeshBasicMaterial({ color: 0xff9944, transparent: true, opacity: 0.6 });

        for (let gi = 0; gi < NUM_BUILDING_GROUPS; gi++) {
            const group = new THREE.Group();
            for (const side of [-1, 1]) {
                for (let bi = 0; bi < 3; bi++) {
                    const bw = 3 + Math.random() * 5;
                    const bh = 5 + Math.random() * 12;
                    const bd = 3 + Math.random() * 5;
                    const bx = side * (ROAD_W / 2 + 3 + Math.random() * 12);
                    const bz = -ROAD_SEG_LEN/2 + bi * (ROAD_SEG_LEN/3) + Math.random() * 3;
                    const building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), buildingMat);
                    building.position.set(bx, bh / 2, bz);
                    building.castShadow = true;
                    group.add(building);

                    if (Math.random() < 0.5) {
                        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), windowMat);
                        win.position.set(
                            bx + (side > 0 ? -bw/2 - 0.01 : bw/2 + 0.01),
                            2 + Math.random() * (bh - 3),
                            bz + (Math.random() - 0.5) * (bd - 1)
                        );
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

    // ─── Sprite-based Character Creation ────────────────────────────

    function createSoldierSprite() {
        const mat = new THREE.SpriteMaterial({
            map: SPRITE_TEXTURES.soldier,
            transparent: true,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(3.0, 3.0, 1);
        sprite.position.y = 1.5;
        const g = new THREE.Group();
        g.add(sprite);
        g.userData = { sprite, phase: Math.random() * Math.PI * 2 };
        return g;
    }

    function createZombieSprite(type) {
        const baseMat = getZombieSpriteMat(type || 'normal');
        const mat = baseMat.clone();
        const isLarge = type === 'brute';
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(isLarge ? 4.5 : 3.0, isLarge ? 4.5 : 3.0, 1);
        sprite.position.y = isLarge ? 1.8 : 1.3;
        sprite.userData = { phase: Math.random() * Math.PI * 2, origMat: mat };
        return sprite;
    }

    function createBarrelObj() {
        const g = new THREE.Group();
        const mat = new THREE.SpriteMaterial({
            map: SPRITE_TEXTURES.barrel,
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
        canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 72px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 6;
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
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 6;
        ctx.strokeText(text, canvas.width/2, 64);
        ctx.fillStyle = color || '#fff'; ctx.fillText(text, canvas.width/2, 64);
        tex.needsUpdate = true;
    }

    // ─── Game State ─────────────────────────────────────────────────
    let state = 'menu';
    let playerZ = 0;
    let playerX = 0;
    let targetX = 0;
    let score = 0, coins = 0;
    let squadCount = 5;
    let fireRateStat = 3;
    let damageStat = 1;
    let sectionCount = 0;
    let nextSegmentZ = 0; // Z of next segment to generate (negative = forward)
    let shakeAmount = 0;

    let squadSprites = [];
    let zombies = [];       // { group, hp, maxHp, speed, z, sprites[] }
    let barrels = [];        // { group, hp, maxHp, hpLabel, z }
    let gates = [];          // { mesh, label, type, stat, value, side, z, used }
    let particles = [];
    let coinPickups = [];
    let damageNums = [];
    let muzzleFlashes = [];

    // Bullet object pool
    let bulletPool = [];
    let activeBullets = [];
    let fireCooldown = 0;

    // Segment tracking
    const SEGMENT_TYPES = ['gates', 'zombies', 'barrels'];
    let segmentIndex = 0;

    // ─── Bullet Pool ────────────────────────────────────────────────
    function initBulletPool() {
        for (let i = 0; i < BULLET_POOL_SIZE; i++) {
            const g = new THREE.Group();
            const core = new THREE.Mesh(
                new THREE.SphereGeometry(0.15, 4, 4),
                new THREE.MeshBasicMaterial({ color: 0xffffaa })
            );
            g.add(core);
            const glow = new THREE.Mesh(
                new THREE.SphereGeometry(0.3, 4, 4),
                new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.4 })
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
                b.userData.vz = -BULLET_SPEED; // forward = negative Z
                b.position.set(x + (Math.random()-0.5)*0.15, y, z);
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

    // ─── Squad Management ───────────────────────────────────────────
    function rebuildSquad() {
        squadSprites.forEach(s => scene.remove(s));
        squadSprites = [];
        const count = Math.min(squadCount, 30); // visual cap
        const spread = Math.min(count - 1, 5) * 0.7;
        for (let i = 0; i < count; i++) {
            const soldier = createSoldierSprite();
            const ox = count === 1 ? 0 : -spread / 2 + (i / Math.max(1, count - 1)) * spread;
            soldier.userData.offsetX = ox;
            soldier.userData.offsetZ = (Math.random() - 0.5) * 0.5;
            scene.add(soldier);
            squadSprites.push(soldier);
        }
    }

    // ─── Gate Creation ──────────────────────────────────────────────
    function createGate(z, side, type, stat, value) {
        // side: -1 = left, 1 = right
        const gateX = side * (ROAD_W / 4);
        const w = ROAD_W / 2 - 0.5;
        const h = 4;

        const isGood = (type === 'add' && value > 0) || (type === 'multiply' && value > 1);
        const color = isGood ? 0x2288ff : 0xff4422;
        const colorHex = isGood ? '#2288ff' : '#ff4422';

        // Semi-transparent box
        const geo = new THREE.BoxGeometry(w, h, 0.5);
        const mat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(gateX, h / 2, z);

        // Glow edges
        const edgeGeo = new THREE.EdgesGeometry(geo);
        const edgeMat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.7 });
        const edges = new THREE.LineSegments(edgeGeo, edgeMat);
        mesh.add(edges);

        scene.add(mesh);

        // Label
        const statNames = { squad: 'Squad', fireRate: 'Fire Rate', damage: 'Damage' };
        const opStr = type === 'add' ? (value >= 0 ? '+' : '') + value : 'x' + value;
        const labelText = opStr + ' ' + statNames[stat];
        const label = createTextSprite(labelText, colorHex, 1.2);
        label.position.set(gateX, h + 1.2, z);
        scene.add(label);

        const gate = { mesh, label, type, stat, value, side, z, used: false, isGood };
        gates.push(gate);
        return gate;
    }

    // ─── Segment Generation ─────────────────────────────────────────
    function generateSegment(segZ) {
        const segType = SEGMENT_TYPES[segmentIndex % 3];
        segmentIndex++;

        if (segType === 'gates') {
            sectionCount++;
            generateGatePair(segZ + GATE_OFFSET);
        } else if (segType === 'zombies') {
            generateZombieWave(segZ + ZOMBIE_OFFSET);
        } else if (segType === 'barrels') {
            generateBarrelRow(segZ + BARREL_OFFSET);
        }
    }

    function generateGatePair(z) {
        const sec = sectionCount;
        // Pick two different stats
        const stats = ['squad', 'fireRate', 'damage'];
        const s1 = stats[Math.floor(Math.random() * stats.length)];
        let s2 = stats[Math.floor(Math.random() * stats.length)];

        // Generate values that scale with section count
        function makeGoodValue(stat) {
            if (stat === 'squad') {
                if (sec < 3) return { type: 'add', value: 1 + Math.floor(Math.random() * 2) };
                if (sec < 6) return { type: 'add', value: 2 + Math.floor(Math.random() * 3) };
                if (Math.random() < 0.2) return { type: 'multiply', value: 2 };
                return { type: 'add', value: 3 + Math.floor(Math.random() * 5) };
            } else if (stat === 'fireRate') {
                if (sec < 4) return { type: 'add', value: 1 };
                return { type: 'add', value: 1 + Math.floor(Math.random() * 2) };
            } else { // damage
                if (sec < 4) return { type: 'add', value: 1 };
                if (Math.random() < 0.2) return { type: 'multiply', value: 2 };
                return { type: 'add', value: 1 };
            }
        }

        function makeBadValue(stat) {
            if (stat === 'squad') {
                const penalty = Math.min(2 + Math.floor(sec * 0.6), 8);
                return { type: 'add', value: -penalty };
            } else if (stat === 'fireRate') {
                return { type: 'add', value: -(1 + Math.floor(Math.random() * Math.min(sec * 0.4, 3))) };
            } else {
                return { type: 'add', value: -(1 + Math.floor(sec * 0.3)) };
            }
        }

        // Decide: one good, one bad — bad gates become more likely at higher sections
        const leftIsGood = Math.random() < 0.5;
        const goodVal = makeGoodValue(s1);
        const badChance = Math.min(0.7, 0.4 + sec * 0.05);
        const badVal = Math.random() < badChance ? makeBadValue(s2) : makeGoodValue(s2);

        if (leftIsGood) {
            createGate(-z, -1, goodVal.type, s1, goodVal.value);
            createGate(-z, 1, badVal.type, s2, badVal.value);
        } else {
            createGate(-z, -1, badVal.type, s2, badVal.value);
            createGate(-z, 1, goodVal.type, s1, goodVal.value);
        }
    }

    function generateZombieWave(z) {
        const sec = sectionCount;
        const count = Math.min(5 + sec * 3, 30);
        const baseHp = 1 + sec;

        for (let i = 0; i < count; i++) {
            if (zombies.length >= MAX_ZOMBIES) break;
            // Spawn spread across road, with some clustering toward center
            const zx = (Math.random() - 0.5) * (ROAD_W - 1.5);
            const zz = -z - (Math.random() - 0.5) * 6;
            const hp = Math.max(1, Math.ceil(baseHp + Math.random() * sec * 0.5));
            spawnZombie(zx, zz, hp);
        }
    }

    function spawnZombie(x, z, hp) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        const spriteCount = Math.min(hp, 8);
        const sprites = [];
        const spread = Math.min(1.2, 0.3 + spriteCount * 0.1);
        const types = ['normal', 'fast', 'brute'];
        const type = hp > 5 ? 'brute' : (Math.random() < 0.3 ? 'fast' : 'normal');

        for (let i = 0; i < spriteCount; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * spread;
            const zombie = createZombieSprite(type);
            zombie.position.set(Math.cos(a) * r, zombie.position.y, Math.sin(a) * r);
            group.add(zombie);
            sprites.push(zombie);
        }

        const speed = 2.0 + Math.random() * 1.5 + sectionCount * 0.3;

        // HP label
        const hpLabel = createTextSprite(hp.toString(), '#ff4444', 1.0);
        hpLabel.position.set(0, 3.5, 0);
        group.add(hpLabel);

        group.userData = { hp, maxHp: hp, speed, sprites, hpLabel, type, wobble: Math.random() * Math.PI * 2 };
        scene.add(group);
        zombies.push(group);
    }

    function generateBarrelRow(z) {
        const sec = sectionCount;
        const count = Math.min(1 + Math.floor(sec / 3), 3);
        const hp = 5 + sec * 5;

        // Spread barrels across road — always include center-ish position
        const positions = [];
        if (count === 1) {
            // 50% chance center, 50% off-center
            if (Math.random() < 0.5) {
                positions.push((Math.random() - 0.5) * 1.5); // near center
            } else {
                positions.push((Math.random() - 0.5) * (ROAD_W - 3));
            }
        } else if (count === 2) {
            positions.push(-ROAD_W / 4 + (Math.random() - 0.5) * 1.5);
            positions.push(ROAD_W / 4 + (Math.random() - 0.5) * 1.5);
        } else {
            positions.push(-ROAD_W / 3);
            positions.push(0);
            positions.push(ROAD_W / 3);
        }

        for (const bx of positions) {
            const barrel = createBarrelObj();
            barrel.position.set(bx, 0, -z);

            const hpLabel = createTextSprite(hp.toString(), '#00ffdd', 1.5);
            hpLabel.position.set(0, 3.0, 0);
            barrel.add(hpLabel);

            barrel.userData = { hp, maxHp: hp, hpLabel };
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
                vel: new THREE.Vector3((Math.random()-0.5)*6, Math.random()*6+2, (Math.random()-0.5)*6),
                life: 0.4 + Math.random() * 0.4,
            };
            addParticle(mesh);
        }
    }

    function spawnExplosion(x, z) {
        const fireball = new THREE.Mesh(
            new THREE.SphereGeometry(0.8, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.8 })
        );
        fireball.position.set(x, 0.8, z);
        fireball.userData = { vel: new THREE.Vector3(0, 1, 0), life: 0.25 };
        addParticle(fireball);

        const colors = [0xff4400, 0xff8800, 0xffcc00];
        for (let i = 0; i < 8; i++) {
            const c = colors[Math.floor(Math.random() * colors.length)];
            const size = 0.08 + Math.random() * 0.15;
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(size, 3, 3),
                new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1 })
            );
            mesh.position.set(x + (Math.random()-0.5)*0.8, 0.2 + Math.random()*0.5, z + (Math.random()-0.5)*0.8);
            mesh.userData = {
                vel: new THREE.Vector3((Math.random()-0.5)*5, Math.random()*5+2, (Math.random()-0.5)*5),
                life: 0.2 + Math.random() * 0.4,
            };
            addParticle(mesh);
        }
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
        const text = damage.toString();
        const color = '#ffdd00';
        const scale = 0.4 + Math.random() * 0.2;
        const sprite = createTextSprite(text, color, scale);
        sprite.position.set(x + (Math.random() - 0.5) * 0.6, y, z);
        sprite.userData.vy = 3;
        sprite.userData.life = 0.6;
        sprite.userData.maxLife = 0.6;
        scene.add(sprite);
        damageNums.push(sprite);
    }

    // ─── White Flash on Damage ──────────────────────────────────────
    const WHITE_SPRITE_MAT = new THREE.SpriteMaterial({ color: 0xffffff });
    function flashEnemyWhite(enemyGroup) {
        const origMaterials = [];
        enemyGroup.userData.sprites.forEach(zombie => {
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

    // ─── Muzzle Flash ───────────────────────────────────────────────
    function spawnMuzzleFlash(x, z) {
        const flash = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 1.0 })
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
    function updateHUD() {
        const dist = Math.floor(Math.abs(playerZ));
        distDisplay.textContent = dist + 'm';
        squadDisplay.textContent = squadCount;
        coinDisplay.textContent = coins;
        statsDisplay.textContent = 'DMG:' + damageStat + ' FR:' + fireRateStat.toFixed(1);
    }

    // ─── Apply Gate Effect ──────────────────────────────────────────
    function applyGateEffect(gate) {
        if (gate.used) return;
        gate.used = true;

        let val = gate.value;
        const stat = gate.stat;
        const type = gate.type;

        if (stat === 'squad') {
            if (type === 'add') squadCount = Math.max(1, squadCount + val);
            else squadCount = Math.max(1, Math.floor(squadCount * val));
        } else if (stat === 'fireRate') {
            if (type === 'add') fireRateStat = Math.max(0.5, Math.min(10, fireRateStat + val));
            else fireRateStat = Math.max(0.5, Math.min(10, fireRateStat * val));
        } else if (stat === 'damage') {
            if (type === 'add') damageStat = Math.max(1, damageStat + val);
            else damageStat = Math.max(1, Math.floor(damageStat * val));
        }

        rebuildSquad();

        // Visual feedback
        const opStr = type === 'add' ? (val >= 0 ? '+' : '') + val : 'x' + val;
        const statNames = { squad: 'Squad', fireRate: 'Fire Rate', damage: 'Damage' };
        const txt = opStr + ' ' + statNames[stat] + '!';

        if (gate.isGood) {
            SFX.upgrade();
            showActionText(txt, '#44ff88');
        } else {
            SFX.gateBad();
            showActionText(txt, '#ff4444');
        }

        // Fade gate
        gate.mesh.material.opacity = 0.1;
        gate.label.material.opacity = 0.3;

        shake(0.3);
    }

    // ─── Cleanup ────────────────────────────────────────────────────
    function cleanupBehind() {
        const behindZ = playerZ + CLEANUP_BEHIND;

        // Zombies behind
        for (let i = zombies.length - 1; i >= 0; i--) {
            if (zombies[i].position.z > behindZ) {
                scene.remove(zombies[i]);
                zombies.splice(i, 1);
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
            if (gates[i].z < -behindZ) { // gates stored with z = negative
                // gate.z is stored as -z (positive forward)... actually let me check
                // gates[i].mesh.position.z > behindZ
                if (gates[i].mesh.position.z > behindZ) {
                    scene.remove(gates[i].mesh);
                    scene.remove(gates[i].label);
                    gates.splice(i, 1);
                }
            }
        }
    }

    // ─── Segment Generation Control ─────────────────────────────────
    function generateAhead() {
        while (nextSegmentZ < Math.abs(playerZ) + VIEW_AHEAD) {
            generateSegment(nextSegmentZ);
            nextSegmentZ += SEGMENT_LEN;
        }
    }

    // ─── Recycle Road Segments ──────────────────────────────────────
    function recycleRoad() {
        const totalLen = NUM_ROAD_SEGS * ROAD_SEG_LEN;
        for (const seg of roadSegments) {
            // If segment is behind the player
            while (seg.position.z > playerZ + ROAD_SEG_LEN) {
                seg.position.z -= totalLen;
            }
        }
        for (const bg of buildingGroups) {
            const btotalLen = NUM_BUILDING_GROUPS * ROAD_SEG_LEN;
            while (bg.position.z > playerZ + ROAD_SEG_LEN) {
                bg.position.z -= btotalLen;
            }
        }
        // Move sky with player
        if (skyMesh) {
            skyMesh.position.z = playerZ;
        }
    }

    // ─── Find Nearest Target ────────────────────────────────────────
    function findNearestTarget() {
        let nearest = null;
        let nearestDist = Infinity;

        // Check zombies
        for (const z of zombies) {
            if (z.position.z > playerZ) continue; // behind us
            const dist = Math.abs(z.position.z - playerZ);
            if (dist < nearestDist && dist < 50) {
                nearestDist = dist;
                nearest = z;
            }
        }

        // Check barrels
        for (const b of barrels) {
            if (b.position.z > playerZ) continue;
            const dist = Math.abs(b.position.z - playerZ);
            if (dist < nearestDist && dist < 50) {
                nearestDist = dist;
                nearest = b;
            }
        }

        return nearest;
    }

    // ─── Main Update ────────────────────────────────────────────────
    function update(dt) {
        if (state !== 'playing') return;

        const time = Date.now() * 0.001;

        // ── Forward movement ──
        playerZ -= FORWARD_SPEED * dt;

        // ── Horizontal steering (smooth lerp) ──
        playerX += (targetX - playerX) * Math.min(1, 10 * dt);
        playerX = Math.max(-ROAD_W/2 + 1, Math.min(ROAD_W/2 - 1, playerX));

        // ── Generate segments ahead ──
        generateAhead();

        // ── Recycle road tiles ──
        recycleRoad();

        // ── Cleanup behind ──
        cleanupBehind();

        // ── Update squad positions ──
        for (const s of squadSprites) {
            s.position.x = playerX + s.userData.offsetX;
            s.position.z = playerZ + s.userData.offsetZ;
            // Bob animation
            const bob = Math.abs(Math.sin(time * 4 + s.userData.phase)) * 0.05;
            s.position.y = bob;
        }

        // ── Auto-fire ──
        fireCooldown -= dt;
        if (fireCooldown <= 0 && squadSprites.length > 0) {
            const target = findNearestTarget();
            if (target) {
                for (const s of squadSprites) {
                    getBullet(s.position.x, 0.4, s.position.z, damageStat);
                }
                if (squadSprites.length > 0) {
                    spawnMuzzleFlash(squadSprites[0].position.x, squadSprites[0].position.z);
                }
                SFX.shoot();
            }
            fireCooldown = 1 / fireRateStat;
        }

        // ── Update bullets ──
        for (let i = activeBullets.length - 1; i >= 0; i--) {
            const b = activeBullets[i];
            b.position.z += b.userData.vz * dt;

            // Too far ahead or behind
            if (b.position.z < playerZ - 60 || b.position.z > playerZ + 10) {
                releaseBullet(b);
                continue;
            }

            // Hit zombies
            let hit = false;
            for (let j = zombies.length - 1; j >= 0; j--) {
                const z = zombies[j];
                const dx = Math.abs(b.position.x - z.position.x);
                const dz = Math.abs(b.position.z - z.position.z);
                const hr = 1.0 + z.userData.sprites.length * 0.05;
                if (dx < hr && dz < hr) {
                    const dmg = b.userData.damage;
                    z.userData.hp -= dmg;
                    spawnDamageNumber(b.position.x, 1.5, b.position.z, dmg);
                    SFX.hit();
                    flashEnemyWhite(z);

                    // Remove zombie sprites visually
                    const kills = Math.min(dmg, z.userData.sprites.length);
                    for (let k = 0; k < kills && z.userData.sprites.length > 0; k++) {
                        const dead = z.userData.sprites.pop();
                        spawnParticles(z.position.x + dead.position.x, 0.5, z.position.z, 0x779966, 2);
                        z.remove(dead);
                    }

                    // Update HP label
                    if (z.userData.hp > 0) {
                        updateSpriteText(z.userData.hpLabel, z.userData.hp.toString(), '#ff4444');
                    }

                    if (z.userData.hp <= 0) {
                        const reward = Math.ceil(z.userData.maxHp * 0.5);
                        coins += reward;
                        score += z.userData.maxHp * 10;
                        spawnCoinPickup(z.position.x, z.position.z, reward);
                        spawnExplosion(z.position.x, z.position.z);
                        SFX.enemyDie();
                        scene.remove(z);
                        zombies.splice(j, 1);
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

                    if (br.userData.hp > 0) {
                        updateSpriteText(br.userData.hpLabel, br.userData.hp.toString(), '#ffffff');
                    } else {
                        // Barrel destroyed — drop coins
                        const reward = Math.ceil(br.userData.maxHp * 0.3);
                        coins += reward;
                        score += br.userData.maxHp * 5;
                        spawnCoinPickup(br.position.x, br.position.z, reward);
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

        // ── Move zombies toward player ──
        for (let i = zombies.length - 1; i >= 0; i--) {
            const z = zombies[i];
            // Move toward player
            const dz = playerZ - z.position.z;
            const dir = Math.sign(dz);
            z.position.z += dir * z.userData.speed * dt;

            // Slight attraction toward group center (swarm behavior)
            const dx = playerX - z.position.x;
            z.position.x += Math.sign(dx) * Math.min(Math.abs(dx), 1.5 * dt);

            // Wobble
            z.position.x += Math.sin(time * 1.5 + z.userData.wobble) * 0.2 * dt;
            z.position.x = Math.max(-ROAD_W/2 + 0.5, Math.min(ROAD_W/2 - 0.5, z.position.x));

            // Animate sprites
            for (const sp of z.userData.sprites) {
                sp.position.y = (sp.scale.y > 2 ? 1.2 : 0.9) + Math.abs(Math.sin(time * 3 + sp.userData.phase)) * 0.1;
            }

            // Reached player?
            if (Math.abs(z.position.z - playerZ) < 1.5 && Math.abs(z.position.x - playerX) < 2.5) {
                // Each remaining HP kills one squad member
                const kills = Math.min(z.userData.hp, squadCount);
                squadCount -= kills;
                for (let k = 0; k < kills && squadSprites.length > 0; k++) {
                    const lost = squadSprites.pop();
                    spawnParticles(lost.position.x, 0.5, lost.position.z, 0x556B2F, 4);
                    scene.remove(lost);
                }
                spawnExplosion(z.position.x, z.position.z);
                SFX.enemyDie();
                shake(0.5);
                scene.remove(z);
                zombies.splice(i, 1);

                if (squadCount <= 0) {
                    doGameOver();
                    return;
                }
                rebuildSquad();
            }
        }

        // ── Check barrel collisions (player runs into barrel with HP > 0) ──
        for (let i = barrels.length - 1; i >= 0; i--) {
            const br = barrels[i];
            if (Math.abs(br.position.z - playerZ) < 1.5 && Math.abs(br.position.x - playerX) < 2.0) {
                // Lose squad members = remaining HP
                const kills = Math.min(br.userData.hp, squadCount);
                squadCount -= kills;
                for (let k = 0; k < kills && squadSprites.length > 0; k++) {
                    const lost = squadSprites.pop();
                    spawnParticles(lost.position.x, 0.5, lost.position.z, 0x556B2F, 4);
                    scene.remove(lost);
                }
                spawnExplosion(br.position.x, br.position.z);
                SFX.barrelBreak();
                shake(0.5);
                scene.remove(br);
                barrels.splice(i, 1);

                if (squadCount <= 0) {
                    doGameOver();
                    return;
                }
                rebuildSquad();
            }
        }

        // ── Check gate collisions ──
        for (const gate of gates) {
            if (gate.used) continue;
            const gateZ = gate.mesh.position.z;
            if (Math.abs(gateZ - playerZ) < 1.5) {
                // Check if player is on this gate's side (must be clearly on one side)
                const gateX = gate.mesh.position.x;
                // Player must be within the gate's half of the road
                // Left gate covers x < 0, right gate covers x >= 0
                const onLeftSide = playerX < 0;
                const isLeftGate = gate.side === -1;
                if ((onLeftSide && isLeftGate) || (!onLeftSide && !isLeftGate)) {
                    applyGateEffect(gate);
                }
            }
        }

        // ── Muzzle flashes ──
        for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
            const m = muzzleFlashes[i];
            m.userData.life -= dt;
            if (m.scale) m.scale.setScalar(1 + (0.06 - m.userData.life) * 12);
            if (m.userData.life <= 0) { scene.remove(m); muzzleFlashes.splice(i, 1); }
        }

        // ── Particles ──
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.position.add(p.userData.vel.clone().multiplyScalar(dt));
            p.userData.vel.y -= 10 * dt;
            p.userData.vel.multiplyScalar(0.98);
            p.userData.life -= dt;
            p.material.opacity = Math.max(0, p.userData.life * 2);
            const scale = 1 + (1 - p.userData.life) * 1.2;
            p.scale.setScalar(scale);
            if (p.userData.life <= 0) { scene.remove(p); particles.splice(i, 1); }
        }

        // ── Coin pickups ──
        for (let i = coinPickups.length - 1; i >= 0; i--) {
            const c = coinPickups[i];
            c.position.y += c.userData.vy * dt;
            c.userData.vy -= 8 * dt;
            c.rotation.y += dt * 5;
            c.userData.life -= dt;
            if (c.userData.life <= 0) { scene.remove(c); coinPickups.splice(i, 1); SFX.coin(); }
        }

        // ── Damage numbers ──
        for (let i = damageNums.length - 1; i >= 0; i--) {
            const d = damageNums[i];
            d.position.y += d.userData.vy * dt;
            d.userData.life -= dt;
            d.material.opacity = Math.max(0, d.userData.life / d.userData.maxLife);
            if (d.userData.life <= 0) { scene.remove(d); damageNums.splice(i, 1); }
        }

        // ── Camera ──
        const camTargetZ = playerZ + 12;
        const camTargetY = 14;
        const shakeX = shakeAmount > 0.01 ? (Math.random()-0.5) * shakeAmount * 2 : 0;
        const shakeY = shakeAmount > 0.01 ? (Math.random()-0.5) * shakeAmount : 0;
        camera.position.set(shakeX, camTargetY + shakeY, camTargetZ);
        camera.lookAt(playerX * 0.3, 0, playerZ - 3);
        if (shakeAmount > 0.01) shakeAmount *= 0.88;
        else shakeAmount = 0;

        // ── Danger vignette ──
        let dangerClose = false;
        for (const z of zombies) {
            if (Math.abs(z.position.z - playerZ) < 5) { dangerClose = true; break; }
        }
        if (dangerVignette) {
            if (dangerClose) {
                const pulse = 0.6 + Math.sin(Date.now() * 0.008) * 0.4;
                dangerVignette.style.opacity = pulse;
            } else {
                dangerVignette.style.opacity = '0';
            }
        }

        // ── Progress bar (section progress) ──
        const segProgress = (Math.abs(playerZ) % SEGMENT_LEN) / SEGMENT_LEN;
        waveBarFill.style.width = (segProgress * 100) + '%';

        updateHUD();
    }

    // ─── Game Flow ──────────────────────────────────────────────────
    function clearEntities() {
        zombies.forEach(e => scene.remove(e));
        barrels.forEach(b => scene.remove(b));
        // Release all active bullets
        for (let i = activeBullets.length - 1; i >= 0; i--) {
            releaseBullet(activeBullets[i]);
        }
        particles.forEach(p => scene.remove(p));
        coinPickups.forEach(c => scene.remove(c));
        muzzleFlashes.forEach(m => scene.remove(m));
        squadSprites.forEach(s => scene.remove(s));
        damageNums.forEach(d => scene.remove(d));
        gates.forEach(g => { scene.remove(g.mesh); scene.remove(g.label); });
        zombies = []; barrels = []; particles = []; coinPickups = [];
        muzzleFlashes = []; squadSprites = []; damageNums = []; gates = [];
        if (dangerVignette) dangerVignette.classList.remove('active');
    }

    function startGame() {
        clearEntities();
        playerZ = 0;
        playerX = 0;
        targetX = 0;
        score = 0;
        coins = 0;
        squadCount = 5;
        fireRateStat = 3;
        damageStat = 1;
        sectionCount = 0;
        segmentIndex = 0;
        nextSegmentZ = SEGMENT_LEN * 0.5; // first segment a bit ahead
        fireCooldown = 0;
        shakeAmount = 0;

        state = 'playing';
        startScreen.classList.add('hidden'); startScreen.classList.remove('active');
        gameoverScreen.classList.add('hidden'); gameoverScreen.classList.remove('active');
        hudEl.style.display = 'flex';
        waveBar.style.display = 'block';

        rebuildSquad();
        generateAhead();
        updateHUD();
        showActionText('GO!', '#44ff88');
    }

    function doGameOver() {
        state = 'gameover';
        SFX.gameOver();
        hudEl.style.display = 'none';
        waveBar.style.display = 'none';
        goTitle.textContent = 'OVERRUN';
        goTitle.className = 'lose';
        const dist = Math.floor(Math.abs(playerZ));
        goWave.textContent = dist + 'm (Section ' + sectionCount + ')';
        goScore.textContent = score;
        gameoverScreen.classList.remove('hidden');
        gameoverScreen.classList.add('active');
    }

    // ─── Input ──────────────────────────────────────────────────────
    let dragging = false, lastPointerX = 0;
    function onDown(x) { dragging = true; lastPointerX = x; ensureAudio(); }
    function onMove(x) {
        if (!dragging) return;
        const dx = x - lastPointerX; lastPointerX = x;
        targetX = Math.max(-ROAD_W/2 + 1, Math.min(ROAD_W/2 - 1, targetX + dx * 0.035));
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

        // Keyboard steering
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) targetX = Math.max(-ROAD_W/2 + 1, targetX - STEER_SPEED * dt);
        if (keys['ArrowRight'] || keys['d'] || keys['D']) targetX = Math.min(ROAD_W/2 - 1, targetX + STEER_SPEED * dt);

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

    initRenderer();
    initSpriteTextures();
    initBulletPool();
    initEnvironment();
    requestAnimationFrame(loop);
})();
