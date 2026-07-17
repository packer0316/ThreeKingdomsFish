import * as THREE from 'three';
import { createWorld } from './scene.js';
import { EnemyManager } from './enemies.js';
import { BulletManager } from './bullets.js';
import { makeGeneralTurret, makeCoin } from './models.js';
import { UI } from './ui.js';
import { AIPlayer } from './players.js';
import { GENERALS, FIELD, START_COINS, AI_PLAYERS } from './config.js';

// 主程式：組裝場景、輸入、遊戲迴圈 -------------------------------

const canvas = document.getElementById('scene');
const { renderer, scene, camera } = createWorld(canvas);

const state = { coins: START_COINS };
const ui = new UI(state);

const enemyMgr = new EnemyManager(scene);
const bulletMgr = new BulletManager(scene);

// ---------- 玩家武將砲台 ----------
let turret = buildTurret(GENERALS[0]);
scene.add(turret);

ui.onGeneralChange = (def) => {
  scene.remove(turret);
  turret = buildTurret(def);
  scene.add(turret);
};

// ---------- 左右兩側 AI 陪玩玩家 ----------
const aiPlayers = AI_PLAYERS.map(
  (def) => new AIPlayer(scene, def, bulletMgr, enemyMgr, ui.el.root)
);

function buildTurret(def) {
  const t = makeGeneralTurret(def);
  t.position.set(0, 0, FIELD.turretZ);
  // 砲口標記，用於取得世界座標
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 1.6, t.userData.muzzleZ);
  t.userData.head.add(muzzle);
  t.userData.muzzle = muzzle;
  t.userData.def = def;
  return t;
}

// ---------- 輸入：瞄準與開火 ----------
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const pointer = new THREE.Vector2();
const target = new THREE.Vector3(0, 1.4, -8); // 目前瞄準點
let firing = false;
let fireCooldown = 0;
const FIRE_INTERVAL = 0.14;

function updatePointer(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, hit)) {
    hit.y = 1.4;
    target.copy(hit);
  }
}

canvas.addEventListener('pointerdown', (e) => {
  updatePointer(e);
  firing = true;
  fireCooldown = 0; // 立即開火
});
canvas.addEventListener('pointermove', (e) => { if (firing) updatePointer(e); });
window.addEventListener('pointerup', () => { firing = false; });

// ---------- 瞄準轉向與開火 ----------
function aimAt(point) {
  const head = turret.userData.head;
  const dx = point.x - turret.position.x;
  const dz = point.z - turret.position.z;
  head.rotation.y = Math.atan2(-dx, -dz);
}

function doFire() {
  const bet = ui.bet;
  if (state.coins < bet) return; // 籌碼不足

  state.coins -= bet;
  ui.refresh();

  const muzzleWorld = new THREE.Vector3();
  turret.userData.muzzle.getWorldPosition(muzzleWorld);

  const dir = new THREE.Vector3().subVectors(target, muzzleWorld).normalize();
  const power = 1 + Math.floor(ui.betIndex / 2); // 下注越高、火力越猛
  const color = turret.userData.def.blade;
  bulletMgr.fire(muzzleWorld, dir, power, color);
}

// ---------- 命中處理 ----------
function onHit(enemy, bullet, hitPos) {
  spawnSpark(hitPos);
  const killed = enemy.hit(bullet.power);
  if (!killed) return;

  enemy.dead = true;
  const owner = bullet.owner;                 // AI 玩家；null = 中座真人
  const bet = owner ? owner.bet : ui.bet;
  const reward = Math.floor(bet * enemy.value);

  if (owner) {
    owner.win(reward);
  } else {
    state.coins += reward;
    ui.refresh();
    // 螢幕座標浮動獎勵（僅中座玩家）
    const s = worldToScreen(enemy.mesh.position.clone().setY(2));
    ui.floatCoin(s.x, s.y, reward);
  }
  burstCoins(enemy.mesh.position.clone());

  if (enemy.isBoss) {
    ui.jackpot(enemy.name, reward, owner ? owner.def.name : '你（中座）');
  }
  enemyMgr.removeEnemy(enemy);
}

// ---------- 特效 ----------
const sparks = [];
function spawnSpark(pos) {
  const geo = new THREE.SphereGeometry(0.18, 6, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe27a });
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    const v = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6);
    scene.add(m);
    sparks.push({ mesh: m, v, life: 0.4 });
  }
}

const coins = [];
function burstCoins(pos) {
  for (let i = 0; i < 8; i++) {
    const m = makeCoin();
    m.position.copy(pos).setY(1.4);
    const v = new THREE.Vector3((Math.random() - 0.5) * 5, 4 + Math.random() * 3, (Math.random() - 0.5) * 5);
    scene.add(m);
    coins.push({ mesh: m, v, life: 0.9 });
  }
}

function updateEffects(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.mesh.position.addScaledVector(s.v, dt);
    s.v.y -= 14 * dt;
    s.life -= dt;
    if (s.life <= 0) { scene.remove(s.mesh); sparks.splice(i, 1); }
  }
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.mesh.position.addScaledVector(c.v, dt);
    c.v.y -= 16 * dt;
    c.mesh.rotation.z += dt * 12;
    c.life -= dt;
    if (c.life <= 0) { scene.remove(c.mesh); c.mesh.geometry.dispose(); coins.splice(i, 1); }
  }
}

function worldToScreen(v) {
  const p = v.clone().project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * window.innerWidth,
    y: (-p.y * 0.5 + 0.5) * window.innerHeight,
  };
}

// ---------- 遊戲迴圈 ----------
const clock = new THREE.Clock();
let running = false;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!running) { renderer.render(scene, camera); return; }

  // 自動瞄準最近敵人
  if (ui.auto) {
    const n = enemyMgr.nearest(turret.position);
    if (n) target.copy(n.mesh.position).setY(1.4);
  }
  aimAt(target);

  // 開火節奏
  fireCooldown -= dt;
  const wantFire = firing || ui.auto;
  if (wantFire && fireCooldown <= 0) {
    fireCooldown = FIRE_INTERVAL;
    doFire();
  }

  // 左右 AI 玩家自動瞄準開火
  for (const p of aiPlayers) p.update(dt);

  enemyMgr.update(dt, (boss) => {
    ui.pushMarquee(`⚔ 敵將「${boss.name}」現身戰場！擊倒可得大獎！`);
  });
  bulletMgr.update(dt, enemyMgr.enemies, onHit);
  updateEffects(dt);

  renderer.render(scene, camera);
}
loop();

// ---------- 開始 ----------
document.getElementById('start-btn').addEventListener('click', () => {
  document.getElementById('intro').classList.add('hidden');
  running = true;
  clock.getDelta();
});

// ---------- 視窗縮放 ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
