import * as THREE from 'three';
import { createWorld, updateSceneFx, buildEnvironment } from './scene.js';
import { EnemyManager } from './enemies.js';
import { BulletManager } from './bullets.js';
import { makeCoin } from './models.js';
import { UI, RoomSelect, BossPlate } from './ui.js';
import { Recruit } from './recruit.js';
import { SummonManager } from './summons.js';
import { BossShow, hasBossShow } from './bossshow.js';
import { AIPlayer, MeleeGeneral, PlayerArcher } from './players.js';
import { CHARACTERS } from './characters.js';
import { GENERALS, FIELD, START_COINS, AI_PLAYERS, SEAT_X, ROOMS, sceneById } from './config.js';

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
// 起始場景 = 初始房間（休閒41房）輪替到的戰場
let currentScene = sceneById(ROOMS[0].sceneId);
const { renderer, scene, camera } = createWorld(canvas, currentScene.env);
reportGPU(renderer);

const state = { coins: START_COINS };
const ui = new UI(state);

const enemyMgr = new EnemyManager(scene, currentScene);
const bulletMgr = new BulletManager(scene);

// ---------- 場景故事性：鎮守 Boss 名牌 / 台詞、場景標示 ----------
const bossPlate = new BossPlate(ui.el.root, currentScene.boss);
// Boss 開獎表演（玩家擊殺鎮守 Boss 觸發；表演期間全場暫停攻擊）
const bossShow = new BossShow(ui.el.root);
document.getElementById('scene-badge').textContent = '⚔ ' + currentScene.name;

// 換房一律「完全重建」戰場：即使輪到同一場景，環境、Boss、小兵、
// 生成計時與腳本狀態全部重新來過（等同重開這一關）。
function rebuildBattlefield(room) {
  const next = sceneById(room.sceneId);
  const sceneChanged = next.id !== currentScene.id;
  currentScene = next;

  hero.clearSelection();                 // 放掉鎖定目標
  buildEnvironment(scene, next.env);     // 拆掉舊環境、重建環境
  enemyMgr.setScene(next);               // 清場並重置生成/Boss/官銜/台詞計時
  bossPlate.setBoss(next.boss);
  document.getElementById('scene-badge').textContent = '⚔ ' + next.name;
  if (sceneChanged) {
    ui.pushMarquee(`⚔ 戰場輪替：進入「${next.name}」！${next.subtitle || ''}`);
    showSceneBanner();
  }
}

// 換房黑幕讀條轉場（約 1 秒）：黑畫面蓋住 → 讀條跑滿 → 期間完成重建 → 淡出。
let transitioning = false;
function runRoomTransition(rebuild) {
  const overlay = document.getElementById('room-transition');
  const bar = document.getElementById('room-transition-bar');
  transitioning = true;

  overlay.classList.remove('hidden');
  bar.style.transition = 'none';
  bar.style.width = '0%';
  void overlay.offsetWidth;              // 強制重排，讓下面的動畫從 0 起跑
  overlay.classList.add('show');         // 淡入黑幕
  bar.style.transition = 'width 0.9s linear';
  bar.style.width = '100%';

  // 螢幕全黑時才重建，讓切換不被看到
  setTimeout(rebuild, 450);

  // 約 1 秒後淡出、結束轉場
  setTimeout(() => {
    overlay.classList.remove('show');
    setTimeout(() => { overlay.classList.add('hidden'); transitioning = false; }, 320);
  }, 1000);
}
const BOSS_LABEL_HEIGHT = 8.1;   // Boss 頭頂名牌的世界高度（紅纓頂之上）

// ---------- 中座玩家：近戰武將（呂布/關羽）+ 弓將（黃忠，原地射擊）----------
const hero = new MeleeGeneral(scene, GENERALS[0], enemyMgr, attemptSlash);
ui.onGeneralChange = (def) => hero.setGeneral(def);

