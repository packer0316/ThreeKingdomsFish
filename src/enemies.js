import * as THREE from 'three';
import { ENEMY_TYPES, FIELD, KILL_CHANCE, BOSS_KILL_FACTOR } from './config.js';
import { makeSoldier, makeBoss, makeTitleLabel } from './models.js';

// 敵人物件與生成管理 --------------------------------------------

let idCounter = 1;

// 把縱向座標限制在戰場活動區內
function clampZ(z) {
  return Math.max(FIELD.minZ, Math.min(FIELD.maxZ, z));
}

export class Enemy {
  // opts: { dir, baseZ, index } 供成群生成時排列
  constructor(def, isBoss = false, opts = {}) {
    this.def = def;
    this.isBoss = isBoss;
    this.id = idCounter++;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.value = def.value;
    this.name = def.name || def.label;
    this.dead = false;
    this.removed = false;   // 已離場（走出邊界或被擊殺移除）
    this.title = null;      // 官銜（菁英小兵，由 EnemyManager 指派）

    this.mesh = isBoss ? makeBoss(def) : makeSoldier(def);
    this.mesh.userData.enemy = this;   // 供點擊射線反查敵人物件
    // 小兵數量多，關閉投影以省下每幀陰影 pass 的大量幾何體
    if (!isBoss) this.mesh.traverse((o) => { if (o.isMesh) o.castShadow = false; });

    // 從左或右邊界進場，橫向行軍
    this.dir = opts.dir != null ? opts.dir : (Math.random() < 0.5 ? 1 : -1);
    const lane = opts.baseZ != null
      ? opts.baseZ
      : FIELD.minZ + Math.random() * (FIELD.maxZ - FIELD.minZ);
    const idx = opts.index || 0;
    // 同一群的成員在後方拉開距離、縱向也稍微錯開，形成鬆散隊形
    const startX = (this.dir === 1 ? FIELD.minX - 2 : FIELD.maxX + 2)
      - this.dir * idx * (1.8 + Math.random() * 1.4);
    const z = clampZ(lane + (Math.random() - 0.5) * 3.2);
    this.mesh.position.set(startX, 0, z);
    this.mesh.rotation.y = this.dir === 1 ? Math.PI / 2 : -Math.PI / 2;

    this.speed = def.speed * (0.8 + Math.random() * 0.4);
    this.walkPhase = Math.random() * Math.PI * 2;

    // 每次命中的擊殺機率（魚機捕獲率）
    this.killChance = isBoss ? KILL_CHANCE * BOSS_KILL_FACTOR : KILL_CHANCE;

    // 不規則移動參數：縱向蛇行 + 速度忽快忽慢
    this.baseZ = z;
    this.wanderPhase = Math.random() * Math.PI * 2;
    this.wanderSpeed = 0.35 + Math.random() * 0.5;
    this.wanderAmp = 0.8 + Math.random() * 1.6;
    this.speedWobble = Math.random() * Math.PI * 2;

    // 碰撞半徑（世界座標，供命中判定）
    this.radius = (isBoss ? 2.2 : 1.1) * (def.scale || 1);
  }

  update(dt) {
    // 速度忽快忽慢 → 走得不規則
    this.speedWobble += dt;
    const spd = this.speed * (0.7 + 0.4 * Math.sin(this.speedWobble * 1.4));
    this.mesh.position.x += this.dir * spd * dt * 1.8;

    // 縱向蛇行漂移
    this.wanderPhase += dt * this.wanderSpeed;
    this.mesh.position.z = clampZ(this.baseZ + Math.sin(this.wanderPhase) * this.wanderAmp);

    this.walkPhase += dt * (0.6 + Math.abs(spd)) * 5;

    // 走路擺動
    const parts = this.mesh.userData.parts;
    if (parts) {
      const s = Math.sin(this.walkPhase) * 0.5;
      parts.legL.rotation.x = s;
      parts.legR.rotation.x = -s;
      parts.armR.rotation.x = -0.5 - s * 0.4;
    }
    // 輕微上下浮動
    this.mesh.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.06;

    // 走出畫面 → 回收
    if (this.dir === 1 && this.mesh.position.x > FIELD.maxX + 3) return false;
    if (this.dir === -1 && this.mesh.position.x < FIELD.minX - 3) return false;
    return true;
  }

