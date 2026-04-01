// Number Shooter — LastTokens
// Built with leftover AI tokens for the public good.

(function () {
    'use strict';

    // ─── Canvas Setup ───────────────────────────────────────────────
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    // ─── DOM refs ───────────────────────────────────────────────────
    const startScreen = document.getElementById('start-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const hud = document.getElementById('hud');
    const scoreVal = document.getElementById('score-val');
    const waveVal = document.getElementById('wave-val');
    const shootersVal = document.getElementById('shooters-val');
    const powerVal = document.getElementById('power-val');
    const finalScore = document.getElementById('final-score');
    const finalWave = document.getElementById('final-wave');

    // ─── Game State ─────────────────────────────────────────────────
    let state = 'menu'; // menu | playing | gameover
    let score = 0;
    let wave = 0;
    let shooterCount = 1;
    let bulletPower = 1;
    let fireRate = 8; // frames between shots
    let fireCooldown = 0;
    let aimX = 0; // where the player is aiming (x coord)

    // Entity arrays
    let bullets = [];
    let enemies = [];
    let gates = [];
    let particles = [];
    let floatingTexts = [];

    // Lane config
    const LANE_COUNT = 5;
    const ENEMY_ROW_GAP = 90;
    const SCROLL_BASE_SPEED = 0.4;
    let scrollSpeed = SCROLL_BASE_SPEED;
    let spawnY = 0; // next spawn row Y (moves down as we scroll)

    // ─── Player ─────────────────────────────────────────────────────
    function playerBaseY() { return canvas.height - 100; }
    function playerX() { return canvas.width / 2; }
    function laneWidth() { return canvas.width / LANE_COUNT; }
    function laneCenter(lane) { return laneWidth() * (lane + 0.5); }

    // ─── Colors ─────────────────────────────────────────────────────
    const COLORS = {
        bullet: '#00e5ff',
        enemy: '#ff4466',
        enemyText: '#fff',
        gate_multiply: '#00ff88',
        gate_power: '#ffaa00',
        gate_speed: '#ff44ff',
        particle: ['#00e5ff', '#ff4466', '#00ff88', '#ffaa00', '#ff44ff', '#fff'],
    };

    function hpColor(hp, maxHp) {
        const ratio = hp / maxHp;
        if (ratio > 0.6) return '#ff4466';
        if (ratio > 0.3) return '#ff8844';
        return '#ffcc00';
    }

    // ─── Spawn Helpers ──────────────────────────────────────────────
    function spawnWave() {
        wave++;
        waveVal.textContent = wave;
        scrollSpeed = SCROLL_BASE_SPEED + wave * 0.04;

        const rowCount = Math.min(3 + Math.floor(wave / 2), 8);
        const baseHp = Math.floor(5 + wave * 3 + wave * wave * 0.3);

        for (let r = 0; r < rowCount; r++) {
            const y = -r * ENEMY_ROW_GAP - 100;
            // How many enemies in this row (2-5)
            const count = Math.min(2 + Math.floor(Math.random() * (1 + wave / 3)), LANE_COUNT);
            // Pick random lanes
            const lanes = shuffle([0, 1, 2, 3, 4]).slice(0, count);

            for (const lane of lanes) {
                const hp = Math.floor(baseHp * (0.7 + Math.random() * 0.6));
                enemies.push({
                    x: laneCenter(lane),
                    y: y,
                    lane: lane,
                    hp: hp,
                    maxHp: hp,
                    w: laneWidth() * 0.75,
                    h: 50,
                });
            }

            // Add a gate in an empty lane sometimes
            if (Math.random() < 0.5) {
                const emptyLanes = [0, 1, 2, 3, 4].filter(l => !lanes.includes(l));
                if (emptyLanes.length > 0) {
                    const gateLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)];
                    spawnGate(gateLane, y);
                }
            }
        }

        // Bonus gate row between waves
        const gateY = -rowCount * ENEMY_ROW_GAP - 100;
        const gateLane1 = Math.floor(Math.random() * LANE_COUNT);
        spawnGate(gateLane1, gateY);
        let gateLane2 = (gateLane1 + 2 + Math.floor(Math.random() * 2)) % LANE_COUNT;
        spawnGate(gateLane2, gateY);
    }

    function spawnGate(lane, y) {
        const type = pickGateType();
        let value;
        if (type === 'multiply') {
            value = Math.random() < 0.5 ? 2 : 3;
        } else if (type === 'power') {
            value = 1 + Math.floor(Math.random() * 2);
        } else {
            value = 1;
        }
        gates.push({
            x: laneCenter(lane),
            y: y,
            lane: lane,
            type: type,
            value: value,
            w: laneWidth() * 0.75,
            h: 50,
            collected: false,
        });
    }

    function pickGateType() {
        const r = Math.random();
        if (r < 0.45) return 'multiply';  // x2, x3 shooters
        if (r < 0.80) return 'power';     // +1, +2 bullet power
        return 'speed';                     // faster fire rate
    }

    // ─── Bullet ─────────────────────────────────────────────────────
    function fireBullets() {
        if (fireCooldown > 0) return;
        fireCooldown = fireRate;

        const spread = Math.min(shooterCount, 10);
        const totalWidth = (spread - 1) * 20;
        const startX = aimX - totalWidth / 2;

        for (let i = 0; i < spread; i++) {
            const bx = spread === 1 ? aimX : startX + i * 20;
            // Slight angle spread
            const angle = -Math.PI / 2 + (spread > 1 ? (i / (spread - 1) - 0.5) * 0.3 : 0);
            bullets.push({
                x: bx,
                y: playerBaseY() - 20,
                vx: Math.cos(angle) * 10,
                vy: Math.sin(angle) * 10,
                power: bulletPower,
            });
        }
    }

    // ─── Particles ──────────────────────────────────────────────────
    function spawnExplosion(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 4;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 30 + Math.random() * 20,
                maxLife: 50,
                radius: 2 + Math.random() * 3,
                color: color || COLORS.particle[Math.floor(Math.random() * COLORS.particle.length)],
            });
        }
    }

    function spawnFloatingText(x, y, text, color) {
        floatingTexts.push({
            x: x, y: y, text: text, color: color || '#fff',
            life: 60, maxLife: 60,
        });
    }

    // ─── Update ─────────────────────────────────────────────────────
    function update() {
        if (state !== 'playing') return;

        fireCooldown = Math.max(0, fireCooldown - 1);
        fireBullets();

        // Scroll everything down
        for (const e of enemies) e.y += scrollSpeed;
        for (const g of gates) g.y += scrollSpeed;

        // Check if we need a new wave
        const lowestEnemy = enemies.reduce((max, e) => Math.max(max, e.y), -Infinity);
        const lowestGate = gates.reduce((max, g) => Math.max(max, g.y), -Infinity);
        const lowest = Math.max(lowestEnemy, lowestGate);
        if (enemies.length === 0 || lowest > canvas.height * 0.3) {
            if (enemies.length === 0) spawnWave();
        }

        // Update bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            if (b.y < -20 || b.x < -20 || b.x > canvas.width + 20) {
                bullets.splice(i, 1);
                continue;
            }

            // Hit enemies
            let hit = false;
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j];
                if (rectContains(e, b.x, b.y)) {
                    e.hp -= b.power;
                    hit = true;
                    spawnExplosion(b.x, b.y, 3, '#ff8844');

                    if (e.hp <= 0) {
                        score += e.maxHp;
                        scoreVal.textContent = score;
                        spawnExplosion(e.x, e.y, 15);
                        spawnFloatingText(e.x, e.y - 30, '+' + e.maxHp, '#0f0');
                        enemies.splice(j, 1);
                    }
                    break;
                }
            }
            if (hit) {
                bullets.splice(i, 1);
                continue;
            }

            // Hit gates (collect)
            for (let j = gates.length - 1; j >= 0; j--) {
                const g = gates[j];
                if (!g.collected && rectContains(g, b.x, b.y)) {
                    collectGate(g);
                    gates.splice(j, 1);
                    bullets.splice(i, 1);
                    hit = true;
                    break;
                }
            }
        }

        // Enemies reaching the player
        for (const e of enemies) {
            if (e.y + e.h / 2 >= playerBaseY()) {
                gameOver();
                return;
            }
        }

        // Gates scrolling past — just remove
        gates = gates.filter(g => g.y < canvas.height + 100);

        // Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.96;
            p.vy *= 0.96;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Floating texts
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            const ft = floatingTexts[i];
            ft.y -= 1;
            ft.life--;
            if (ft.life <= 0) floatingTexts.splice(i, 1);
        }
    }

    function collectGate(gate) {
        spawnExplosion(gate.x, gate.y, 20, gateColor(gate.type));
        if (gate.type === 'multiply') {
            shooterCount = Math.min(shooterCount * gate.value, 30);
            spawnFloatingText(gate.x, gate.y - 30, 'x' + gate.value + ' SHOOTERS!', gateColor(gate.type));
        } else if (gate.type === 'power') {
            bulletPower += gate.value;
            spawnFloatingText(gate.x, gate.y - 30, '+' + gate.value + ' POWER!', gateColor(gate.type));
        } else if (gate.type === 'speed') {
            fireRate = Math.max(2, fireRate - 1);
            spawnFloatingText(gate.x, gate.y - 30, 'FIRE RATE UP!', gateColor(gate.type));
        }
        shootersVal.textContent = shooterCount;
        powerVal.textContent = bulletPower;
    }

    function gateColor(type) {
        if (type === 'multiply') return COLORS.gate_multiply;
        if (type === 'power') return COLORS.gate_power;
        return COLORS.gate_speed;
    }

    // ─── Draw ───────────────────────────────────────────────────────
    function draw() {
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Grid lines (subtle)
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        for (let i = 1; i < LANE_COUNT; i++) {
            const x = i * laneWidth();
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        if (state === 'menu') return;

        // Particles (behind everything)
        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius * alpha, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Enemies
        for (const e of enemies) {
            drawEnemy(e);
        }

        // Gates
        for (const g of gates) {
            drawGate(g);
        }

        // Bullets
        ctx.fillStyle = COLORS.bullet;
        ctx.shadowColor = COLORS.bullet;
        ctx.shadowBlur = 8;
        for (const b of bullets) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Player / shooters
        drawPlayer();

        // Floating texts
        for (const ft of floatingTexts) {
            const alpha = ft.life / ft.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = ft.color;
            ctx.font = 'bold 18px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(ft.text, ft.x, ft.y);
        }
        ctx.globalAlpha = 1;

        // Danger line
        ctx.strokeStyle = 'rgba(255, 50, 50, 0.15)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(0, playerBaseY());
        ctx.lineTo(canvas.width, playerBaseY());
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function drawEnemy(e) {
        const ratio = e.hp / e.maxHp;
        const color = hpColor(e.hp, e.maxHp);

        // Background
        ctx.fillStyle = 'rgba(255,50,80,0.15)';
        roundRect(ctx, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h, 8);
        ctx.fill();

        // HP bar background
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        roundRect(ctx, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h, 8);
        ctx.fill();

        // HP bar fill
        ctx.fillStyle = color;
        const fillW = e.w * ratio;
        roundRect(ctx, e.x - e.w / 2, e.y - e.h / 2, fillW, e.h, 8);
        ctx.fill();

        // Border
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        roundRect(ctx, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h, 8);
        ctx.stroke();

        // HP text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.hp, e.x, e.y);
    }

    function drawGate(g) {
        const color = gateColor(g.type);
        let label = '';
        if (g.type === 'multiply') label = 'x' + g.value;
        else if (g.type === 'power') label = '+' + g.value;
        else label = 'SPD';

        // Glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;

        ctx.fillStyle = color + '33';
        roundRect(ctx, g.x - g.w / 2, g.y - g.h / 2, g.w, g.h, 12);
        ctx.fill();

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        roundRect(ctx, g.x - g.w / 2, g.y - g.h / 2, g.w, g.h, 12);
        ctx.stroke();

        ctx.shadowBlur = 0;

        ctx.fillStyle = color;
        ctx.font = 'bold 20px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, g.x, g.y);

        // Sub-label
        ctx.font = '11px system-ui';
        ctx.fillStyle = color + 'aa';
        const sub = g.type === 'multiply' ? 'SHOOTERS' : g.type === 'power' ? 'POWER' : 'FIRE RATE';
        ctx.fillText(sub, g.x, g.y + 18);
    }

    function drawPlayer() {
        const baseY = playerBaseY();
        const cx = aimX || canvas.width / 2;
        const spread = Math.min(shooterCount, 10);
        const totalWidth = (spread - 1) * 20;
        const startX = cx - totalWidth / 2;

        for (let i = 0; i < spread; i++) {
            const sx = spread === 1 ? cx : startX + i * 20;

            // Shooter triangle
            ctx.fillStyle = '#00c8ff';
            ctx.shadowColor = '#00c8ff';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(sx, baseY - 18);
            ctx.lineTo(sx - 8, baseY);
            ctx.lineTo(sx + 8, baseY);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Shooter count badge if > 10
        if (shooterCount > 10) {
            ctx.fillStyle = '#00c8ff';
            ctx.font = 'bold 14px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(shooterCount + ' shooters', cx, baseY + 20);
        }

        // Aim line
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.moveTo(cx, baseY - 20);
        ctx.lineTo(cx, 0);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // ─── Helpers ────────────────────────────────────────────────────
    function rectContains(entity, px, py) {
        return (
            px >= entity.x - entity.w / 2 &&
            px <= entity.x + entity.w / 2 &&
            py >= entity.y - entity.h / 2 &&
            py <= entity.y + entity.h / 2
        );
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ─── Input ──────────────────────────────────────────────────────
    function handlePointer(e) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX)) - rect.left;
        if (x != null) aimX = x;
    }

    canvas.addEventListener('mousemove', handlePointer);
    canvas.addEventListener('touchmove', function (e) {
        e.preventDefault();
        handlePointer(e);
    }, { passive: false });
    canvas.addEventListener('touchstart', function (e) {
        e.preventDefault();
        handlePointer(e);
    }, { passive: false });

    // Keyboard: left/right arrows or A/D
    const keys = {};
    window.addEventListener('keydown', e => { keys[e.key] = true; });
    window.addEventListener('keyup', e => { keys[e.key] = false; });

    function handleKeyboardAim() {
        const speed = 6;
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
            aimX = Math.max(0, aimX - speed);
        }
        if (keys['ArrowRight'] || keys['d'] || keys['D']) {
            aimX = Math.min(canvas.width, aimX + speed);
        }
    }

    // ─── Game Lifecycle ─────────────────────────────────────────────
    function startGame() {
        state = 'playing';
        score = 0;
        wave = 0;
        shooterCount = 1;
        bulletPower = 1;
        fireRate = 8;
        fireCooldown = 0;
        scrollSpeed = SCROLL_BASE_SPEED;
        bullets = [];
        enemies = [];
        gates = [];
        particles = [];
        floatingTexts = [];
        aimX = canvas.width / 2;

        scoreVal.textContent = '0';
        waveVal.textContent = '0';
        shootersVal.textContent = '1';
        powerVal.textContent = '1';

        startScreen.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        hud.style.display = 'flex';

        spawnWave();
    }

    function gameOver() {
        state = 'gameover';
        hud.style.display = 'none';
        finalScore.textContent = 'Score: ' + score;
        finalWave.textContent = 'Wave: ' + wave;
        gameOverScreen.classList.remove('hidden');
    }

    // ─── Main Loop ──────────────────────────────────────────────────
    function loop() {
        handleKeyboardAim();
        update();
        draw();
        requestAnimationFrame(loop);
    }

    // ─── Event Bindings ─────────────────────────────────────────────
    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-restart').addEventListener('click', startGame);

    // Init
    aimX = canvas.width / 2;
    loop();
})();
