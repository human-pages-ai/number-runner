// ═══════════════════════════════════════════════════════════
// MATH SWARM SURVIVOR — 2D Canvas Game
// Uses pre-rendered offscreen canvas sprites for quality
// ═══════════════════════════════════════════════════════════

(function() {
'use strict';

const canvas = document.createElement('canvas');
canvas.style.cssText = 'display:block;position:absolute;top:0;left:0;z-index:1;';
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

// ── Canvas sizing ──
let W, H, cx;
function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
    cx = W / 2;
}
resize();
window.addEventListener('resize', resize);

// ── Perspective constants ──
const roadBottomFrac = 0.92;
const roadTopFrac = 0.52;

function roadX(xNorm, t) {
    const rw = (roadTopFrac + (roadBottomFrac - roadTopFrac) * t) * W;
    return cx + xNorm * rw / 2;
}
function roadY(t) { return H * t; }
function roadS(t) { return t; }

// ═══════════════════════════════════════
// PRE-RENDERED SPRITES
// ═══════════════════════════════════════

function createSprite(w, h, drawFn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    drawFn(x, w, h);
    return c;
}

function rrp(x, cx, cy, w, h, r) {
    r = Math.min(r || 0, w/2, h/2);
    x.beginPath();
    x.moveTo(cx+r, cy); x.lineTo(cx+w-r, cy);
    x.quadraticCurveTo(cx+w, cy, cx+w, cy+r); x.lineTo(cx+w, cy+h-r);
    x.quadraticCurveTo(cx+w, cy+h, cx+w-r, cy+h); x.lineTo(cx+r, cy+h);
    x.quadraticCurveTo(cx, cy+h, cx, cy+h-r); x.lineTo(cx, cy+r);
    x.quadraticCurveTo(cx, cy, cx+r, cy); x.closePath();
}

function rrect(x, y, w, h, r) {
    r = Math.min(r || 0, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
    ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
    ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

// ── SOLDIER SPRITE ──
const soldierSprite = createSprite(256, 256, (x, w, h) => {
    const cx = w/2;
    x.strokeStyle = '#00e5ff'; x.lineWidth = 4;
    x.beginPath(); x.ellipse(cx, h-20, 80, 25, 0, 0, Math.PI*2); x.stroke();
    x.fillStyle = 'rgba(0,229,255,0.1)'; x.fill();
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.beginPath(); x.ellipse(cx, h-20, 50, 16, 0, 0, Math.PI*2); x.fill();
    x.fillStyle = '#1a1a15';
    rrp(x, cx-38, h-55, 28, 38, 6); x.fill();
    rrp(x, cx+10, h-55, 28, 38, 6); x.fill();
    x.fillStyle = '#4a5a30'; rrp(x, cx-34, h-100, 24, 52, 5); x.fill();
    x.fillStyle = '#3e5028'; rrp(x, cx+10, h-100, 24, 52, 5); x.fill();
    const vg = x.createLinearGradient(cx, h-190, cx, h-95);
    vg.addColorStop(0, '#c08030'); vg.addColorStop(0.3, '#b07028');
    vg.addColorStop(0.7, '#a06020'); vg.addColorStop(1, '#906018');
    x.fillStyle = vg; rrp(x, cx-48, h-185, 96, 90, 12); x.fill();
    x.strokeStyle = '#604010'; x.lineWidth = 2; rrp(x, cx-48, h-185, 96, 90, 12); x.stroke();
    x.fillStyle = 'rgba(0,0,0,0.12)';
    rrp(x, cx-38, h-165, 28, 22, 4); x.fill();
    rrp(x, cx+10, h-165, 28, 22, 4); x.fill();
    x.fillStyle = '#3a3225'; x.fillRect(cx-48, h-100, 96, 8);
    x.fillStyle = '#888060'; rrp(x, cx-6, h-101, 12, 10, 2); x.fill();
    x.fillStyle = '#8a6020'; rrp(x, cx-40, h-180, 80, 50, 8); x.fill();
    x.strokeStyle = '#604010'; x.lineWidth = 1; rrp(x, cx-40, h-180, 80, 50, 8); x.stroke();
    x.fillStyle = '#a06828';
    x.save(); x.translate(cx-52, h-170); x.rotate(-0.1);
    rrp(x, -14, 0, 28, 65, 8); x.fill();
    x.strokeStyle = '#604010'; x.lineWidth = 1.5; rrp(x, -14, 0, 28, 65, 8); x.stroke();
    x.restore();
    x.fillStyle = '#a06828';
    x.save(); x.translate(cx+52, h-170); x.rotate(0.1);
    rrp(x, -14, 0, 28, 60, 8); x.fill();
    x.strokeStyle = '#604010'; x.lineWidth = 1.5; rrp(x, -14, 0, 28, 60, 8); x.stroke();
    x.restore();
    x.fillStyle = '#d4a870';
    x.beginPath(); x.arc(cx-58, h-108, 10, 0, Math.PI*2); x.fill();
    x.beginPath(); x.arc(cx+58, h-112, 10, 0, Math.PI*2); x.fill();
    x.fillStyle = '#d4a870'; x.fillRect(cx-10, h-205, 20, 22);
    x.beginPath(); x.arc(cx, h-218, 28, 0, Math.PI*2); x.fill();
    const hg = x.createLinearGradient(cx, h-252, cx, h-210);
    hg.addColorStop(0, '#4a6a30'); hg.addColorStop(1, '#345020');
    x.fillStyle = hg;
    x.beginPath(); x.arc(cx, h-222, 33, Math.PI, 0);
    x.lineTo(cx+38, h-212); x.lineTo(cx-38, h-212); x.closePath(); x.fill();
    x.fillStyle = '#2e4418';
    x.beginPath(); x.ellipse(cx, h-212, 38, 10, 0, 0, Math.PI*2); x.fill();
    x.save(); x.translate(cx+25, h-140); x.rotate(-0.05);
    x.fillStyle = '#3a3832'; rrp(x, -8, 20, 16, 25, 3); x.fill();
    x.fillStyle = '#2a2a28'; rrp(x, -7, -50, 14, 72, 3); x.fill();
    x.fillStyle = '#333'; x.fillRect(-4, -85, 8, 40);
    x.fillStyle = '#222'; rrp(x, 6, -20, 10, 30, 2); x.fill();
    const mfG = x.createRadialGradient(0, -88, 0, 0, -88, 25);
    mfG.addColorStop(0, 'rgba(255,240,150,0.9)'); mfG.addColorStop(0.4, 'rgba(255,150,30,0.5)');
    mfG.addColorStop(1, 'rgba(255,60,0,0)');
    x.fillStyle = mfG; x.beginPath(); x.arc(0, -88, 25, 0, Math.PI*2); x.fill();
    x.fillStyle = 'rgba(255,255,220,0.8)'; x.beginPath(); x.arc(0, -88, 8, 0, Math.PI*2); x.fill();
    x.restore();
});

// ── ZOMBIE SPRITE ──
const zombieSprite = createSprite(256, 300, (x, w, h) => {
    const cx = w/2;
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.beginPath(); x.ellipse(cx, h-15, 55, 18, 0, 0, Math.PI*2); x.fill();
    x.fillStyle = '#4a3a20';
    x.beginPath(); x.ellipse(cx-25, h-22, 16, 8, -0.2, 0, Math.PI*2); x.fill();
    x.beginPath(); x.ellipse(cx+25, h-22, 16, 8, 0.2, 0, Math.PI*2); x.fill();
    x.fillStyle = '#3a3020'; rrp(x, cx-32, h-90, 22, 68, 5); x.fill();
    rrp(x, cx+10, h-90, 22, 68, 5); x.fill();
    x.fillStyle = '#5a4a30';
    x.beginPath(); x.moveTo(cx-32,h-30); x.lineTo(cx-28,h-40); x.lineTo(cx-18,h-28);
    x.lineTo(cx-14,h-38); x.lineTo(cx-10,h-30); x.closePath(); x.fill();
    const bg = x.createLinearGradient(cx, h-190, cx, h-85);
    bg.addColorStop(0, '#5a4a28'); bg.addColorStop(0.5, '#6a5530'); bg.addColorStop(1, '#4a3a20');
    x.fillStyle = bg; rrp(x, cx-45, h-185, 90, 100, 10); x.fill();
    x.fillStyle = 'rgba(120,30,20,0.4)';
    x.beginPath(); x.ellipse(cx-15, h-150, 8, 3, -0.3, 0, Math.PI*2); x.fill();
    x.beginPath(); x.ellipse(cx+20, h-130, 6, 3, 0.5, 0, Math.PI*2); x.fill();
    x.strokeStyle = '#2a2015'; x.lineWidth = 2; rrp(x, cx-45, h-185, 90, 100, 10); x.stroke();
    x.fillStyle = '#5a4a28';
    x.save(); x.translate(cx-48, h-170); x.rotate(-0.8);
    rrp(x, -14, -70, 28, 80, 8); x.fill();
    x.strokeStyle = '#3a2a15'; x.lineWidth = 2; rrp(x, -14, -70, 28, 80, 8); x.stroke();
    x.fillStyle = '#4a3a20';
    for(let f=-2;f<=2;f++){x.beginPath();x.moveTo(f*6,-70);x.lineTo(f*8-2,-88);x.lineTo(f*8+2,-88);x.lineTo(f*6+3,-70);x.fill();}
    x.restore();
    x.fillStyle = '#5a4a28';
    x.save(); x.translate(cx+48, h-170); x.rotate(0.8);
    rrp(x, -14, -70, 28, 80, 8); x.fill();
    x.strokeStyle = '#3a2a15'; x.lineWidth = 2; rrp(x, -14, -70, 28, 80, 8); x.stroke();
    x.fillStyle = '#4a3a20';
    for(let f=-2;f<=2;f++){x.beginPath();x.moveTo(f*6,-70);x.lineTo(f*8-2,-88);x.lineTo(f*8+2,-88);x.lineTo(f*6+3,-70);x.fill();}
    x.restore();
    x.fillStyle = '#5a4a28'; x.fillRect(cx-12, h-208, 24, 25);
    const hdg = x.createRadialGradient(cx, h-225, 0, cx, h-225, 32);
    hdg.addColorStop(0, '#6a5530'); hdg.addColorStop(1, '#4a3820');
    x.fillStyle = hdg; x.beginPath(); x.arc(cx, h-225, 32, 0, Math.PI*2); x.fill();
    x.strokeStyle = '#3a2815'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#4a3820';
    x.beginPath(); x.ellipse(cx, h-235, 28, 8, 0, Math.PI, 0); x.fill();
    x.shadowColor = '#ff4400'; x.shadowBlur = 15; x.fillStyle = '#ff4400';
    x.beginPath(); x.arc(cx-12, h-230, 6, 0, Math.PI*2); x.fill();
    x.beginPath(); x.arc(cx+12, h-230, 6, 0, Math.PI*2); x.fill();
    x.fillStyle = '#ff8800';
    x.beginPath(); x.arc(cx-12, h-230, 3, 0, Math.PI*2); x.fill();
    x.beginPath(); x.arc(cx+12, h-230, 3, 0, Math.PI*2); x.fill();
    x.shadowBlur = 0;
    x.fillStyle = '#1a0a00';
    x.beginPath(); x.ellipse(cx, h-212, 14, 9, 0, 0, Math.PI*2); x.fill();
    x.fillStyle = '#c0b898';
    for(let t=-3;t<=3;t++) x.fillRect(cx+t*4-1, h-218, 3, 5);
});

// ── BOSS SPRITE ──
const bossSprite = createSprite(512, 600, (x, w, h) => {
    const cx = w/2;
    x.fillStyle = 'rgba(0,0,0,0.3)';
    x.beginPath(); x.ellipse(cx, h-20, 120, 35, 0, 0, Math.PI*2); x.fill();
    x.fillStyle = '#4a3518';
    x.beginPath(); x.ellipse(cx-55, h-30, 35, 16, -0.15, 0, Math.PI*2); x.fill();
    x.beginPath(); x.ellipse(cx+55, h-30, 35, 16, 0.15, 0, Math.PI*2); x.fill();
    x.fillStyle = '#4a3a1e'; rrp(x, cx-70, h-170, 50, 140, 10); x.fill();
    x.fillStyle = '#3e3218'; rrp(x, cx+20, h-170, 50, 140, 10); x.fill();
    const bg2 = x.createLinearGradient(cx, h-380, cx, h-160);
    bg2.addColorStop(0, '#6a4a20'); bg2.addColorStop(0.3, '#7a5a28');
    bg2.addColorStop(0.6, '#6a4a22'); bg2.addColorStop(1, '#5a3a18');
    x.fillStyle = bg2; rrp(x, cx-95, h-370, 190, 210, 18); x.fill();
    x.strokeStyle = '#3a2510'; x.lineWidth = 3; rrp(x, cx-95, h-370, 190, 210, 18); x.stroke();
    x.strokeStyle = 'rgba(0,0,0,0.15)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(cx, h-360); x.lineTo(cx, h-280); x.stroke();
    for(let i=0;i<3;i++){x.beginPath();x.moveTo(cx-40,h-280+i*30);x.lineTo(cx+40,h-280+i*30);x.stroke();}
    x.fillStyle = 'rgba(140,30,20,0.5)';
    x.beginPath(); x.ellipse(cx-30, h-310, 15, 5, -0.4, 0, Math.PI*2); x.fill();
    x.beginPath(); x.ellipse(cx+40, h-260, 12, 5, 0.3, 0, Math.PI*2); x.fill();
    x.fillStyle = '#6a4a22';
    x.save(); x.translate(cx-100, h-350); x.rotate(-0.7);
    rrp(x, -25, -120, 50, 150, 14); x.fill();
    x.strokeStyle = '#3a2510'; x.lineWidth = 2.5; rrp(x, -25, -120, 50, 150, 14); x.stroke();
    x.fillStyle = '#5a3a18';
    for(let f=-2;f<=2;f++){x.beginPath();x.moveTo(f*10,-120);x.lineTo(f*14-4,-155);x.lineTo(f*14+4,-155);x.lineTo(f*10+5,-120);x.fill();}
    x.restore();
    x.fillStyle = '#6a4a22';
    x.save(); x.translate(cx+100, h-350); x.rotate(0.7);
    rrp(x, -25, -120, 50, 150, 14); x.fill();
    x.strokeStyle = '#3a2510'; x.lineWidth = 2.5; rrp(x, -25, -120, 50, 150, 14); x.stroke();
    x.fillStyle = '#5a3a18';
    for(let f=-2;f<=2;f++){x.beginPath();x.moveTo(f*10,-120);x.lineTo(f*14-4,-155);x.lineTo(f*14+4,-155);x.lineTo(f*10+5,-120);x.fill();}
    x.restore();
    x.fillStyle = '#5a4220'; x.fillRect(cx-22, h-410, 44, 45);
    const hg2 = x.createRadialGradient(cx, h-435, 0, cx, h-435, 55);
    hg2.addColorStop(0, '#7a5a28'); hg2.addColorStop(1, '#4a3518');
    x.fillStyle = hg2; x.beginPath(); x.arc(cx, h-435, 55, 0, Math.PI*2); x.fill();
    x.strokeStyle = '#3a2510'; x.lineWidth = 3; x.stroke();
    x.fillStyle = '#4a3518'; x.beginPath(); x.ellipse(cx, h-450, 48, 15, 0, Math.PI, 0); x.fill();
    x.shadowColor = '#ff4400'; x.shadowBlur = 25; x.fillStyle = '#ff4400';
    x.beginPath(); x.arc(cx-20, h-445, 10, 0, Math.PI*2); x.fill();
    x.beginPath(); x.arc(cx+20, h-445, 10, 0, Math.PI*2); x.fill();
    x.fillStyle = '#ffaa00';
    x.beginPath(); x.arc(cx-20, h-445, 5, 0, Math.PI*2); x.fill();
    x.beginPath(); x.arc(cx+20, h-445, 5, 0, Math.PI*2); x.fill();
    x.shadowBlur = 0;
    x.fillStyle = '#1a0800';
    x.beginPath(); x.ellipse(cx, h-418, 25, 15, 0, 0, Math.PI*2); x.fill();
    x.fillStyle = '#c0b090';
    for(let t=-4;t<=4;t++){x.fillRect(cx+t*6-2,h-428,4,6+Math.abs(t)*1.5);}
});

// ── BARREL+TURRET SPRITE ──
const barrelSprite = createSprite(256, 300, (x, w, h) => {
    const cx = w/2, bw = 180, bh = 140, by = h - 30;
    x.fillStyle = 'rgba(0,0,0,0.3)';
    x.beginPath(); x.ellipse(cx, by, 85, 22, 0, 0, Math.PI*2); x.fill();
    const cg = x.createLinearGradient(cx-bw/2, by-bh, cx+bw/2, by);
    cg.addColorStop(0,'#4a4035'); cg.addColorStop(0.3,'#5a4e42');
    cg.addColorStop(0.6,'#4a4035'); cg.addColorStop(1,'#3a3228');
    x.fillStyle = cg; rrp(x, cx-bw/2, by-bh, bw, bh, 8); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.1)'; x.lineWidth = 1;
    for(let i=0;i<6;i++){const ly=by-bh+10+i*(bh/6);x.beginPath();x.moveTo(cx-bw/2+8,ly);x.lineTo(cx+bw/2-8,ly);x.stroke();}
    x.strokeStyle = '#6a6258'; x.lineWidth = 4;
    [0.2,0.5,0.8].forEach(p => {x.beginPath();x.moveTo(cx-bw/2,by-bh*p);x.lineTo(cx+bw/2,by-bh*p);x.stroke();});
    x.strokeStyle = '#2a2420'; x.lineWidth = 3; rrp(x, cx-bw/2, by-bh, bw, bh, 8); x.stroke();
    const ty = by - bh - 10;
    x.strokeStyle = '#008898'; x.lineWidth = 5; x.lineCap = 'round';
    x.beginPath(); x.moveTo(cx-10,ty); x.lineTo(cx-55,ty+40); x.stroke();
    x.beginPath(); x.moveTo(cx+10,ty); x.lineTo(cx+55,ty+40); x.stroke();
    x.beginPath(); x.moveTo(cx,ty); x.lineTo(cx,ty+30); x.stroke();
    x.fillStyle = '#00c8d8';
    x.beginPath(); x.moveTo(cx-55,ty-5); x.lineTo(cx-55,ty-30); x.lineTo(cx-30,ty-38);
    x.lineTo(cx+30,ty-38); x.lineTo(cx+50,ty-28); x.lineTo(cx+50,ty-5); x.closePath();
    x.fill(); x.strokeStyle = '#009ab0'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#00aabb'; x.fillRect(cx-6, ty-90, 12, 55);
    x.fillStyle = '#0098a8'; x.fillRect(cx-20, ty-85, 10, 50);
    x.fillStyle = '#00e5ff'; x.shadowColor = '#00e5ff'; x.shadowBlur = 12;
    x.beginPath(); x.arc(cx, ty-92, 7, 0, Math.PI*2); x.fill();
    x.beginPath(); x.arc(cx-15, ty-87, 6, 0, Math.PI*2); x.fill();
    x.shadowBlur = 0;
    x.fillStyle = '#008090'; x.beginPath(); x.arc(cx+42, ty-18, 18, 0, Math.PI*2); x.fill();
    x.strokeStyle = '#006070'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#00a8b8'; rrp(x, cx-62, ty-25, 14, 28, 4); x.fill();
    x.lineCap = 'butt';
});

// ═══════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════

let state = 'start';
let level = 0;
let score = 0;
let distance = 0;
let speed = 4;
let playerX = 0;
let targetX = 0;
let squad = 5;
let damage = 1;
let fireRate = 3;
let fireCooldown = 0;
let coins = 0;
let shakeAmount = 0;

let zombies = [];
let barrels = [];
let bullets = [];
let gates = [];
let particles = [];
let floatingTexts = [];

const LEVEL_DEFS = [
    { name:'Training',   sections:3,  zombieRate:0.8,  zombieHP:3,  barrelHP:30,  bossHP:0,    gateFreq:2 },
    { name:'Skirmish',   sections:4,  zombieRate:1.2,  zombieHP:5,  barrelHP:50,  bossHP:0,    gateFreq:2 },
    { name:'Assault',    sections:5,  zombieRate:1.5,  zombieHP:8,  barrelHP:80,  bossHP:200,  gateFreq:3 },
    { name:'Swarm',      sections:5,  zombieRate:2.0,  zombieHP:12, barrelHP:100, bossHP:400,  gateFreq:3 },
    { name:'Siege',      sections:6,  zombieRate:2.5,  zombieHP:15, barrelHP:150, bossHP:600,  gateFreq:3 },
    { name:'Carnage',    sections:6,  zombieRate:3.0,  zombieHP:20, barrelHP:200, bossHP:900,  gateFreq:4 },
    { name:'Inferno',    sections:7,  zombieRate:3.5,  zombieHP:25, barrelHP:250, bossHP:1200, gateFreq:4 },
    { name:'Apocalypse', sections:7,  zombieRate:4.0,  zombieHP:30, barrelHP:300, bossHP:1600, gateFreq:4 },
    { name:'Extinction', sections:8,  zombieRate:4.5,  zombieHP:40, barrelHP:400, bossHP:2000, gateFreq:5 },
    { name:'Armageddon', sections:8,  zombieRate:5.0,  zombieHP:50, barrelHP:500, bossHP:3000, gateFreq:5 },
    { name:'Hell',       sections:9,  zombieRate:5.5,  zombieHP:60, barrelHP:600, bossHP:4000, gateFreq:5 },
    { name:'Oblivion',   sections:9,  zombieRate:6.0,  zombieHP:70, barrelHP:700, bossHP:5000, gateFreq:6 },
    { name:'Void',       sections:10, zombieRate:6.5,  zombieHP:80, barrelHP:800, bossHP:6400, gateFreq:6 },
    { name:'FINAL',      sections:10, zombieRate:7.0,  zombieHP:100,barrelHP:1000,bossHP:8000, gateFreq:6 },
];

let levelDef = LEVEL_DEFS[0];
let sectionLength = 40;
let nextSpawnZ = 10;
let nextGateZ = 20;
let nextBarrelZ = 15;
let bossSpawned = false;

function mulberry32(a) {
    return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
let rng = mulberry32(42);

// ═══════════════════════════════════════
// GAME LOGIC
// ═══════════════════════════════════════

function startLevel(lvl) {
    level = lvl;
    levelDef = LEVEL_DEFS[Math.min(lvl, LEVEL_DEFS.length - 1)];
    state = 'playing';
    distance = 0; score = 0; squad = 5; damage = 1;
    fireRate = 3; fireCooldown = 0; coins = 0;
    playerX = 0; targetX = 0; speed = 4; shakeAmount = 0;
    zombies = []; barrels = []; bullets = []; gates = [];
    particles = []; floatingTexts = [];
    nextSpawnZ = 10; nextGateZ = 20; nextBarrelZ = 15;
    bossSpawned = false;
    rng = mulberry32(lvl * 137 + 42);

    document.getElementById('hud').style.display = 'flex';
    document.getElementById('wave-bar').style.display = 'block';
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('active');
    document.getElementById('gameover-screen').classList.add('hidden');
}

function endGame(won) {
    state = won ? 'levelcomplete' : 'gameover';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('wave-bar').style.display = 'none';
    const goScreen = document.getElementById('gameover-screen');
    goScreen.classList.remove('hidden');
    goScreen.classList.add('active');
    const title = document.getElementById('go-title');
    if (won) {
        title.textContent = 'LEVEL CLEAR!';
        title.className = 'win';
        const unlocked = parseInt(localStorage.getItem('mss_unlocked') || '1');
        if (level + 2 > unlocked) localStorage.setItem('mss_unlocked', String(level + 2));
    } else {
        title.textContent = 'OVERRUN';
        title.className = 'lose';
    }
    document.getElementById('go-wave').textContent = Math.floor(distance) + 'm';
    document.getElementById('go-score').textContent = score;
}

function spawnZombies() {
    if (distance < nextSpawnZ) return;
    const section = Math.floor(distance / sectionLength);
    const count = Math.floor(2 + levelDef.zombieRate * (1 + section * 0.3));
    const hp = Math.ceil(levelDef.zombieHP * (1 + section * 0.2));
    for (let i = 0; i < count; i++) {
        const type = rng() < 0.15 ? 1 : 0;
        zombies.push({
            x: (rng() - 0.5) * 1.4,
            z: distance + 25 + rng() * 10,
            hp: type === 1 ? Math.ceil(hp * 0.6) : hp,
            maxHp: type === 1 ? Math.ceil(hp * 0.6) : hp,
            type, active: true
        });
    }
    nextSpawnZ = distance + 5 + rng() * 5;
}

function spawnBarrels() {
    if (distance < nextBarrelZ) return;
    const section = Math.floor(distance / sectionLength);
    const hp = Math.ceil(levelDef.barrelHP * (1 + section * 0.15));
    const side = rng() < 0.5 ? -1 : 1;
    barrels.push({ x: side * (0.25 + rng() * 0.25), z: distance + 25 + rng() * 5, hp, maxHp: hp, active: true });
    if (rng() < 0.3 + section * 0.05) {
        barrels.push({ x: -side * (0.25 + rng() * 0.25), z: distance + 25 + rng() * 3, hp, maxHp: hp, active: true });
    }
    nextBarrelZ = distance + 10 + rng() * 8;
}

function spawnGates() {
    if (distance < nextGateZ) return;
    const goodOps = [
        { label:'+3', value:3, type:'add' }, { label:'+5', value:5, type:'add' },
        { label:'+8', value:8, type:'add' }, { label:'x2', value:2, type:'mul' },
        { label:'DMG+1', value:1, type:'dmg' }, { label:'FR+1', value:1, type:'fr' },
    ];
    const badOps = [
        { label:'-2', value:-2, type:'add' }, { label:'-3', value:-3, type:'add' },
        { label:'x0.5', value:0.5, type:'mul' },
    ];
    const left = goodOps[Math.floor(rng() * goodOps.length)];
    let right = rng() < 0.4 ? badOps[Math.floor(rng() * badOps.length)] : goodOps[Math.floor(rng() * goodOps.length)];
    if (right.label === left.label) right = goodOps[(goodOps.indexOf(left) + 1) % goodOps.length];
    const gz = distance + 20 + rng() * 10;
    gates.push({ x: -0.35, z: gz, ...left, active: true });
    gates.push({ x: 0.35, z: gz, ...right, active: true });
    nextGateZ = distance + sectionLength / levelDef.gateFreq + rng() * 5;
}

function spawnBoss() {
    if (bossSpawned || levelDef.bossHP <= 0) return;
    const totalDist = levelDef.sections * sectionLength;
    if (distance > totalDist - 30) {
        bossSpawned = true;
        zombies.push({
            x: 0, z: distance + 30,
            hp: levelDef.bossHP, maxHp: levelDef.bossHP,
            type: 2, active: true
        });
    }
}

function fireBullets() {
    if (fireCooldown > 0) return;
    fireCooldown = 1 / fireRate;
    const count = Math.min(squad, 5);
    const spread = 0.08;
    for (let i = 0; i < count; i++) {
        bullets.push({
            x: playerX + (i - (count-1)/2) * spread,
            z: distance, active: true
        });
    }
}

function update(dt) {
    if (state !== 'playing') return;
    distance += speed * dt;
    fireCooldown = Math.max(0, fireCooldown - dt);
    shakeAmount *= 0.9;
    playerX += (targetX - playerX) * Math.min(1, dt * 10);
    playerX = Math.max(-0.8, Math.min(0.8, playerX));

    const totalDist = levelDef.sections * sectionLength;
    if (distance >= totalDist && !zombies.some(z => z.active && z.type === 2)) {
        endGame(true); return;
    }

    spawnZombies(); spawnBarrels(); spawnGates(); spawnBoss(); fireBullets();

    // Bullets
    for (const b of bullets) {
        if (!b.active) continue;
        b.z += 30 * dt;
        if (b.z > distance + 40) { b.active = false; continue; }
        for (const z of zombies) {
            if (!z.active) continue;
            const hitR = z.type === 2 ? 0.15 : 0.08;
            if (Math.abs(b.x - z.x) < hitR && Math.abs(b.z - z.z) < 1.5) {
                b.active = false;
                z.hp -= damage;
                if (z.hp <= 0) {
                    z.active = false;
                    score += z.type === 2 ? 100 : 10;
                    coins += z.type === 2 ? 5 : 1;
                    shakeAmount = z.type === 2 ? 8 : 2;
                    const sx2 = roadX(z.x, zToT(z.z)), sy2 = roadY(zToT(z.z));
                    for (let p = 0; p < 5; p++) {
                        particles.push({
                            x: sx2, y: sy2, vx: (Math.random()-0.5)*200,
                            vy: -Math.random()*150-50, life: 0.5+Math.random()*0.3,
                            color: z.type === 2 ? '#ff6600' : '#88ff44', size: 3+Math.random()*4
                        });
                    }
                    floatingTexts.push({ x: sx2, y: sy2-20, text: '+'+(z.type===2?100:10), life: 1, color: '#ffd700' });
                }
                break;
            }
        }
        if (!b.active) continue;
        for (const br of barrels) {
            if (!br.active) continue;
            if (Math.abs(b.x - br.x) < 0.1 && Math.abs(b.z - br.z) < 1.5) {
                b.active = false;
                br.hp -= damage;
                if (br.hp <= 0) { br.active = false; score += 25; shakeAmount = 5; }
                break;
            }
        }
    }

    // Zombie collision
    for (const z of zombies) {
        if (!z.active) continue;
        if (z.type === 2) z.x += (playerX - z.x) * dt * 0.5;
        if (z.z < distance - 2) {
            z.active = false;
            squad = Math.max(0, squad - (z.type === 2 ? 3 : 1));
            shakeAmount = 5;
            if (squad <= 0) { endGame(false); return; }
        }
    }

    // Barrel collision
    for (const br of barrels) {
        if (!br.active) continue;
        if (br.z < distance - 1 && br.z > distance - 3 && Math.abs(br.x - playerX) < 0.2) {
            br.active = false; squad = Math.max(0, squad - 2); shakeAmount = 6;
            if (squad <= 0) { endGame(false); return; }
        }
    }

    // Gate collision
    for (const g of gates) {
        if (!g.active) continue;
        if (g.z < distance && g.z > distance - 2 && Math.abs(g.x - playerX) < 0.25) {
            g.active = false;
            switch (g.type) {
                case 'add': squad = Math.max(1, squad + g.value); break;
                case 'mul': squad = Math.max(1, Math.floor(squad * g.value)); break;
                case 'dmg': damage += g.value; break;
                case 'fr': fireRate += g.value; break;
            }
            const isGood = (g.type === 'add' && g.value > 0) || (g.type === 'mul' && g.value > 1) || g.type === 'dmg' || g.type === 'fr';
            floatingTexts.push({ x: roadX(g.x, 0.7), y: roadY(0.7)-30, text: g.label, life: 1.2, color: isGood ? '#51cf66' : '#ff6b6b' });
        }
    }

    // Particles & texts
    for (const p of particles) { p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 400*dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
    for (const ft of floatingTexts) { ft.y -= 40*dt; ft.life -= dt; }
    floatingTexts = floatingTexts.filter(ft => ft.life > 0);

    // Cleanup
    zombies = zombies.filter(z => z.active || z.z > distance - 5);
    barrels = barrels.filter(b => b.active || b.z > distance - 5);
    bullets = bullets.filter(b => b.active);
    gates = gates.filter(g => g.active || g.z > distance - 5);

    // HUD
    document.getElementById('wave-display').textContent = Math.floor(distance) + 'm';
    document.getElementById('weapon-display').textContent = `DMG:${damage} FR:${fireRate.toFixed(1)}`;
    document.getElementById('squad-display').textContent = squad;
    document.getElementById('coin-display').textContent = coins;
    document.getElementById('wave-bar-fill').style.width = (Math.min(1, distance / totalDist) * 100) + '%';
}

function zToT(z) {
    const relZ = z - distance;
    return Math.max(0.05, Math.min(0.95, 0.85 - relZ * 0.023));
}

// ═══════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════

function radGlow(x, y, r, c1, c2, c3) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c1); g.addColorStop(0.5, c2); g.addColorStop(1, c3);
    return g;
}

function drawFire(x, y, radius, intensity) {
    for (let layer = 0; layer < 4; layer++) {
        const lr = radius * (1 - layer * 0.15);
        const ox = (Math.random()-0.5)*radius*0.2;
        const oy = (Math.random()-0.5)*radius*0.2;
        const a = intensity*(1-layer*0.15);
        const c = layer%2 === 0
            ? [`rgba(255,220,120,${a})`,`rgba(240,120,10,${a*0.7})`,`rgba(180,40,0,0)`]
            : [`rgba(255,160,50,${a*0.8})`,`rgba(220,60,0,${a*0.5})`,`rgba(100,10,0,0)`];
        ctx.fillStyle = radGlow(x+ox,y+oy,lr,c[0],c[1],c[2]);
        ctx.beginPath(); ctx.arc(x+ox,y+oy-lr*0.3,lr,0,Math.PI*2); ctx.fill();
    }
}

function drawSpriteAt(sprite, xNorm, t, scale) {
    const x = roadX(xNorm, t), y = roadY(t);
    const s = roadS(t) * scale;
    const dw = sprite.width * s, dh = sprite.height * s;
    ctx.drawImage(sprite, x - dw/2, y - dh + dh*0.08, dw, dh);
}

function render() {
    ctx.clearRect(0, 0, W, H);
    if (state === 'start') return;

    if (shakeAmount > 0.5) {
        ctx.save();
        ctx.translate((Math.random()-0.5)*shakeAmount, (Math.random()-0.5)*shakeAmount);
    }

    // Background
    ctx.fillStyle = '#62625a'; ctx.fillRect(0, 0, W, H);

    // Road
    const rbW = W * roadBottomFrac, rtW = W * roadTopFrac;
    const rg = ctx.createLinearGradient(0, 0, 0, H);
    rg.addColorStop(0, '#9a9888'); rg.addColorStop(0.5, '#aca99a'); rg.addColorStop(1, '#b8b5a5');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(cx-rbW/2, H); ctx.lineTo(cx+rbW/2, H);
    ctx.lineTo(cx+rtW/2, 0); ctx.lineTo(cx-rtW/2, 0);
    ctx.closePath(); ctx.fill();

    // Road texture
    ctx.globalAlpha = 0.04;
    for (let i=0;i<40;i++){
        const t=0.05+i*0.024, y=roadY(t);
        const lw=(roadTopFrac+(roadBottomFrac-roadTopFrac)*t)*W;
        ctx.strokeStyle='#000'; ctx.lineWidth=0.5;
        ctx.beginPath(); ctx.moveTo(cx-lw/2+5,y); ctx.lineTo(cx+lw/2-5,y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Walls
    for (const side of [-1, 1]) {
        for (let i=0;i<30;i++){
            const t1=i*0.033+0.02, t2=t1+0.034; if(t1>0.98)break;
            const rw1=(roadTopFrac+(roadBottomFrac-roadTopFrac)*t1)*W;
            const rw2=(roadTopFrac+(roadBottomFrac-roadTopFrac)*t2)*W;
            const ww1=W*0.14*t1*2.5, ww2=W*0.14*t2*2.5;
            const wH1=H*0.05*t1, wH2=H*0.05*t2;
            const ex1=cx+side*rw1/2, ex2=cx+side*rw2/2;
            const y1=roadY(t1), y2=roadY(t2);
            const sh=0.28+t1*0.12;
            ctx.fillStyle=`rgb(${Math.round(sh*255)},${Math.round(sh*245)},${Math.round(sh*230)})`;
            ctx.beginPath();ctx.moveTo(ex1,y1-wH1);ctx.lineTo(ex2,y2-wH2);
            ctx.lineTo(ex2+side*ww2,y2-wH2);ctx.lineTo(ex1+side*ww1,y1-wH1);ctx.closePath();ctx.fill();
            ctx.fillStyle=`rgb(${Math.round(sh*220)},${Math.round(sh*210)},${Math.round(sh*195)})`;
            ctx.beginPath();ctx.moveTo(ex1,y1);ctx.lineTo(ex2,y2);
            ctx.lineTo(ex2,y2-wH2);ctx.lineTo(ex1,y1-wH1);ctx.closePath();ctx.fill();
            ctx.strokeStyle=`rgba(180,175,160,${0.3+t1*0.3})`;
            ctx.lineWidth=Math.max(1,t1*3);
            ctx.beginPath();ctx.moveTo(ex1,y1-wH1);ctx.lineTo(ex2,y2-wH2);ctx.stroke();
        }
    }

    // Center dashes (animated)
    for (let i=0;i<20;i++){
        const base = 0.15 + i * 0.04;
        const anim = ((distance * 8 + i * 15) % 30) / 30;
        const t = base + anim * 0.04;
        if (t > 0.95) continue;
        ctx.strokeStyle=`rgba(190,185,170,${0.15+t*0.25})`;
        ctx.lineWidth=Math.max(0.5,t*2.5);
        ctx.beginPath();ctx.moveTo(cx,roadY(t));ctx.lineTo(cx,roadY(t+0.015));ctx.stroke();
    }

    // Collect & sort entities far-to-near
    const entities = [];
    for (const z of zombies) { if (!z.active) continue; const t=zToT(z.z); if(t>0.05&&t<0.95) entities.push({t,type:z.type===2?'boss':'zombie',data:z}); }
    for (const b of barrels) { if (!b.active) continue; const t=zToT(b.z); if(t>0.05&&t<0.95) entities.push({t,type:'barrel',data:b}); }
    for (const g of gates)   { if (!g.active) continue; const t=zToT(g.z); if(t>0.05&&t<0.95) entities.push({t,type:'gate',data:g}); }
    entities.sort((a, b) => a.t - b.t);

    for (const e of entities) {
        const { t, type, data } = e;
        const sx = roadX(data.x, t), sy = roadY(t), s = roadS(t);

        if (type === 'boss') {
            const fs = s * W * 0.15;
            drawFire(sx, sy-fs*1.5, fs*0.8, 0.9);
            drawFire(sx-fs*0.3, sy-fs*2, fs*0.6, 0.8);
            drawFire(sx+fs*0.2, sy-fs*1.8, fs*0.7, 0.85);
            drawFire(sx, sy-fs*2.5, fs*0.5, 0.7);
            drawFire(sx, sy-fs*3, fs*0.4, 0.5);
            drawSpriteAt(bossSprite, data.x, t, W/512 * 0.4);
            // HP bar
            const bw2 = s*W*0.35, bh2 = s*W*0.025, by2 = sy - s*W*0.28;
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; rrect(sx-bw2/2,by2,bw2,bh2,bh2/2); ctx.fill();
            ctx.fillStyle = '#ff3333';
            rrect(sx-bw2/2+2,by2+2,(bw2-4)*Math.max(0,data.hp/data.maxHp),bh2-4,(bh2-4)/2); ctx.fill();
            const hfs = Math.round(bh2*0.85);
            ctx.font = `bold ${hfs}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
            ctx.fillText(`${data.hp.toLocaleString()} / ${data.maxHp.toLocaleString()}`, sx, by2+bh2*0.78);
            drawFire(sx-fs*0.4, sy-fs*0.5, fs*0.3, 0.5);
            drawFire(sx+fs*0.4, sy-fs*0.4, fs*0.3, 0.55);
        } else if (type === 'zombie') {
            drawSpriteAt(zombieSprite, data.x, t, W/256 * 0.15);
            if (data.hp < data.maxHp) {
                const bw3=s*W*0.08, bh3=Math.max(2,s*3);
                ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(sx-bw3/2,sy-s*W*0.12,bw3,bh3);
                ctx.fillStyle='#ff3333'; ctx.fillRect(sx-bw3/2,sy-s*W*0.12,bw3*(data.hp/data.maxHp),bh3);
            }
        } else if (type === 'barrel') {
            drawSpriteAt(barrelSprite, data.x, t, W/256 * 0.25);
            const fs2 = Math.round(s*W*0.05);
            ctx.font = `bold ${fs2}px system-ui`; ctx.textAlign = 'center';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
            ctx.strokeText(data.hp.toString(), sx, sy-s*W*0.06);
            ctx.fillStyle = '#ff5533'; ctx.fillText(data.hp.toString(), sx, sy-s*W*0.06);
        } else if (type === 'gate') {
            const gw=s*W*0.22, gh=s*W*0.1;
            const isGood = (data.type==='add'&&data.value>0)||(data.type==='mul'&&data.value>1)||data.type==='dmg'||data.type==='fr';
            ctx.fillStyle = isGood ? 'rgba(0,200,100,0.5)' : 'rgba(200,50,50,0.5)';
            rrect(sx-gw/2,sy-gh,gw,gh,gh*0.2); ctx.fill();
            ctx.strokeStyle = isGood ? '#51cf66' : '#ff6b6b'; ctx.lineWidth = Math.max(2,s*3);
            rrect(sx-gw/2,sy-gh,gw,gh,gh*0.2); ctx.stroke();
            ctx.font = `bold ${Math.round(gh*0.55)}px system-ui`; ctx.textAlign = 'center';
            ctx.fillStyle = '#fff'; ctx.fillText(data.label, sx, sy-gh*0.3);
        }
    }

    // Bullets
    for (const b of bullets) {
        if (!b.active) continue;
        const t=zToT(b.z); if(t<0.05||t>0.95)continue;
        const bx=roadX(b.x,t), by=roadY(t), bs=roadS(t)*3;
        ctx.fillStyle='rgba(255,210,30,0.8)';
        ctx.beginPath(); ctx.arc(bx,by,Math.max(1,bs),0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,150,0,0.15)';
        ctx.beginPath(); ctx.arc(bx,by,bs*2.5,0,Math.PI*2); ctx.fill();
    }

    // Soldiers
    const solCount = Math.min(squad, 8);
    const solSpread = Math.min(0.08, 0.4 / Math.max(solCount, 1));
    for (let i = 0; i < solCount; i++) {
        const offset = (i - (solCount-1)/2) * solSpread;
        drawSpriteAt(soldierSprite, playerX + offset, 0.84 + Math.abs(offset)*0.3, W/256 * 0.17);
    }

    // Particles
    for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life*2);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Floating texts
    for (const ft of floatingTexts) {
        ctx.globalAlpha = Math.min(1, ft.life*2);
        ctx.font = 'bold 24px system-ui'; ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
        ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillStyle = ft.color; ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;

    if (shakeAmount > 0.5) ctx.restore();
}

// ═══════════════════════════════════════
// INPUT
// ═══════════════════════════════════════

let touching = false;
canvas.addEventListener('touchstart', e => { e.preventDefault(); touching = true; handlePointer(e.touches[0].clientX); }, { passive: false });
canvas.addEventListener('touchmove', e => { e.preventDefault(); if(touching) handlePointer(e.touches[0].clientX); }, { passive: false });
canvas.addEventListener('touchend', () => { touching = false; });
canvas.addEventListener('mousemove', e => { if(state==='playing') handlePointer(e.clientX); });
canvas.addEventListener('mousedown', e => { handlePointer(e.clientX); });

function handlePointer(clientX) {
    if (state !== 'playing') return;
    targetX = (clientX - cx) / (W * 0.4);
    targetX = Math.max(-0.8, Math.min(0.8, targetX));
}

// Testing hooks
window._steer = function(x) { targetX = x / 4; };
window._getState = function() { return { playerZ: distance, zombies: zombies.map(z => ({x:z.x*4,z:z.z})) }; };
window._gameDebug = function() { return { state, squad, levelSections: Math.floor(distance/sectionLength) }; };

// ═══════════════════════════════════════
// UI
// ═══════════════════════════════════════

function buildLevelSelect() {
    const grid = document.getElementById('level-select');
    if (!grid) return;
    grid.innerHTML = '';
    const unlocked = parseInt(localStorage.getItem('mss_unlocked') || '1');
    for (let i = 0; i < LEVEL_DEFS.length; i++) {
        const btn = document.createElement('div');
        btn.className = 'level-btn' + (i===level?' selected':'') + (i>=unlocked?' locked':'') + (i<unlocked-1?' cleared':'');
        btn.innerHTML = `<span class="lvl-num">${i+1}</span><span class="lvl-name">${LEVEL_DEFS[i].name}</span>`;
        if (i < unlocked) {
            btn.addEventListener('click', () => {
                level = i;
                grid.querySelectorAll('.level-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        }
        grid.appendChild(btn);
    }
}
buildLevelSelect();

document.getElementById('btn-start').addEventListener('click', () => startLevel(level));
document.getElementById('btn-retry').addEventListener('click', () => {
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.remove('active');
    document.getElementById('start-screen').classList.remove('hidden');
    document.getElementById('start-screen').classList.add('active');
    buildLevelSelect();
});

// ═══════════════════════════════════════
// GAME LOOP
// ═══════════════════════════════════════

let lastTime = 0;
function gameLoop(time) {
    const dt = Math.min(0.05, (time - lastTime) / 1000);
    lastTime = time;
    if (state === 'playing') update(dt);
    render();
    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

})();