  // 每次命中以機率決定是否擊殺（非扣血），下注倍率越高機率略增
  hit(power = 1) {
    this.hp -= power; // 仍記錄，僅供參考
    this.flash();     // 受擊閃紅
    const chance = this.killChance * (1 + (power - 1) * 0.15);
    return Math.random() < chance;
  }

  flash() {
    // 首次命中時蒐集一次材質清單，之後重複使用；只用一個計時器復原
    if (!this._flashMats) {
      this._flashMats = [];
      this.mesh.traverse((o) => {
        if (o.isMesh && o.material && o.material.emissive) this._flashMats.push(o.material);
      });
    }
    for (const m of this._flashMats) m.emissive.setHex(0x882020);
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => {
      for (const m of this._flashMats) m.emissive.setHex(0x000000);
    }, 90);
  }

  worldPos() {
    return this.mesh.position;
  }
}

// 鎮守 Boss：從邊界進場後改為在戰場內徘徊搦戰，永不離場，
// 只會被斬殺；移動採「走向隨機定點 → 停步耀武 → 再走」的巡場節奏。
export class BossEnemy extends Enemy {
  constructor(def) {
    super(def, true, {});
    this.waypoint = new THREE.Vector3();
    this.pauseT = 0;                       // 停步耀武倒數
    this.targetYaw = this.mesh.rotation.y;
    this.pickWaypoint();
  }

  // 徘徊定點：避開貼邊，集中在關前中央區域
  pickWaypoint() {
    this.waypoint.set(
      (Math.random() * 2 - 1) * (FIELD.maxX - 7),
      0,
      FIELD.minZ + 3 + Math.random() * (FIELD.maxZ - FIELD.minZ - 5)
    );
  }

  update(dt) {
    const p = this.mesh.position;

    if (this.pauseT > 0) {
      // 停步耀武：重心緩慢搖晃
      this.pauseT -= dt;
      this.walkPhase += dt * 2;
    } else {
      const dx = this.waypoint.x - p.x;
      const dz = this.waypoint.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.6) {
        this.pauseT = 1.2 + Math.random() * 1.8;
        this.pickWaypoint();
      } else {
        const spd = this.speed * 1.8;
        p.x += (dx / dist) * spd * dt;
        p.z += (dz / dist) * spd * dt;
        this.targetYaw = Math.atan2(dx, dz);
        this.walkPhase += dt * (0.6 + spd) * 3;
      }
    }

    // 平滑轉向面對行進方向
    let dYaw = this.targetYaw - this.mesh.rotation.y;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    this.mesh.rotation.y += dYaw * Math.min(1, dt * 6);

    // 走路擺動（停步時幅度縮小）
    const parts = this.mesh.userData.parts;
    if (parts) {
      const s = Math.sin(this.walkPhase) * (this.pauseT > 0 ? 0.12 : 0.5);
      parts.legL.rotation.x = s;
      parts.legR.rotation.x = -s;
      parts.armR.rotation.x = -0.5 - s * 0.4;
    }
    p.y = Math.abs(Math.sin(this.walkPhase)) * 0.05;

    return true;   // 鎮守關前，永不離場
  }
}

export class EnemyManager {
  // sceneDef: 場景設定（見 config.js SCENES），決定鎮守 Boss 與其登場節奏
  constructor(scene, sceneDef) {
    this.scene = scene;
    this.sceneDef = sceneDef;
    this.enemies = [];
    this.spawnTimer = 1;
    this.spawnInterval = 2.6;
    this.maxEnemies = 16;
    this.boss = null;                                    // 場上唯一的鎮守 Boss
    this.bossTimer = sceneDef ? sceneDef.boss.firstSpawn : 14;

    // 官銜菁英小兵：可用官銜池（場上每個官銜至多一人）
    this.eliteTitles = sceneDef?.eliteTitles ? [...sceneDef.eliteTitles] : [];
    this.eliteChance = sceneDef?.eliteChance ?? 0.22;
    this.eliteCooldowns = [];   // { title, t }：持有者陣亡後，官銜冷卻中
  }

