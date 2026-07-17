import * as THREE from 'three';
import { createWorld, updateSceneFx } from './scene.js';
import { EnemyManager } from './enemies.js';
import { BulletManager } from './bullets.js';
import { makeCoin } from './models.js';
import { UI } from './ui.js';
import { AIPlayer, MeleeGeneral } from './players.js';
import { GENERALS, FIELD, START_COINS, AI_PLAYERS } from './config.js';

// 主程式：組裝場景、輸入、遊戲迴圈 -------------------------------

// 偵測是否真的用 GPU 硬體加速；若瀏覽器退回軟體渲染會非常慢，跳出提示。
function reportGPU(renderer) {
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const name = (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
  const software = /swiftshader|software|llvmpipe|basic render|microsoft basic/i.test(name);
  console.log(`[GPU] 繪圖裝置：${name || '未知'}｜硬體加速：${software ? '❌ 軟體渲染（很慢）' : '✅ 已啟用'}`);
  if (!software) return;

  const bar = document.createElement('div');
  bar.style.cssText =
    'position:absolute;left:0;right:0;top:34px;z-index:60;padding:10px 16px;' +
    'background:linear-gradient(90deg,#7a1010,#b83010);color:#ffe9b0;font-weight:700;' +
    'font-size:14px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.6);cursor:pointer;';
  bar.innerHTML =
    `⚠ 目前為「軟體渲染」（未使用 GPU），這是遊戲很慢的主因。` +
    `請到瀏覽器設定開啟「使用硬體加速」後重開分頁。（點此關閉）`;
  bar.addEventListener('click', () => bar.remove());
  document.getElementById('game-root').appendChild(bar);
}

const canvas = document.getElementById('scene');
const { renderer, scene, camera } = createWorld(canvas);
reportGPU(renderer);

const state = { coins: START_COINS };
const ui = new UI(state);

const enemyMgr = new EnemyManager(scene);
const bulletMgr = new BulletManager(scene);

// ---------- 中座玩家：近戰武將 ----------
const hero = new MeleeGeneral(scene, GENERALS[0], enemyMgr, attemptSlash);
ui.onGeneralChange = (def) => hero.setGeneral(def);

// ---------- 左右兩側 AI 陪玩玩家（遠程砲台）----------
const aiPlayers = AI_PLAYERS.map(
  (def) => new AIPlayer(scene, def, bulletMgr, enemyMgr, ui.el.root)
);

// ---------- 輸入：指定攻擊目標點 ----------
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const pointer = new THREE.Vector2();
const target = new THREE.Vector3(0, 1.4, -8); // 目前指定的攻擊點
let firing = false;

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
  firing = true; // 按住 = 命令武將前往最接近該點的敵人砍殺
});
canvas.addEventListener('pointermove', (e) => { if (firing) updatePointer(e); });
window.addEventListener('pointerup', () => { firing = false; });

// ---------- 近戰揮刀：由 MeleeGeneral 呼叫 ----------
// 回傳 true = 成功攻擊（籌碼足夠）；false = 籌碼不足
function attemptSlash(enemy) {
  const bet = ui.bet;
  if (state.coins < bet) return false;

  state.coins -= bet;
  ui.refresh();

  spawnSpark(enemy.mesh.position.clone().setY(1.6));
  const power = 1 + Math.floor(ui.betIndex / 2); // 下注越高、刀傷越高
  const killed = enemy.hit(power);
  if (killed) {
    enemy.dead = true;
    const reward = Math.floor(bet * enemy.value);
    state.coins += reward;
    ui.refresh();

    const s = worldToScreen(enemy.mesh.position.clone().setY(2));
    ui.floatCoin(s.x, s.y, reward);
    burstCoins(enemy.mesh.position.clone());
    if (enemy.isBoss) ui.jackpot(enemy.name, reward, '你（中座）');
    enemyMgr.removeEnemy(enemy);
  }
  return true;
}

// ---------- 命中處理（左右 AI 遠程砲彈）----------
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
// 火花共用單一幾何體與材質，避免每次命中都配置新資源
const SPARK_GEO = new THREE.SphereGeometry(0.18, 6, 6);
const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xffe27a });
const sparks = [];
function spawnSpark(pos) {
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT);
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
    if (c.life <= 0) { scene.remove(c.mesh); coins.splice(i, 1); }
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
let elapsed = 0;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  updateSceneFx(dt, elapsed); // 烽火盆火光閃動
  if (!running) { renderer.render(scene, camera); return; }

  // 中座近戰武將：按住畫面或開啟自動時，前往砍殺敵人
  hero.update(dt, { attack: firing, auto: ui.auto, point: target });

  // 左右 AI 玩家自動瞄準開火（遠程）
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