// 黃忠：站原地自動射擊；放箭前先以 attemptShot 扣玩家下注，命中由 onHit 給玩家
const playerArcher = new PlayerArcher(scene, bulletMgr, enemyMgr, CHARACTERS.huangzhong, attemptShot);
let activeCharType = 'melee';   // 'melee' = 呂布/關羽衝殺；'archer' = 黃忠原地射擊

// 弓將出手：籌碼足夠則扣一次下注並回傳 true（放箭），不足則不放箭
function attemptShot() {
  const bet = ui.bet;
  if (state.coins < bet) return false;
  state.coins -= bet;
  ui.refresh();
  return true;
}

// ---------- 右中：切換操控角色（呂布 / 關羽 / 黃忠）----------
const charBtns = document.querySelectorAll('#char-switch .char-btn');
function setActiveCharacter(def) {
  const seatX = SEAT_X[roomSelect.currentSeat];
  if (def.type === 'archer') {
    activeCharType = 'archer';
    hero.setActive(false);
    playerArcher.setVisible(true);
    playerArcher.moveToSeat(seatX);
  } else {
    activeCharType = 'melee';
    playerArcher.setVisible(false);
    hero.setActive(true);
    hero.setCharacter(def);
    hero.moveToSeat(seatX);
  }
}
charBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const def = CHARACTERS[btn.dataset.char];
    if (!def) return;
    setActiveCharacter(def);
    charBtns.forEach((b) => b.classList.toggle('active', b === btn));
  });
});

// ---------- 招募援軍：出現在座位兩側自動作戰（腳底紫圈）----------
// 招募時間（小時）× 每小時秒數 = 援軍在場作戰的真實秒數。
const SUMMON_SEC_PER_HOUR = 5;   // 6h → 30s，24h → 120s
const summons = new SummonManager(scene, enemyMgr, {
  dealDamage: summonDealDamage,
  getPlayerX: () => SEAT_X[roomSelect.currentSeat],
  turretZ: FIELD.turretZ,
});

// 援軍命中傷害：沿用擊殺獎勵（以玩家目前下注計獎），入袋並演出金幣/浮字
function summonDealDamage(enemy, power, hitPos) {
  if (!enemy || enemy.dead || enemy.removed) return false;
  spawnSpark(hitPos);
  const killed = enemy.hit(power);
  if (!killed) return false;
  enemy.dead = true;
  const reward = Math.floor(ui.bet * enemy.value);
  state.coins += reward;
  ui.refresh();
  const s = worldToScreen(enemy.mesh.position.clone().setY(2));
  ui.floatCoin(s.x, s.y, reward);
  burstCoins(enemy.mesh.position.clone());
  if (enemy.isBoss) handleBossDeath(enemy, reward, '招募援軍', false);
  enemyMgr.removeEnemy(enemy);
  return true;
}

// ---------- 左中：招募系統（花費籌碼 + 時間，老虎機抽武將）----------
const recruit = new Recruit(state);
recruit.onSpend = () => ui.refresh();               // 扣款後同步底部 HUD 金錢
recruit.isSummonActive = () => summons.active;      // 援軍在場時顯示「重新招募」
recruit.onResult = (list, hours) => {
  ui.refresh();
  const names = list.map((c) => `「${c.name}」(${c.rarity})`).join('、');
  ui.pushMarquee(`🎯 恭喜你招募到 ${names}！援軍出戰 ${hours} 小時！`);
  // 兩名援軍列陣玩家座位兩側，自動作戰指定時長
  summons.summonPair(list, (hours || 1) * SUMMON_SEC_PER_HOUR);
};

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
  hero.moveToSeat(SEAT_X[humanSeat]);         // 玩家近戰武將移到所選座位
  playerArcher.moveToSeat(SEAT_X[humanSeat]); // 弓將黃忠同步座位

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
roomSelect.onEnter = (room, seatPos) => {
  // 黑幕讀條轉場中完成「座位套用 + 戰場完全重建」
  runRoomTransition(() => {
    applyRoomSeat(room, seatPos);
    rebuildBattlefield(room);
  });
};

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
  const controller = activeCharType === 'archer' ? playerArcher : hero;
  if (enemy) controller.select(enemy);   // 點到敵人 = 鎖定（近戰衝刺砍殺 / 弓將優先射擊）
  else controller.clearSelection();       // 點空地 = 取消鎖定
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
    if (enemy.isBoss) handleBossDeath(enemy, reward, '你（中座）', true);
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

  // 鎮守 Boss 陣亡：byPlayer = 最後一擊是否為中座玩家（owner 為 null 時是玩家）
  if (enemy.isBoss) handleBossDeath(enemy, reward, owner ? owner.def.name : '你（中座）', !owner);
  enemyMgr.removeEnemy(enemy);
}