  // 新生小兵有機率取得一個尚未使用的官銜（頭上掛稱號牌）
  maybeAssignTitle(e) {
    if (this.eliteTitles.length === 0) return;
    if (Math.random() >= this.eliteChance) return;
    const i = (Math.random() * this.eliteTitles.length) | 0;
    const title = this.eliteTitles.splice(i, 1)[0];
    e.title = title;
    e.mesh.add(makeTitleLabel(title));
  }

  spawn(def, isBoss = false, opts = {}) {
    const e = new Enemy(def, isBoss, opts);
    if (!isBoss) this.maybeAssignTitle(e);
    this.scene.add(e.mesh);
    this.enemies.push(e);
    return e;
  }

  // 一次放出 3~5 隻同型小兵，成群同向前進
  spawnGroup() {
    const size = 3 + ((Math.random() * 3) | 0); // 3~5
    const dir = Math.random() < 0.5 ? 1 : -1;
    const baseZ = FIELD.minZ + Math.random() * (FIELD.maxZ - FIELD.minZ);
    const def = ENEMY_TYPES[(Math.random() * ENEMY_TYPES.length) | 0];
    for (let i = 0; i < size; i++) {
      if (this.enemies.length >= this.maxEnemies) break;
      this.spawn(def, false, { dir, baseZ, index: i });
    }
  }

  update(dt, onBoss) {
    // 官銜冷卻：期滿後放回可用池，之後的新小兵才可能再掛上
    for (let i = this.eliteCooldowns.length - 1; i >= 0; i--) {
      const c = this.eliteCooldowns[i];
      c.t -= dt;
      if (c.t <= 0) {
        this.eliteTitles.push(c.title);
        this.eliteCooldowns.splice(i, 1);
      }
    }

    // 一般小兵（成群生成）
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < this.maxEnemies) {
      this.spawnTimer = this.spawnInterval * (0.7 + Math.random() * 0.7);
      this.spawnGroup();
    }

    // 鎮守 Boss：同時間只會有一位；被斬殺後倒數重新出關
    if (this.sceneDef && !this.boss) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) {
        const e = new BossEnemy(this.sceneDef.boss);
        this.scene.add(e.mesh);
        this.enemies.push(e);
        this.boss = e;
        if (onBoss) onBoss(e);
      }
    }

    // 更新並回收
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead || !e.update(dt)) {
        this.remove(i);
      }
    }
  }

  remove(index) {
    const e = this.enemies[index];
    e.removed = true;
    this.scene.remove(e.mesh);
    // 幾何體為共用快取，不可 dispose；僅從場景移除即可回收
    this.enemies.splice(index, 1);

    // 鎮守 Boss 被斬殺 → 排定下次出關時間
    if (e === this.boss) {
      this.boss = null;
      const b = this.sceneDef.boss;
      this.bossTimer = b.respawnMin + Math.random() * (b.respawnMax - b.respawnMin);
    }

    // 官銜持有者陣亡 / 離場 → 官銜進入冷卻，暫時不會再出現
    if (e.title) {
      const min = this.sceneDef?.eliteCooldownMin ?? 8;
      const max = this.sceneDef?.eliteCooldownMax ?? 16;
      this.eliteCooldowns.push({ title: e.title, t: min + Math.random() * (max - min) });
    }
  }

  removeEnemy(enemy) {
    const i = this.enemies.indexOf(enemy);
    if (i >= 0) this.remove(i);
  }

  nearest(point) {
    let best = null, bestD = Infinity;
    for (const e of this.enemies) {
      const d = e.mesh.position.distanceTo(point);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }
}
