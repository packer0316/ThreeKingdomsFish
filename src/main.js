import * as THREE from 'three';
import { createWorld, updateSceneFx } from './scene.js';
import { EnemyManager } from './enemies.js';
import { BulletManager } from './bullets.js';
import { makeCoin } from './models.js';
import { UI, RoomSelect, BossPlate } from './ui.js';
import { AIPlayer, MeleeGeneral } from './players.js';
import { GENERALS, FIELD, START_COINS, AI_PLAYERS, SEAT_X, CURRENT_SCENE, ROOMS } from './config.js';

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

const enemyMgr = new EnemyManager(scene, CURRENT_SCENE);
const bulletMgr = new BulletManager(scene);

// ---------- 場景故事性：鎮守 Boss 名牌 / 台詞、場景標示 ----------
const bossPlate = new BossPlate(ui.el.root, CURRENT_SCENE.boss);
document.getElementById('scene-badge').textContent = '⚔ ' + CURRENT_SCENE.name;
const BOSS_LABEL_HEIGHT = 7.4;   // Boss 頭頂名牌的世界高度

// ---------- 中座玩家：近戰武將 ----------
const hero = new MeleeGeneral(scene, GENERALS[0], enemyMgr, attemptSlash);
ui.onGeneralChange = (def) => hero.setGeneral(def);

// ---------- 左右兩側 AI 陪玩玩家（遠程砲台）----------
const aiPlayers = AI_PLAYERS.map(
  (def) => new AIPlayer(scene, def, bulletMgr, enemyMgr, ui.el.root)
);

// ---------- 底部三人列 + 選房 / 換座位（金錢真實計算、跨房持續）----------
const roomBadgeName = document.getElementById('room-badge-name');
const SEATS = ['left', 'mid', 'right'];

// AI 金錢變動（放箭扣注 / 擊殺獲獎）即時反映到對應座位欄
aiPlayers.forEach((p) => {
  p.onMoney = (flash) => ui.updateMoney(p.seat, p.coins, flash);
});

// 依「玩家座位 + 房間資料」重新擺放三個座位並渲染底部三人列
function applyRoomSeat(room, humanSeat) {
  roomBadgeName.textContent = room.name;
  hero.moveToSeat(SEAT_X[humanSeat]);   // 玩家（近戰呂布）移到所選座位

  // 玩家以外的兩個座位指派給兩位 AI（各帶該房 NPC 的名字/武將/籌碼/下注）
  const others = SEATS.filter((s) => s !== humanSeat);
  aiPlayers.forEach((p, i) => {
    const pos = others[i];
    p.seat = pos;
    p.moveToSeat(SEAT_X[pos]);
    const data = room.seats.find((s) => s.pos === pos);
    if (data) p.applySeatData(data);
  });

  renderHud(humanSeat);
}

// 三座位佔用資料 → 底部三人列；玩家座位顯示你的持續金錢與加減 bet 控制
function renderHud(humanSeat) {
  const occ = {};
  for (const s of SEATS) {
    if (s === humanSeat) {
      occ[s] = { isYou: true, name: '你', bet: ui.bet, coins: state.coins };
    } else {
      const p = aiPlayers.find((a) => a.seat === s);
      occ[s] = p ? { isYou: false, name: p.def.name, bet: p.bet, coins: p.coins } : null;
    }
  }
  ui.renderSlots(occ);
}

const roomSelect = new RoomSelect();
roomSelect.onEnter = (room, seatPos) => applyRoomSeat(room, seatPos);

// 初始：休閒41房、玩家坐中座；你的金錢由 state 持續累計，換房不重置
applyRoomSeat(ROOMS[0], roomSelect.currentSeat);

// ---------- 輸入：點擊敵人 = 鎖定攻擊目標（不需長按）----------
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const pointer = new THREE.Vector2();

