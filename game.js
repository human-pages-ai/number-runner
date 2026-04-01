// Number Runner — LastTokens
// A gates-runner game. Choose gates, grow your number, smash walls.
// Built with leftover AI tokens for the public good.

(function () {
    'use strict';

    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');

    // ─── Responsive canvas ──────────────────────────────────────────
    let W, H, TRACK_W, TRACK_L, TRACK_R, LANE_W;
    function resize() {
        canvas.width = W = window.innerWidth;
        canvas.height = H = window.innerHeight;
        TRACK_W = Math.min(W * 0.85, 400);
        TRACK_L = (W - TRACK_W) / 2;
        TRACK_R = TRACK_L + TRACK_W;
        LANE_W = TRACK_W / 2;
    }
    window.addEventListener('resize', resize);
    resize();

    // ─── DOM ────────────────────────────────────────────────────────
    const startScreen = document.getElementById('start-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const gameOverTitle = document.getElementById('gameover-title');
    const finalLevel = document.getElementById('final-level');
    const finalScore = document.getElementById('final-score');
    const progressBar = document.getElementById('progress-bar');
    const progressFill = document.getElementById('progress-fill');
    const levelLabel = document.getElementById('level-label');

    // ─── State ──────────────────────────────────────────────────────
    let gameState = 'menu'; // menu | playing | smashing | levelcomplete | gameover
    let level = 1;
    let playerNum = 1;
    let playerX = 0;    // -1 to 1 (left to right within track)
    let targetX = 0;    // where input is dragging toward
    let scrollY = 0;    // how far we've scrolled through the level
    let levelLength = 0;
    let score = 0;
    let lastTime = 0;

    // Entities for current level
    let obstacles = [];  // walls to smash through
    let gatePairs = [];  // pairs of gates (left + right)
    let particles = [];
    let floatingTexts = [];
    let stickmen = [];   // visual army

    // Screen shake
    let shakeX = 0, shakeY = 0, shakeMag = 0;

    // Boss smash state
    let boss = null;
    let smashTimer = 0;

    // ─── Colors (bright pastel) ─────────────────────────────────────
    const C = {
        track: '#d4eaf7',
        trackEdge: '#b8d8e8',
        grass: '#a8e6a3',
        grassDark: '#8fd48a',
        sky: '#e8f4f8',
        player: '#ff6b9d',
        playerStroke: '#e85580',
        wallBg: '#ff7675',
        wallText: '#fff',
        gateGood: '#00b894',
        gateGreat: '#6c5ce7',
        gateBad: '#e17055',
        gateText: '#fff',
        bossWall: '#d63031',
    };

    // ─── Level Generation ───────────────────────────────────────────
    function generateLevel(lvl) {
        obstacles = [];
        gatePairs = [];
        boss = null;

        const segmentCount = 5 + Math.floor(lvl * 1.5);
        const spacing = 300; // y-distance between segments
        let y = -400; // start above screen

        for (let i = 0; i < segmentCount; i++) {
            // Alternate: gate pair, then wall
            if (i % 2 === 0) {
                // Gate pair — player chooses left or right
                const pair = generateGatePair(lvl, i);
                pair.y = y;
                gatePairs.push(pair);
            } else {
                // Enemy wall
                const hp = Math.floor((5 + lvl * 4) * (0.6 + Math.random() * 0.8));
                obstacles.push({
                    y: y,
                    hp: hp,
                    maxHp: hp,
                    smashed: false,
                    w: TRACK_W * 0.85,
                    h: 60,
                });
            }
            y -= spacing;
        }

        // Boss wall at the end
        const bossHp = Math.floor(20 + lvl * 15 + lvl * lvl * 2);
        boss = {
            y: y - 200,
            hp: bossHp,
            maxHp: bossHp,
            w: TRACK_W * 0.95,
            h: 100,
            isBoss: true,
            smashed: false,
        };

        levelLength = Math.abs(boss.y) + 600;
        scrollY = 0;
        playerNum = 1 + Math.floor(lvl / 3);
    }

    function generateGatePair(lvl, segIdx) {
        // Generate two gates — one should be clearly better
        const ops = [];

        // Good gate
        if (Math.random() < 0.5) {
            const mult = Math.random() < 0.3 + lvl * 0.02 ? 3 : 2;
            ops.push({ op: 'x', val: mult, label: 'x' + mult });
        } else {
            const add = 5 + Math.floor(Math.random() * (5 + lvl * 2));
            ops.push({ op: '+', val: add, label: '+' + add });
        }

        // Second gate — sometimes good, sometimes bad, sometimes worse-good
        const r = Math.random();
        if (r < 0.3) {
            // Bad gate (subtract or divide)
            if (Math.random() < 0.5) {
                const sub = 2 + Math.floor(Math.random() * (3 + lvl));
                ops.push({ op: '-', val: sub, label: '-' + sub });
            } else {
                ops.push({ op: '/', val: 2, label: '÷2' });
            }
        } else if (r < 0.6) {
            // Smaller good gate
            const add = 1 + Math.floor(Math.random() * 5);
            ops.push({ op: '+', val: add, label: '+' + add });
        } else {
            // Different good gate
            const mult = 2;
            ops.push({ op: 'x', val: mult, label: 'x' + mult });
        }

        // Randomize which side is which
        if (Math.random() < 0.5) ops.reverse();

        return {
            y: 0,
            left: ops[0],
            right: ops[1],
            collected: false,
        };
    }

    function applyGate(gate) {
        const old = playerNum;
        switch (gate.op) {
            case '+': playerNum += gate.val; break;
            case '-': playerNum = Math.max(1, playerNum - gate.val); break;
            case 'x': playerNum *= gate.val; break;
            case '/': playerNum = Math.max(1, Math.ceil(playerNum / gate.val)); break;
        }
        playerNum = Math.min(playerNum, 9999);
        const diff = playerNum - old;
        return diff;
    }

    // ─── Stickmen (visual army) ─────────────────────────────────────
    function updateStickmen() {
        const target = Math.min(playerNum, 50); // cap visual stickmen
        // Add or remove to match
        while (stickmen.length < target) {
            stickmen.push({
                ox: (Math.random() - 0.5) * 60,
                oy: (Math.random() - 0.5) * 40,
                phase: Math.random() * Math.PI * 2,
            });
        }
        while (stickmen.length > target) {
            stickmen.pop();
        }
    }

    // ─── Particles & Effects ────────────────────────────────────────
    function spawnBurst(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const spd = 2 + Math.random() * 5;
            particles.push({
                x, y,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd - 2,
                life: 40 + Math.random() * 30,
                maxLife: 70,
                r: 3 + Math.random() * 4,
                color: color,
            });
        }
    }

    function spawnConfetti(x, y, count) {
        const colors = ['#ff6b9d', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#00d2d3', '#ff6348'];
        for (let i = 0; i < count; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
            const spd = 3 + Math.random() * 6;
            particles.push({
                x, y,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd,
                life: 60 + Math.random() * 40,
                maxLife: 100,
                r: 3 + Math.random() * 3,
                color: colors[Math.floor(Math.random() * colors.length)],
                confetti: true,
            });
        }
    }

    function spawnFloating(x, y, text, color, size) {
        floatingTexts.push({
            x, y, text,
            color: color || '#333',
            size: size || 28,
            life: 60,
            maxLife: 60,
        });
    }

    function shake(mag) {
        shakeMag = Math.max(shakeMag, mag);
    }

    // ─── Game Logic ─────────────────────────────────────────────────
    function screenYOf(worldY) {
        return H * 0.7 + (worldY + scrollY);
    }

    function playerWorldY() {
        return 0; // player is always at y=0 in world space
    }

    function playerScreenX() {
        return TRACK_L + TRACK_W / 2 + playerX * (TRACK_W * 0.25);
    }

    function playerScreenY() {
        return H * 0.7;
    }

    function update(dt) {
        if (gameState === 'menu' || gameState === 'gameover') return;

        // Smooth player horizontal movement
        playerX += (targetX - playerX) * Math.min(1, dt * 12);

        if (gameState === 'playing') {
            // Scroll forward
            const speed = 180 + level * 10;
            scrollY += speed * dt;

            // Update progress
            const prog = Math.min(scrollY / levelLength, 1);
            progressFill.style.width = (prog * 100) + '%';

            // Check gate collisions
            const psy = playerScreenY();
            const psx = playerScreenX();

            for (const gp of gatePairs) {
                if (gp.collected) continue;
                const gy = screenYOf(gp.y);
                if (Math.abs(gy - psy) < 40) {
                    gp.collected = true;
                    // Which side is the player on?
                    const side = playerX < 0 ? 'left' : 'right';
                    const gate = gp[side];
                    const diff = applyGate(gate);
                    const gx = side === 'left'
                        ? TRACK_L + LANE_W * 0.5
                        : TRACK_L + LANE_W * 1.5;

                    if (diff > 0) {
                        spawnBurst(gx, gy, 20, '#00b894');
                        spawnFloating(gx, gy - 40, '+' + diff, '#00b894', 32);
                        shake(4);
                    } else if (diff < 0) {
                        spawnBurst(gx, gy, 10, '#e17055');
                        spawnFloating(gx, gy - 40, '' + diff, '#e17055', 28);
                        shake(6);
                    } else {
                        spawnFloating(gx, gy - 40, '0', '#999', 22);
                    }
                    updateStickmen();
                }
            }

            // Check wall collisions
            for (const wall of obstacles) {
                if (wall.smashed) continue;
                const wy = screenYOf(wall.y);
                if (Math.abs(wy - psy) < 45) {
                    // Smash!
                    const damage = wall.hp;
                    playerNum -= damage;
                    wall.smashed = true;
                    score += wall.maxHp * 10;

                    spawnBurst(W / 2, wy, 25, '#ff7675');
                    shake(8);

                    if (playerNum <= 0) {
                        playerNum = 0;
                        doGameOver();
                        return;
                    }

                    spawnFloating(W / 2, wy - 30, '-' + damage, '#ff4444', 28);
                    updateStickmen();
                }
            }

            // Check boss collision
            if (boss && !boss.smashed) {
                const by = screenYOf(boss.y);
                if (Math.abs(by - psy) < 60) {
                    // Enter smash mode
                    gameState = 'smashing';
                    smashTimer = 0;
                }
            }
        }

        if (gameState === 'smashing' && boss) {
            smashTimer += dt;
            // Drain boss HP over ~2 seconds, player number counts down
            const drainRate = boss.maxHp / 2.0; // drain over 2 seconds
            const drain = drainRate * dt;
            const actualDrain = Math.min(drain, boss.hp, playerNum);

            boss.hp -= actualDrain;
            playerNum -= actualDrain;
            playerNum = Math.max(0, playerNum);
            boss.hp = Math.max(0, boss.hp);

            // Visual feedback during smash
            if (Math.random() < 0.5) {
                const bx = TRACK_L + Math.random() * TRACK_W;
                const by = screenYOf(boss.y);
                spawnBurst(bx, by, 3, '#ff6348');
            }
            shake(3);

            if (boss.hp <= 0) {
                // Boss destroyed! Level complete!
                boss.smashed = true;
                score += boss.maxHp * 20;
                spawnConfetti(W / 2, H * 0.4, 80);
                shake(15);
                gameState = 'levelcomplete';
                setTimeout(() => {
                    level++;
                    startLevel();
                }, 2000);
            } else if (playerNum <= 0) {
                boss.smashed = false;
                doGameOver();
                return;
            }

            playerNum = Math.round(playerNum);
            updateStickmen();
        }

        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt * 60;
            p.y += p.vy * dt * 60;
            p.vy += (p.confetti ? 0.15 : 0.05) * dt * 60;
            p.vx *= 0.98;
            p.life -= dt * 60;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Update floating texts
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            const ft = floatingTexts[i];
            ft.y -= 1.5 * dt * 60;
            ft.life -= dt * 60;
            if (ft.life <= 0) floatingTexts.splice(i, 1);
        }

        // Shake decay
        shakeMag *= 0.85;
        if (shakeMag < 0.5) shakeMag = 0;
        shakeX = (Math.random() - 0.5) * shakeMag * 2;
        shakeY = (Math.random() - 0.5) * shakeMag * 2;
    }

    // ─── Drawing ────────────────────────────────────────────────────
    function draw() {
        ctx.save();
        ctx.translate(shakeX, shakeY);

        // Sky
        ctx.fillStyle = C.sky;
        ctx.fillRect(0, 0, W, H);

        // Grass on sides
        ctx.fillStyle = C.grass;
        ctx.fillRect(0, 0, TRACK_L, H);
        ctx.fillRect(TRACK_R, 0, W - TRACK_R, H);

        // Grass stripes
        ctx.fillStyle = C.grassDark;
        for (let y = ((scrollY * 0.5) % 60) - 60; y < H; y += 60) {
            ctx.fillRect(0, y, TRACK_L, 30);
            ctx.fillRect(TRACK_R, y, W - TRACK_R, 30);
        }

        // Track
        ctx.fillStyle = C.track;
        ctx.fillRect(TRACK_L, 0, TRACK_W, H);

        // Track center line (dashed)
        ctx.strokeStyle = C.trackEdge;
        ctx.lineWidth = 2;
        ctx.setLineDash([20, 20]);
        const dashOffset = (scrollY * 1) % 40;
        ctx.lineDashOffset = -dashOffset;
        ctx.beginPath();
        ctx.moveTo(TRACK_L + TRACK_W / 2, 0);
        ctx.lineTo(TRACK_L + TRACK_W / 2, H);
        ctx.stroke();
        ctx.setLineDash([]);

        // Track edge lines
        ctx.strokeStyle = C.trackEdge;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(TRACK_L, 0); ctx.lineTo(TRACK_L, H);
        ctx.moveTo(TRACK_R, 0); ctx.lineTo(TRACK_R, H);
        ctx.stroke();

        if (gameState === 'menu') {
            ctx.restore();
            return;
        }

        // Draw gate pairs
        for (const gp of gatePairs) {
            if (gp.collected) continue;
            const gy = screenYOf(gp.y);
            if (gy < -100 || gy > H + 100) continue;
            drawGatePair(gp, gy);
        }

        // Draw walls
        for (const wall of obstacles) {
            if (wall.smashed) continue;
            const wy = screenYOf(wall.y);
            if (wy < -100 || wy > H + 100) continue;
            drawWall(wall, wy);
        }

        // Draw boss
        if (boss && !boss.smashed) {
            const by = screenYOf(boss.y);
            if (by > -200 && by < H + 200) {
                drawBoss(boss, by);
            }
        }

        // Particles
        for (const p of particles) {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            if (p.confetti) {
                ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r * 0.6);
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;

        // Player
        drawPlayer();

        // Floating texts
        for (const ft of floatingTexts) {
            const alpha = ft.life / ft.maxLife;
            ctx.globalAlpha = alpha;
            ctx.font = 'bold ' + ft.size + 'px system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(ft.text, ft.x + 2, ft.y + 2);
            ctx.fillStyle = ft.color;
            ctx.fillText(ft.text, ft.x, ft.y);
        }
        ctx.globalAlpha = 1;

        // Level complete text
        if (gameState === 'levelcomplete') {
            ctx.font = 'bold 48px system-ui';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.fillText('LEVEL ' + (level) + ' COMPLETE!', W / 2 + 3, H * 0.35 + 3);
            ctx.fillStyle = '#4ecdc4';
            ctx.fillText('LEVEL ' + (level) + ' COMPLETE!', W / 2, H * 0.35);
        }

        ctx.restore();
    }

    function drawGatePair(gp, gy) {
        const gateH = 65;
        const gap = 6;

        // Left gate
        drawSingleGate(
            TRACK_L + gap, gy - gateH / 2,
            LANE_W - gap * 1.5, gateH,
            gp.left
        );
        // Right gate
        drawSingleGate(
            TRACK_L + LANE_W + gap * 0.5, gy - gateH / 2,
            LANE_W - gap * 1.5, gateH,
            gp.right
        );
    }

    function drawSingleGate(x, y, w, h, gate) {
        const isGood = gate.op === '+' || gate.op === 'x';
        const isGreat = gate.op === 'x' && gate.val >= 3;
        const color = isGreat ? C.gateGreat : isGood ? C.gateGood : C.gateBad;

        // Gate body
        ctx.fillStyle = color;
        roundRect(x, y, w, h, 12);
        ctx.fill();

        // Lighter inner
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        roundRect(x + 4, y + 4, w - 8, h / 2 - 4, 8);
        ctx.fill();

        // Label
        ctx.fillStyle = C.gateText;
        ctx.font = 'bold 28px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(gate.label, x + w / 2, y + h / 2);
    }

    function drawWall(wall, wy) {
        const x = TRACK_L + (TRACK_W - wall.w) / 2;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        roundRect(x + 4, wy - wall.h / 2 + 4, wall.w, wall.h, 10);
        ctx.fill();

        // Wall body
        const ratio = wall.hp / wall.maxHp;
        ctx.fillStyle = C.wallBg;
        roundRect(x, wy - wall.h / 2, wall.w, wall.h, 10);
        ctx.fill();

        // Crack effect when damaged
        if (ratio < 1) {
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            const crackW = wall.w * (1 - ratio);
            roundRect(x + wall.w - crackW, wy - wall.h / 2, crackW, wall.h, 10);
            ctx.fill();
        }

        // Number
        ctx.fillStyle = C.wallText;
        ctx.font = 'bold 30px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(wall.hp, TRACK_L + TRACK_W / 2, wy);
    }

    function drawBoss(b, by) {
        const x = TRACK_L + (TRACK_W - b.w) / 2;

        // Pulsing glow
        const pulse = Math.sin(Date.now() * 0.005) * 0.2 + 0.8;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        roundRect(x + 5, by - b.h / 2 + 5, b.w, b.h, 14);
        ctx.fill();

        // Body
        ctx.fillStyle = C.bossWall;
        ctx.globalAlpha = pulse;
        roundRect(x, by - b.h / 2, b.w, b.h, 14);
        ctx.fill();
        ctx.globalAlpha = 1;

        // HP bar inside
        const ratio = b.hp / b.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        roundRect(x + 10, by + b.h / 2 - 18, b.w - 20, 10, 5);
        ctx.fill();
        ctx.fillStyle = '#feca57';
        roundRect(x + 10, by + b.h / 2 - 18, (b.w - 20) * ratio, 10, 5);
        ctx.fill();

        // BOSS label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('BOSS', TRACK_L + TRACK_W / 2, by - 18);

        // Number
        ctx.font = 'bold 36px system-ui';
        ctx.fillText(Math.ceil(b.hp), TRACK_L + TRACK_W / 2, by + 10);
    }

    function drawPlayer() {
        const px = playerScreenX();
        const py = playerScreenY();
        const t = Date.now() * 0.003;

        // Draw stickmen army
        const count = stickmen.length;
        for (let i = 0; i < count; i++) {
            const s = stickmen[i];
            const sx = px + s.ox * (1 + count * 0.01);
            const sy = py + s.oy * (1 + count * 0.005);
            const bob = Math.sin(t + s.phase) * 2;

            // Body (simple circle + line)
            ctx.fillStyle = C.player;
            ctx.beginPath();
            ctx.arc(sx, sy - 10 + bob, 5, 0, Math.PI * 2);
            ctx.fill();

            // Body line
            ctx.strokeStyle = C.player;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(sx, sy - 5 + bob);
            ctx.lineTo(sx, sy + 5 + bob);
            ctx.stroke();

            // Legs
            ctx.beginPath();
            ctx.moveTo(sx, sy + 5 + bob);
            ctx.lineTo(sx - 4, sy + 12 + bob);
            ctx.moveTo(sx, sy + 5 + bob);
            ctx.lineTo(sx + 4, sy + 12 + bob);
            ctx.stroke();
        }

        // Big number above army
        const numSize = Math.min(48, 28 + count * 0.4);
        ctx.font = 'bold ' + numSize + 'px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillText(Math.round(playerNum), px + 2, py - 35 + 2);

        // Number
        ctx.fillStyle = C.player;
        ctx.fillText(Math.round(playerNum), px, py - 35);
    }

    function roundRect(x, y, w, h, r) {
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

    // ─── Input ──────────────────────────────────────────────────────
    let dragging = false;
    let dragStartX = 0;
    let dragPlayerStartX = 0;

    function onPointerDown(cx) {
        dragging = true;
        dragStartX = cx;
        dragPlayerStartX = playerX;
    }

    function onPointerMove(cx) {
        if (!dragging) return;
        const dx = cx - dragStartX;
        // Map pixel drag to -1..1 range
        const sensitivity = 2.5 / TRACK_W;
        targetX = Math.max(-1, Math.min(1, dragPlayerStartX + dx * sensitivity));
    }

    function onPointerUp() {
        dragging = false;
    }

    canvas.addEventListener('mousedown', e => onPointerDown(e.clientX));
    canvas.addEventListener('mousemove', e => onPointerMove(e.clientX));
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('mouseleave', onPointerUp);

    canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        onPointerDown(e.touches[0].clientX);
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        onPointerMove(e.touches[0].clientX);
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
        e.preventDefault();
        onPointerUp();
    }, { passive: false });

    // Keyboard
    const keys = {};
    window.addEventListener('keydown', e => { keys[e.key] = true; });
    window.addEventListener('keyup', e => { keys[e.key] = false; });

    function handleKeyboard(dt) {
        const speed = 4 * dt;
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
            targetX = Math.max(-1, targetX - speed);
        }
        if (keys['ArrowRight'] || keys['d'] || keys['D']) {
            targetX = Math.min(1, targetX + speed);
        }
    }

    // ─── Game Lifecycle ─────────────────────────────────────────────
    function startLevel() {
        gameState = 'playing';
        targetX = 0;
        playerX = 0;
        particles = [];
        floatingTexts = [];
        stickmen = [];

        generateLevel(level);
        updateStickmen();

        progressBar.style.display = 'block';
        levelLabel.textContent = 'LEVEL ' + level;
        progressFill.style.width = '0%';

        startScreen.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
    }

    function startGame() {
        level = 1;
        score = 0;
        startLevel();
    }

    function doGameOver() {
        gameState = 'gameover';
        progressBar.style.display = 'none';

        if (boss && boss.hp <= 0) {
            gameOverTitle.textContent = 'YOU WIN!';
            gameOverTitle.className = 'win';
        } else {
            gameOverTitle.textContent = 'GAME OVER';
            gameOverTitle.className = '';
        }

        finalLevel.textContent = 'Level ' + level;
        finalScore.textContent = 'Score: ' + score;
        gameOverScreen.classList.remove('hidden');
    }

    // ─── Main Loop ──────────────────────────────────────────────────
    function loop(timestamp) {
        if (!lastTime) lastTime = timestamp;
        const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap at 50ms
        lastTime = timestamp;

        handleKeyboard(dt);
        update(dt);
        draw();
        requestAnimationFrame(loop);
    }

    // ─── Init ───────────────────────────────────────────────────────
    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-restart').addEventListener('click', startGame);

    requestAnimationFrame(loop);
})();