// Boss 陣亡統一處理：只有「本人」擊殺且該 Boss 有開獎表演時才進表演；
// 其他玩家（AI）擊殺或無表演的 Boss，維持一般大獎彈窗。
function handleBossDeath(enemy, reward, catcher, byPlayer) {
  bossPlate.died();   // 死亡台詞停留在倒下位置
  if (byPlayer && hasBossShow(enemy.def.id)) {
    // 進入開獎表演：以玩家目前下注滾分，結束後才把獎金入袋、恢復戰鬥
    const bossName = enemy.name;
    bossShow.play(enemy.def.id, ui.bet, (prize, mult) => {
      state.coins += prize;
      ui.refresh();
      ui.pushMarquee(`🎉 恭喜你（中座）於「${bossName}」開獎表演開出 ×${mult} 倍，獲得 ${prize.toLocaleString('en-US')} 籌碼！`);
    });
  } else {
    ui.jackpot(enemy.name, reward, catcher);
  }
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
    const RIGHT_RESERVE = 16;    // 右下角已無按鈕，僅留小邊距
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

  // Boss 開獎表演 / 換房轉場中：全場暫停（玩家 / AI / 敵軍 / 砲彈皆停），只維持渲染
  if (bossShow.active || transitioning) { renderer.render(scene, camera); return; }

  // 中座玩家：黃忠 = 原地弓將自動射擊；否則近戰武將衝殺（點選優先，自動追最近）
  if (activeCharType === 'archer') {
    playerArcher.betIndex = ui.betIndex;   // 同步玩家下注（決定 power 與扣款）
    playerArcher.update(dt);
  } else {
    hero.update(dt, { auto: ui.auto });
  }

  // 左右 AI 玩家自動瞄準開火（遠程）
  for (const p of aiPlayers) p.update(dt);

  // 招募援軍自動作戰（近戰衝殺 / 遠程施法）
  summons.update(dt);

  enemyMgr.update(dt, (boss) => {
    ui.pushMarquee(`⚔ ${currentScene.name}守將「${boss.name}」出關搦戰！斬其首級可奪大獎！`);
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
  document.getElementById('scene-banner-name').textContent = currentScene.name;
  document.getElementById('scene-banner-story').textContent = currentScene.story;
  const sub = document.querySelector('#scene-banner .scene-banner-sub');
  if (sub) sub.textContent = `— ${currentScene.subtitle || '三國戰場'} —`;
  banner.classList.remove('hidden');
  void banner.offsetWidth;   // 重觸發動畫
  banner.classList.add('show');
  setTimeout(() => {
    banner.classList.remove('show');
    setTimeout(() => banner.classList.add('hidden'), 700);
  }, 4600);
}

// 供主控台除錯 / 自動化測試使用
window.__game = {
  hero, playerArcher, enemyMgr, ui, camera, bossPlate, bossShow, scene, roomSelect, recruit,
  rebuildBattlefield, runRoomTransition,
  get currentScene() { return currentScene; },
  get activeCharType() { return activeCharType; },
};

// ---------- 視窗縮放 ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