function setRayFromEvent(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

// 優先取射線直接命中的敵人模型；沒中則取地面點附近的敵人（容忍誤差，方便點中移動中的小兵）
function pickEnemy() {
  const meshes = enemyMgr.enemies.map((en) => en.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.enemy) o = o.parent;
    if (o) return o.userData.enemy;
  }
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, hit)) {
    let best = null, bestD = Infinity;
    for (const en of enemyMgr.enemies) {
      const d = Math.hypot(en.mesh.position.x - hit.x, en.mesh.position.z - hit.z);
      if (d < bestD) { bestD = d; best = en; }
    }
    if (best && bestD <= best.radius + 1.5) return best;
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  setRayFromEvent(e);
  const enemy = pickEnemy();
  if (enemy) hero.select(enemy);   // 點到敵人 = 鎖定並衝刺攻擊，打死後返回原位
  else hero.clearSelection();      // 點空地 = 取消鎖定
});

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
    if (enemy.isBoss) {
      bossPlate.died();   // 死亡台詞停留在倒下位置
      ui.jackpot(enemy.name, reward, '你（中座）');
    }
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
    bossPlate.died();
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

// 把三個座位欄水平對齊到各自武將的螢幕位置（而非集中在中央）
const _seatPoint = new THREE.Vector3();
function positionSlots() {
  for (const seat of SEATS) {
    const el = ui.el.slots[seat];
    if (!el || el.classList.contains('empty')) continue;
    _seatPoint.set(SEAT_X[seat], 0, FIELD.turretZ);
    const s = worldToScreen(_seatPoint);
    const half = el.offsetWidth / 2 || 125;
    const RIGHT_RESERVE = 150;   // 右側保留給 自動 / 武將 按鈕，避免重疊
    const minX = half + 8;
    const maxX = window.innerWidth - half - 8 - RIGHT_RESERVE;
    const x = Math.max(minX, Math.min(maxX, s.x));
    el.style.left = x + 'px';
  }
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
  positionSlots();            // 三人資訊欄對齊各座位武將
  if (!running) { renderer.render(scene, camera); return; }

  // 中座近戰武將：點選的敵人優先；開啟自動時沒點選就追擊最近的敵人
  hero.update(dt, { auto: ui.auto });

  // 左右 AI 玩家自動瞄準開火（遠程）
  for (const p of aiPlayers) p.update(dt);

  enemyMgr.update(dt, (boss) => {
    ui.pushMarquee(`⚔ ${CURRENT_SCENE.name}守將「${boss.name}」出關搦戰！斬其首級可奪大獎！`);
  });
  bulletMgr.update(dt, enemyMgr.enemies, onHit);
  updateEffects(dt);

  // 鎮守 Boss 頭上名牌 / 台詞泡泡（跟隨螢幕座標）
  const boss = enemyMgr.boss;
  bossPlate.update(
    dt,
    boss,
    boss ? worldToScreen(boss.mesh.position.clone().setY(BOSS_LABEL_HEIGHT)) : null
  );

  renderer.render(scene, camera);
}
loop();

// ---------- 開始 ----------
document.getElementById('start-btn').addEventListener('click', () => {
  document.getElementById('intro').classList.add('hidden');
  running = true;
  clock.getDelta();
  showSceneBanner();
});

// 場景開幕橫幅：入場時亮出關卡名與故事引言，數秒後淡出
function showSceneBanner() {
  const banner = document.getElementById('scene-banner');
  document.getElementById('scene-banner-name').textContent = CURRENT_SCENE.name;
  document.getElementById('scene-banner-story').textContent = CURRENT_SCENE.story;
  banner.classList.remove('hidden');
  void banner.offsetWidth;   // 重觸發動畫
  banner.classList.add('show');
  setTimeout(() => {
    banner.classList.remove('show');
    setTimeout(() => banner.classList.add('hidden'), 700);
  }, 4600);
}

// 供主控台除錯 / 自動化測試使用
window.__game = { hero, enemyMgr, ui, camera, bossPlate };

// ---------- 視窗縮放 ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
