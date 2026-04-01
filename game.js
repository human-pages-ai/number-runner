// Number Runner — LastTokens
// Gates-runner + shooter. Choose gates, grow your army, shoot down enemy walls.
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
        TRACK_W = Math.min(W * 0.85, 420);
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
    let gameState = 'menu';
    let level = 1;
    let playerNum = 1;
    let playerX = 0;
    let targetX = 0;
    let scrollY = 0;
    let levelLength = 0;
    let score = 0;
    let lastTime = 0;
    let fireCooldown = 0;

    let obstacles = [];
    let gatePairs = [];
    let bullets = [];
    let particles = [];
    let floatingTexts = [];
    let stickmen = [];
    let muzzleFlashes = [];
    let enemyGroups = []; // groups of enemy stickmen in front of walls

    let shakeX = 0, shakeY = 0, shakeMag = 0;
    let boss = null;
    let smashTimer = 0;

    // Stickman colors palette
    const ARMY_COLORS = ['#ff6b9d', '#ff8a80', '#ff5252', '#e84393', '#fd79a8'];
    const ENEMY_COLORS = ['#636e72', '#2d3436', '#6c5ce7', '#a29bfe', '#74b9ff'];
    const ENEMY_SKIN = ['#dfe6e9', '#b2bec3', '#a4b0be'];

    // ─── Colors ─────────────────────────────────────────────────────
    const C = {
        track: '#e8e8e8',
        trackLine: '#d0d0d0',
        grass1: '#7ed56f',
        grass2: '#55c57a',
        grassStripe: '#6cc965',
        sky: '#87ceeb',
        skyBottom: '#c8e6f0',
        player: '#ff6b9d',
        wallBg: '#e74c3c',
        wallDark: '#c0392b',
        wallText: '#fff',
        gateGood: '#00b894',
        gateGreat: '#6c5ce7',
        gateBad: '#e17055',
        gateText: '#fff',
        bossWall: '#8e1b1b',
        bossFace: '#c0392b',
        bullet: '#feca57',
        bulletGlow: '#f9ca24',
        muzzle: '#fff3b0',
    };

    // ─── Level Generation ───────────────────────────────────────────
    function generateLevel(lvl) {
        obstacles = [];
        gatePairs = [];
        enemyGroups = [];
        bullets = [];
        boss = null;

        const segmentCount = 5 + Math.floor(lvl * 1.5);
        const spacing = 350;
        let y = -500;

        for (let i = 0; i < segmentCount; i++) {
            if (i % 2 === 0) {
                const pair = generateGatePair(lvl);
                pair.y = y;
                gatePairs.push(pair);
            } else {
                const hp = Math.floor((8 + lvl * 5) * (0.6 + Math.random() * 0.8));
                const wall = {
                    y: y,
                    hp: hp,
                    maxHp: hp,
                    smashed: false,
                    w: TRACK_W * 0.85,
                    h: 60,
                    hitFlash: 0,
                };
                obstacles.push(wall);

                // Enemy group in front of wall
                const enemyCount = Math.min(Math.ceil(hp / 5), 12);
                const group = [];
                for (let e = 0; e < enemyCount; e++) {
                    group.push({
                        ox: (Math.random() - 0.5) * TRACK_W * 0.6,
                        oy: -40 - Math.random() * 50,
                        phase: Math.random() * Math.PI * 2,
                        color: ENEMY_COLORS[Math.floor(Math.random() * ENEMY_COLORS.length)],
                        skin: ENEMY_SKIN[Math.floor(Math.random() * ENEMY_SKIN.length)],
                        alive: true,
                        hp: 2 + Math.floor(lvl / 2),
                    });
                }
                enemyGroups.push({ wallIndex: obstacles.length - 1, y: y, enemies: group });
            }
            y -= spacing;
        }

        // Boss
        const bossHp = Math.floor(30 + lvl * 20 + lvl * lvl * 2);
        boss = {
            y: y - 300,
            hp: bossHp,
            maxHp: bossHp,
            w: TRACK_W * 0.95,
            h: 120,
            smashed: false,
            hitFlash: 0,
        };

        levelLength = Math.abs(boss.y) + 600;
        scrollY = 0;
        playerNum = 2 + Math.floor(lvl / 2);
    }

    function generateGatePair(lvl) {
        const ops = [];
        if (Math.random() < 0.5) {
            const mult = Math.random() < 0.25 + lvl * 0.02 ? 3 : 2;
            ops.push({ op: 'x', val: mult, label: 'x' + mult });
        } else {
            const add = 3 + Math.floor(Math.random() * (4 + lvl * 2));
            ops.push({ op: '+', val: add, label: '+' + add });
        }

        const r = Math.random();
        if (r < 0.3) {
            if (Math.random() < 0.5) {
                const sub = 1 + Math.floor(Math.random() * (2 + lvl));
                ops.push({ op: '-', val: sub, label: '-' + sub });
            } else {
                ops.push({ op: '/', val: 2, label: '÷2' });
            }
        } else if (r < 0.6) {
            const add = 1 + Math.floor(Math.random() * 4);
            ops.push({ op: '+', val: add, label: '+' + add });
        } else {
            ops.push({ op: 'x', val: 2, label: 'x2' });
        }

        if (Math.random() < 0.5) ops.reverse();
        return { y: 0, left: ops[0], right: ops[1], collected: false };
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
        return playerNum - old;
    }

    // ─── Stickmen ───────────────────────────────────────────────────
    function updateStickmen() {
        const target = Math.min(Math.round(playerNum), 60);
        while (stickmen.length < target) {
            stickmen.push({
                ox: (Math.random() - 0.5) * Math.min(70, 30 + target),
                oy: (Math.random() - 0.5) * Math.min(50, 20 + target * 0.5),
                phase: Math.random() * Math.PI * 2,
                color: ARMY_COLORS[Math.floor(Math.random() * ARMY_COLORS.length)],
                gunAngle: -0.3 + Math.random() * 0.6,
            });
        }
        while (stickmen.length > target) stickmen.pop();
    }

    // ─── Shooting ───────────────────────────────────────────────────
    function findShootTarget() {
        // Find nearest enemy group or wall ahead (on screen, not smashed)
        let bestDist = Infinity;
        let bestTarget = null;

        for (const wall of obstacles) {
            if (wall.smashed) continue;
            const wy = screenYOf(wall.y);
            if (wy < 0 || wy > playerScreenY() - 30) {
                const dist = playerScreenY() - wy;
                if (dist > 0 && dist < bestDist) {
                    bestDist = dist;
                    bestTarget = { type: 'wall', wall, wy };
                }
            }
        }

        // Also target enemy groups
        for (const eg of enemyGroups) {
            const wy = screenYOf(eg.y);
            const dist = playerScreenY() - wy;
            if (dist > 30 && dist < bestDist && dist < H) {
                const aliveCount = eg.enemies.filter(e => e.alive).length;
                if (aliveCount > 0) {
                    bestDist = dist;
                    bestTarget = { type: 'group', group: eg, wy };
                }
            }
        }

        // Boss
        if (boss && !boss.smashed) {
            const by = screenYOf(boss.y);
            const dist = playerScreenY() - by;
            if (dist > 30 && dist < bestDist && dist < H) {
                bestDist = dist;
                bestTarget = { type: 'boss', wy: by };
            }
        }

        return bestTarget;
    }

    function fireFromArmy(dt) {
        fireCooldown -= dt;
        if (fireCooldown > 0) return;

        const target = findShootTarget();
        if (!target) return;

        // Fire rate scales with army size
        const shotsPerSecond = Math.min(2 + playerNum * 0.5, 20);
        fireCooldown = 1 / shotsPerSecond;

        const px = playerScreenX();
        const py = playerScreenY();

        // Pick a random stickman to fire from
        const count = Math.min(Math.ceil(playerNum / 3), 5); // bullets per volley
        for (let i = 0; i < count; i++) {
            const sm = stickmen[Math.floor(Math.random() * stickmen.length)];
            if (!sm) continue;

            const spread = 1 + stickmen.length * 0.01;
            const sx = px + sm.ox * spread;
            const sy = py + sm.oy * 0.5 - 15;

            // Aim at target
            const tx = target.type === 'group'
                ? TRACK_L + TRACK_W / 2 + (Math.random() - 0.5) * TRACK_W * 0.4
                : TRACK_L + TRACK_W / 2;
            const ty = target.wy;

            const dx = tx - sx;
            const dy = ty - sy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const speed = 600;
            const spread2 = 0.05;

            bullets.push({
                x: sx,
                y: sy,
                vx: (dx / dist + (Math.random() - 0.5) * spread2) * speed,
                vy: (dy / dist + (Math.random() - 0.5) * spread2) * speed,
                life: 2,
                trail: [],
            });

            // Muzzle flash
            muzzleFlashes.push({
                x: sx, y: sy - 5,
                life: 0.08,
                size: 4 + Math.random() * 3,
            });
        }
    }

    function updateBullets(dt) {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.trail.push({ x: b.x, y: b.y });
            if (b.trail.length > 4) b.trail.shift();

            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;

            if (b.life <= 0 || b.y < -50) {
                bullets.splice(i, 1);
                continue;
            }

            // Hit enemy groups
            let hit = false;
            for (const eg of enemyGroups) {
                const wy = screenYOf(eg.y);
                for (const enemy of eg.enemies) {
                    if (!enemy.alive) continue;
                    const ex = TRACK_L + TRACK_W / 2 + enemy.ox;
                    const ey = wy + enemy.oy;
                    if (Math.abs(b.x - ex) < 15 && Math.abs(b.y - ey) < 20) {
                        enemy.hp--;
                        if (enemy.hp <= 0) {
                            enemy.alive = false;
                            // Damage the wall
                            const wall = obstacles[eg.wallIndex];
                            if (wall && !wall.smashed) {
                                const dmg = 1 + Math.floor(playerNum * 0.1);
                                wall.hp -= dmg;
                                wall.hitFlash = 0.1;
                                if (wall.hp <= 0) {
                                    wall.hp = 0;
                                    wall.smashed = true;
                                    score += wall.maxHp * 10;
                                    spawnBurst(TRACK_L + TRACK_W / 2, wy, 30, '#ff7675');
                                    spawnWallDebris(TRACK_L + TRACK_W / 2, wy, wall.w);
                                    shake(10);
                                    spawnFloating(TRACK_L + TRACK_W / 2, wy, '+' + wall.maxHp * 10, '#feca57', 28);
                                }
                            }
                            spawnBurst(ex, ey, 8, enemy.color);
                        }
                        spawnBurst(b.x, b.y, 3, C.bullet);
                        hit = true;
                        break;
                    }
                }
                if (hit) break;
            }

            // Hit walls directly
            if (!hit) {
                for (const wall of obstacles) {
                    if (wall.smashed) continue;
                    const wy = screenYOf(wall.y);
                    const wx = TRACK_L + (TRACK_W - wall.w) / 2;
                    if (b.x > wx && b.x < wx + wall.w &&
                        b.y > wy - wall.h / 2 && b.y < wy + wall.h / 2) {
                        wall.hp -= 1;
                        wall.hitFlash = 0.08;
                        if (wall.hp <= 0) {
                            wall.hp = 0;
                            wall.smashed = true;
                            score += wall.maxHp * 10;
                            spawnBurst(TRACK_L + TRACK_W / 2, wy, 30, '#ff7675');
                            spawnWallDebris(TRACK_L + TRACK_W / 2, wy, wall.w);
                            shake(10);
                            spawnFloating(TRACK_L + TRACK_W / 2, wy, '+' + wall.maxHp * 10, '#feca57', 28);
                        }
                        spawnBurst(b.x, b.y, 2, '#ff6');
                        hit = true;
                        break;
                    }
                }
            }

            // Hit boss
            if (!hit && boss && !boss.smashed) {
                const by = screenYOf(boss.y);
                const bx = TRACK_L + (TRACK_W - boss.w) / 2;
                if (b.x > bx && b.x < bx + boss.w &&
                    b.y > by - boss.h / 2 && b.y < by + boss.h / 2) {
                    boss.hp -= 1;
                    boss.hitFlash = 0.06;
                    spawnBurst(b.x, b.y, 2, '#feca57');
                    hit = true;
                    if (boss.hp <= 0) {
                        boss.hp = 0;
                        boss.smashed = true;
                        score += boss.maxHp * 20;
                        spawnConfetti(W / 2, by, 100);
                        spawnWallDebris(TRACK_L + TRACK_W / 2, by, boss.w);
                        shake(20);
                        gameState = 'levelcomplete';
                        setTimeout(() => { level++; startLevel(); }, 2500);
                    }
                }
            }

            if (hit) {
                bullets.splice(i, 1);
            }
        }
    }

    // ─── Particles & Effects ────────────────────────────────────────
    function spawnBurst(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const spd = 1.5 + Math.random() * 4;
            particles.push({
                x, y,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd - 1.5,
                life: 30 + Math.random() * 25,
                maxLife: 55,
                r: 2 + Math.random() * 4,
                color,
            });
        }
    }

    function spawnWallDebris(x, y, wallW) {
        const colors = ['#c0392b', '#e74c3c', '#d35400', '#e67e22', '#795548'];
        for (let i = 0; i < 20; i++) {
            const a = -Math.PI * 0.8 + Math.random() * Math.PI * 0.6;
            const spd = 3 + Math.random() * 7;
            particles.push({
                x: x + (Math.random() - 0.5) * wallW,
                y: y + (Math.random() - 0.5) * 30,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd - 3,
                life: 40 + Math.random() * 30,
                maxLife: 70,
                r: 4 + Math.random() * 6,
                color: colors[Math.floor(Math.random() * colors.length)],
                debris: true,
            });
        }
    }

    function spawnConfetti(x, y, count) {
        const colors = ['#ff6b9d', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#00d2d3', '#ff6348', '#a29bfe'];
        for (let i = 0; i < count; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
            const spd = 4 + Math.random() * 8;
            particles.push({
                x: x + (Math.random() - 0.5) * 100,
                y,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd,
                life: 80 + Math.random() * 50,
                maxLife: 130,
                r: 3 + Math.random() * 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                confetti: true,
                rot: Math.random() * Math.PI * 2,
                rotSpd: (Math.random() - 0.5) * 0.3,
            });
        }
    }

    function spawnFloating(x, y, text, color, size) {
        floatingTexts.push({
            x, y, text,
            color: color || '#333',
            size: size || 28,
            life: 50, maxLife: 50,
        });
    }

    function shake(mag) { shakeMag = Math.max(shakeMag, mag); }

    // ─── Coordinate helpers ─────────────────────────────────────────
    function screenYOf(worldY) { return H * 0.72 + (worldY + scrollY); }
    function playerScreenX() { return TRACK_L + TRACK_W / 2 + playerX * (TRACK_W * 0.28); }
    function playerScreenY() { return H * 0.72; }

    // ─── Update ─────────────────────────────────────────────────────
    function update(dt) {
        if (gameState === 'menu' || gameState === 'gameover') return;

        playerX += (targetX - playerX) * Math.min(1, dt * 12);

        if (gameState === 'playing') {
            const speed = 160 + level * 8;
            scrollY += speed * dt;

            progressFill.style.width = (Math.min(scrollY / levelLength, 1) * 100) + '%';

            // Shooting
            fireFromArmy(dt);
            updateBullets(dt);

            // Gate collisions
            const psy = playerScreenY();
            for (const gp of gatePairs) {
                if (gp.collected) continue;
                const gy = screenYOf(gp.y);
                if (Math.abs(gy - psy) < 40) {
                    gp.collected = true;
                    const side = playerX < 0 ? 'left' : 'right';
                    const gate = gp[side];
                    const diff = applyGate(gate);
                    const gx = side === 'left'
                        ? TRACK_L + LANE_W * 0.5
                        : TRACK_L + LANE_W * 1.5;

                    if (diff > 0) {
                        spawnBurst(gx, gy, 25, '#00b894');
                        spawnFloating(gx, gy - 50, '+' + diff, '#00b894', 36);
                        shake(5);
                    } else if (diff < 0) {
                        spawnBurst(gx, gy, 12, '#e17055');
                        spawnFloating(gx, gy - 50, '' + diff, '#e17055', 30);
                        shake(7);
                    }
                    updateStickmen();
                }
            }

            // Wall collisions (if not already shot down)
            for (const wall of obstacles) {
                if (wall.smashed) continue;
                const wy = screenYOf(wall.y);
                if (Math.abs(wy - psy) < 45) {
                    playerNum -= wall.hp;
                    wall.smashed = true;
                    score += wall.maxHp * 5;
                    spawnBurst(W / 2, wy, 25, '#ff7675');
                    spawnWallDebris(W / 2, wy, wall.w);
                    shake(12);

                    if (playerNum <= 0) {
                        playerNum = 0;
                        doGameOver();
                        return;
                    }
                    spawnFloating(W / 2, wy - 30, '-' + wall.hp, '#ff4444', 28);
                    updateStickmen();
                }
            }

            // Boss collision — enter smash mode if we reach it and it still has HP
            if (boss && !boss.smashed) {
                const by = screenYOf(boss.y);
                if (by > psy - 80 && boss.hp > 0) {
                    gameState = 'smashing';
                    smashTimer = 0;
                }
            }
        }

        if (gameState === 'smashing' && boss) {
            smashTimer += dt;
            // Still shooting at boss
            fireFromArmy(dt);
            updateBullets(dt);

            // Also drain via contact
            const drainRate = Math.max(boss.maxHp / 3, playerNum * 2);
            const drain = drainRate * dt;
            const actual = Math.min(drain, boss.hp, playerNum);

            boss.hp -= actual;
            playerNum -= actual * 0.5; // contact costs less than full
            playerNum = Math.max(0, Math.round(playerNum));
            boss.hp = Math.max(0, boss.hp);
            boss.hitFlash = 0.05;

            if (Math.random() < 0.6) {
                const bx = TRACK_L + Math.random() * TRACK_W;
                const by = screenYOf(boss.y);
                spawnBurst(bx, by, 2, '#ff6348');
            }
            shake(3);

            if (boss.hp <= 0) {
                boss.smashed = true;
                score += boss.maxHp * 20;
                spawnConfetti(W / 2, screenYOf(boss.y), 100);
                spawnWallDebris(W / 2, screenYOf(boss.y), boss.w);
                shake(20);
                gameState = 'levelcomplete';
                setTimeout(() => { level++; startLevel(); }, 2500);
            } else if (playerNum <= 0) {
                doGameOver();
                return;
            }
            updateStickmen();
        }

        // Muzzle flashes
        for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
            muzzleFlashes[i].life -= dt;
            if (muzzleFlashes[i].life <= 0) muzzleFlashes.splice(i, 1);
        }

        // Wall hit flashes
        for (const wall of obstacles) wall.hitFlash = Math.max(0, wall.hitFlash - dt);
        if (boss) boss.hitFlash = Math.max(0, boss.hitFlash - dt);

        // Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt * 60;
            p.y += p.vy * dt * 60;
            p.vy += (p.confetti ? 0.12 : p.debris ? 0.15 : 0.04) * dt * 60;
            p.vx *= p.debris ? 0.97 : 0.98;
            if (p.rot !== undefined) p.rot += p.rotSpd;
            p.life -= dt * 60;
            if (p.life <= 0) particles.splice(i, 1);
        }

        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            const ft = floatingTexts[i];
            ft.y -= 1.2 * dt * 60;
            ft.life -= dt * 60;
            if (ft.life <= 0) floatingTexts.splice(i, 1);
        }

        shakeMag *= 0.85;
        if (shakeMag < 0.3) shakeMag = 0;
        shakeX = (Math.random() - 0.5) * shakeMag * 2;
        shakeY = (Math.random() - 0.5) * shakeMag * 2;
    }

    // ─── Drawing ────────────────────────────────────────────────────
    function draw() {
        ctx.save();
        ctx.translate(shakeX, shakeY);

        // Sky gradient
        const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
        skyGrad.addColorStop(0, C.sky);
        skyGrad.addColorStop(1, C.skyBottom);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, W, H);

        // Grass
        ctx.fillStyle = C.grass1;
        ctx.fillRect(0, 0, TRACK_L, H);
        ctx.fillRect(TRACK_R, 0, W - TRACK_R, H);

        // Grass stripes (scrolling)
        ctx.fillStyle = C.grassStripe;
        for (let y = ((scrollY * 0.6) % 50) - 50; y < H; y += 50) {
            ctx.fillRect(0, y, TRACK_L, 25);
            ctx.fillRect(TRACK_R, y, W - TRACK_R, 25);
        }

        // Track
        const trackGrad = ctx.createLinearGradient(TRACK_L, 0, TRACK_R, 0);
        trackGrad.addColorStop(0, '#d8d8d8');
        trackGrad.addColorStop(0.2, '#e8e8e8');
        trackGrad.addColorStop(0.8, '#e8e8e8');
        trackGrad.addColorStop(1, '#d8d8d8');
        ctx.fillStyle = trackGrad;
        ctx.fillRect(TRACK_L, 0, TRACK_W, H);

        // Center dashes
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 2;
        ctx.setLineDash([25, 20]);
        ctx.lineDashOffset = -(scrollY % 45);
        ctx.beginPath();
        ctx.moveTo(TRACK_L + TRACK_W / 2, 0);
        ctx.lineTo(TRACK_L + TRACK_W / 2, H);
        ctx.stroke();
        ctx.setLineDash([]);

        // Track edges
        ctx.fillStyle = '#bbb';
        ctx.fillRect(TRACK_L - 3, 0, 3, H);
        ctx.fillRect(TRACK_R, 0, 3, H);

        if (gameState === 'menu') { ctx.restore(); return; }

        // Gates
        for (const gp of gatePairs) {
            if (gp.collected) continue;
            const gy = screenYOf(gp.y);
            if (gy < -100 || gy > H + 100) continue;
            drawGatePair(gp, gy);
        }

        // Enemy groups
        for (const eg of enemyGroups) {
            const wall = obstacles[eg.wallIndex];
            if (wall && wall.smashed) continue;
            const wy = screenYOf(eg.y);
            if (wy < -150 || wy > H + 150) continue;
            drawEnemyGroup(eg, wy);
        }

        // Walls
        for (const wall of obstacles) {
            if (wall.smashed) continue;
            const wy = screenYOf(wall.y);
            if (wy < -100 || wy > H + 100) continue;
            drawWall(wall, wy);
        }

        // Boss
        if (boss && !boss.smashed) {
            const by = screenYOf(boss.y);
            if (by > -200 && by < H + 200) drawBoss(boss, by);
        }

        // Bullet trails and bullets
        for (const b of bullets) {
            // Trail
            if (b.trail.length > 1) {
                ctx.strokeStyle = 'rgba(254, 202, 87, 0.3)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(b.trail[0].x, b.trail[0].y);
                for (let t = 1; t < b.trail.length; t++) {
                    ctx.lineTo(b.trail[t].x, b.trail[t].y);
                }
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }

            // Bullet
            ctx.fillStyle = C.bullet;
            ctx.shadowColor = C.bulletGlow;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Muzzle flashes
        for (const mf of muzzleFlashes) {
            const alpha = mf.life / 0.08;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = C.muzzle;
            ctx.beginPath();
            ctx.arc(mf.x, mf.y, mf.size * alpha, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Particles
        for (const p of particles) {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            if (p.confetti) {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot || 0);
                ctx.fillRect(-p.r / 2, -p.r * 0.3, p.r, p.r * 0.6);
                ctx.restore();
            } else if (p.debris) {
                ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;

        // Player army
        drawPlayerArmy();

        // Floating texts
        for (const ft of floatingTexts) {
            const alpha = ft.life / ft.maxLife;
            const scale = 1 + (1 - alpha) * 0.3;
            ctx.globalAlpha = alpha;
            ctx.font = 'bold ' + Math.round(ft.size * scale) + 'px system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Outline
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 3;
            ctx.strokeText(ft.text, ft.x, ft.y);
            ctx.fillStyle = ft.color;
            ctx.fillText(ft.text, ft.x, ft.y);
        }
        ctx.globalAlpha = 1;

        // Level complete
        if (gameState === 'levelcomplete') {
            const bounce = Math.sin(Date.now() * 0.008) * 5;
            ctx.font = 'bold 44px system-ui';
            ctx.textAlign = 'center';
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 4;
            ctx.strokeText('LEVEL COMPLETE!', W / 2, H * 0.33 + bounce);
            ctx.fillStyle = '#4ecdc4';
            ctx.fillText('LEVEL COMPLETE!', W / 2, H * 0.33 + bounce);

            ctx.font = 'bold 24px system-ui';
            ctx.fillStyle = '#feca57';
            ctx.fillText('Score: ' + score, W / 2, H * 0.33 + 45 + bounce);
        }

        ctx.restore();
    }

    function drawGatePair(gp, gy) {
        const gateH = 70;
        const gap = 5;

        // Pillars on the sides
        ctx.fillStyle = '#999';
        ctx.fillRect(TRACK_L - 2, gy - gateH / 2 - 10, 6, gateH + 20);
        ctx.fillRect(TRACK_R - 4, gy - gateH / 2 - 10, 6, gateH + 20);
        ctx.fillRect(TRACK_L + TRACK_W / 2 - 3, gy - gateH / 2 - 10, 6, gateH + 20);

        drawSingleGate(TRACK_L + gap, gy - gateH / 2, LANE_W - gap * 1.5, gateH, gp.left);
        drawSingleGate(TRACK_L + LANE_W + gap * 0.5, gy - gateH / 2, LANE_W - gap * 1.5, gateH, gp.right);
    }

    function drawSingleGate(x, y, w, h, gate) {
        const isGood = gate.op === '+' || gate.op === 'x';
        const isGreat = gate.op === 'x' && gate.val >= 3;
        const color = isGreat ? C.gateGreat : isGood ? C.gateGood : C.gateBad;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        roundRect(x + 3, y + 3, w, h, 14);
        ctx.fill();

        // Body gradient
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, lighten(color, 20));
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
        roundRect(x, y, w, h, 14);
        ctx.fill();

        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        roundRect(x + 6, y + 4, w - 12, h * 0.35, 10);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 2;
        roundRect(x, y, w, h, 14);
        ctx.stroke();

        // Text with shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.font = 'bold 30px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(gate.label, x + w / 2 + 1, y + h / 2 + 2);
        ctx.fillStyle = C.gateText;
        ctx.fillText(gate.label, x + w / 2, y + h / 2);
    }

    function drawWall(wall, wy) {
        const x = TRACK_L + (TRACK_W - wall.w) / 2;
        const flash = wall.hitFlash > 0;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        roundRect(x + 4, wy - wall.h / 2 + 4, wall.w, wall.h, 10);
        ctx.fill();

        // Body
        const grad = ctx.createLinearGradient(x, wy - wall.h / 2, x, wy + wall.h / 2);
        grad.addColorStop(0, flash ? '#ff9999' : '#e74c3c');
        grad.addColorStop(1, flash ? '#ff7777' : C.wallDark);
        ctx.fillStyle = grad;
        roundRect(x, wy - wall.h / 2, wall.w, wall.h, 10);
        ctx.fill();

        // Brick lines
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        const brickH = wall.h / 3;
        for (let row = 0; row < 3; row++) {
            const by = wy - wall.h / 2 + row * brickH;
            ctx.beginPath();
            ctx.moveTo(x + 10, by);
            ctx.lineTo(x + wall.w - 10, by);
            ctx.stroke();
            const offset = row % 2 === 0 ? 0 : wall.w / 4;
            for (let col = 0; col < 4; col++) {
                const bx = x + offset + col * (wall.w / 4);
                if (bx > x && bx < x + wall.w) {
                    ctx.beginPath();
                    ctx.moveTo(bx, by);
                    ctx.lineTo(bx, by + brickH);
                    ctx.stroke();
                }
            }
        }

        // HP bar
        const ratio = wall.hp / wall.maxHp;
        const barW = wall.w - 20;
        const barH = 6;
        const barY = wy + wall.h / 2 + 6;
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        roundRect(x + 10, barY, barW, barH, 3);
        ctx.fill();
        ctx.fillStyle = ratio > 0.5 ? '#e74c3c' : ratio > 0.2 ? '#e67e22' : '#f1c40f';
        roundRect(x + 10, barY, barW * ratio, barH, 3);
        ctx.fill();

        // Number
        ctx.font = 'bold 28px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillText(wall.hp, TRACK_L + TRACK_W / 2 + 1, wy + 1);
        ctx.fillStyle = C.wallText;
        ctx.fillText(wall.hp, TRACK_L + TRACK_W / 2, wy);
    }

    function drawEnemyGroup(eg, wy) {
        const cx = TRACK_L + TRACK_W / 2;
        const t = Date.now() * 0.004;

        for (const e of eg.enemies) {
            if (!e.alive) continue;
            const ex = cx + e.ox;
            const ey = wy + e.oy;
            const bob = Math.sin(t + e.phase) * 1.5;

            // Head
            ctx.fillStyle = e.skin;
            ctx.beginPath();
            ctx.arc(ex, ey - 8 + bob, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Angry eyes
            ctx.fillStyle = '#c0392b';
            ctx.fillRect(ex - 3, ey - 10 + bob, 2, 2);
            ctx.fillRect(ex + 1, ey - 10 + bob, 2, 2);

            // Body
            ctx.fillStyle = e.color;
            ctx.fillRect(ex - 4, ey - 3 + bob, 8, 10);

            // Legs
            ctx.strokeStyle = e.color;
            ctx.lineWidth = 2;
            const legPhase = Math.sin(t * 2 + e.phase);
            ctx.beginPath();
            ctx.moveTo(ex - 2, ey + 7 + bob);
            ctx.lineTo(ex - 3 - legPhase, ey + 14 + bob);
            ctx.moveTo(ex + 2, ey + 7 + bob);
            ctx.lineTo(ex + 3 + legPhase, ey + 14 + bob);
            ctx.stroke();

            // Small weapon
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(ex + 4, ey - 1 + bob);
            ctx.lineTo(ex + 10, ey - 4 + bob);
            ctx.stroke();
        }
    }

    function drawBoss(b, by) {
        const x = TRACK_L + (TRACK_W - b.w) / 2;
        const flash = b.hitFlash > 0;
        const pulse = Math.sin(Date.now() * 0.006) * 3;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        roundRect(x + 6, by - b.h / 2 + 6, b.w, b.h, 16);
        ctx.fill();

        // Body
        const grad = ctx.createLinearGradient(x, by - b.h / 2, x, by + b.h / 2);
        grad.addColorStop(0, flash ? '#ff5555' : '#c0392b');
        grad.addColorStop(1, flash ? '#cc3333' : C.bossWall);
        ctx.fillStyle = grad;
        roundRect(x, by - b.h / 2, b.w, b.h, 16);
        ctx.fill();

        // Skull face
        const faceY = by - 10;
        const faceX = TRACK_L + TRACK_W / 2;

        // Eyes (glowing)
        ctx.fillStyle = '#feca57';
        ctx.shadowColor = '#feca57';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(faceX - 18, faceY - 5, 8 + pulse * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(faceX + 18, faceY - 5, 8 + pulse * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Eye pupils
        ctx.fillStyle = '#2d3436';
        ctx.beginPath();
        ctx.arc(faceX - 18, faceY - 5, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(faceX + 18, faceY - 5, 4, 0, Math.PI * 2);
        ctx.fill();

        // Angry brows
        ctx.strokeStyle = '#2d3436';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(faceX - 28, faceY - 16);
        ctx.lineTo(faceX - 10, faceY - 12);
        ctx.moveTo(faceX + 28, faceY - 16);
        ctx.lineTo(faceX + 10, faceY - 12);
        ctx.stroke();

        // Mouth (jagged)
        ctx.strokeStyle = '#2d3436';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(faceX - 20, faceY + 10);
        for (let i = 0; i < 8; i++) {
            ctx.lineTo(faceX - 20 + i * 5, faceY + 10 + (i % 2 === 0 ? 5 : 0));
        }
        ctx.stroke();

        // BOSS label
        ctx.font = 'bold 14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('BOSS', faceX, by - b.h / 2 + 14);

        // HP bar
        const ratio = b.hp / b.maxHp;
        const barW = b.w - 30;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        roundRect(x + 15, by + b.h / 2 - 22, barW, 10, 5);
        ctx.fill();
        const hpColor = ratio > 0.5 ? '#e74c3c' : ratio > 0.2 ? '#e67e22' : '#f1c40f';
        ctx.fillStyle = hpColor;
        roundRect(x + 15, by + b.h / 2 - 22, barW * ratio, 10, 5);
        ctx.fill();

        // HP Number
        ctx.font = 'bold 32px system-ui';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 3;
        ctx.strokeText(Math.ceil(b.hp), faceX, by + 35);
        ctx.fillText(Math.ceil(b.hp), faceX, by + 35);
    }

    function drawPlayerArmy() {
        const px = playerScreenX();
        const py = playerScreenY();
        const t = Date.now() * 0.004;
        const count = stickmen.length;
        const spread = 1 + count * 0.012;

        // Draw circle base (shadow of army)
        if (count > 1) {
            ctx.fillStyle = 'rgba(0,0,0,0.06)';
            ctx.beginPath();
            ctx.ellipse(px, py + 12, 20 + count * 1.2, 10 + count * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        for (let i = 0; i < count; i++) {
            const s = stickmen[i];
            const sx = px + s.ox * spread;
            const sy = py + s.oy * spread * 0.6;
            const bob = Math.sin(t + s.phase) * 2;
            const legPhase = Math.sin(t * 3 + s.phase);

            // Head
            ctx.fillStyle = '#ffe0cc';
            ctx.beginPath();
            ctx.arc(sx, sy - 12 + bob, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Hair
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(sx, sy - 14 + bob, 5, Math.PI, Math.PI * 2);
            ctx.fill();

            // Body
            ctx.fillStyle = s.color;
            ctx.fillRect(sx - 4, sy - 7 + bob, 8, 11);

            // Gun arm
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(sx + 3, sy - 4 + bob);
            ctx.lineTo(sx + 10, sy - 10 + bob + Math.sin(t + s.phase) * 1);
            ctx.stroke();

            // Gun
            ctx.fillStyle = '#444';
            ctx.fillRect(sx + 8, sy - 13 + bob, 6, 3);

            // Legs
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(sx - 2, sy + 4 + bob);
            ctx.lineTo(sx - 3 - legPhase * 2, sy + 13 + bob);
            ctx.moveTo(sx + 2, sy + 4 + bob);
            ctx.lineTo(sx + 3 + legPhase * 2, sy + 13 + bob);
            ctx.stroke();

            // Shoes
            ctx.fillStyle = '#2d3436';
            ctx.fillRect(sx - 5 - legPhase * 2, sy + 12 + bob, 4, 2);
            ctx.fillRect(sx + 1 + legPhase * 2, sy + 12 + bob, 4, 2);
        }

        // Big number above army
        const numSize = Math.min(52, 30 + count * 0.5);
        ctx.font = 'bold ' + numSize + 'px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Glow
        ctx.shadowColor = 'rgba(255,107,157,0.5)';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 4;
        ctx.strokeText(Math.round(playerNum), px, py - 40);
        ctx.fillStyle = '#fff';
        ctx.fillText(Math.round(playerNum), px, py - 40);
        ctx.shadowBlur = 0;

        // Inner color
        ctx.font = 'bold ' + (numSize - 2) + 'px system-ui';
        ctx.fillStyle = C.player;
        ctx.fillText(Math.round(playerNum), px, py - 40);
    }

    // ─── Helpers ────────────────────────────────────────────────────
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

    function lighten(hex, pct) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.min(255, ((num >> 16) & 0xFF) + pct);
        const g = Math.min(255, ((num >> 8) & 0xFF) + pct);
        const b = Math.min(255, (num & 0xFF) + pct);
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }

    // ─── Input ──────────────────────────────────────────────────────
    let dragging = false;
    let dragStartX = 0;
    let dragPlayerStartX = 0;

    function onDown(cx) { dragging = true; dragStartX = cx; dragPlayerStartX = playerX; }
    function onMove(cx) {
        if (!dragging) return;
        const sensitivity = 2.5 / TRACK_W;
        targetX = Math.max(-1, Math.min(1, dragPlayerStartX + (cx - dragStartX) * sensitivity));
    }
    function onUp() { dragging = false; }

    canvas.addEventListener('mousedown', e => onDown(e.clientX));
    canvas.addEventListener('mousemove', e => onMove(e.clientX));
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onUp);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); onDown(e.touches[0].clientX); }, { passive: false });
    canvas.addEventListener('touchmove', e => { e.preventDefault(); onMove(e.touches[0].clientX); }, { passive: false });
    canvas.addEventListener('touchend', e => { e.preventDefault(); onUp(); }, { passive: false });

    const keys = {};
    window.addEventListener('keydown', e => { keys[e.key] = true; });
    window.addEventListener('keyup', e => { keys[e.key] = false; });
    function handleKeyboard(dt) {
        const speed = 4 * dt;
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) targetX = Math.max(-1, targetX - speed);
        if (keys['ArrowRight'] || keys['d'] || keys['D']) targetX = Math.min(1, targetX + speed);
    }

    // ─── Game Lifecycle ─────────────────────────────────────────────
    function startLevel() {
        gameState = 'playing';
        targetX = 0; playerX = 0;
        particles = []; floatingTexts = []; bullets = []; muzzleFlashes = []; stickmen = [];
        fireCooldown = 0;

        generateLevel(level);
        updateStickmen();

        progressBar.style.display = 'block';
        levelLabel.textContent = 'LEVEL ' + level;
        progressFill.style.width = '0%';
        startScreen.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
    }

    function startGame() { level = 1; score = 0; startLevel(); }

    function doGameOver() {
        gameState = 'gameover';
        progressBar.style.display = 'none';
        gameOverTitle.textContent = 'GAME OVER';
        gameOverTitle.className = '';
        finalLevel.textContent = 'Level ' + level;
        finalScore.textContent = 'Score: ' + score;
        gameOverScreen.classList.remove('hidden');
    }

    // ─── Main Loop ──────────────────────────────────────────────────
    function loop(timestamp) {
        if (!lastTime) lastTime = timestamp;
        const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
        lastTime = timestamp;
        handleKeyboard(dt);
        update(dt);
        draw();
        requestAnimationFrame(loop);
    }

    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-restart').addEventListener('click', startGame);
    requestAnimationFrame(loop);
})();
