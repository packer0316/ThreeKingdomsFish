import * as THREE from 'three';
import { ENEMY_TYPES, BOSSES, FIELD, KILL_CHANCE, BOSS_KILL_FACTOR } from './config.js';
import { makeSoldier, makeBoss } from './models.js';

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

    this.mesh = isBoss ? makeBoss(def) : makeSoldier(def);
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

export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    this.spawnTimer = 1;
    this.spawnInterval = 2.6;
    this.maxEnemies = 16;
    this.bossTimer = 14;
  }

  spawn(def, isBoss = false, opts = {}) {
    const e = new Enemy(def, isBoss, opts);
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
    // 一般小兵（成群生成）
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < this.maxEnemies) {
      this.spawnTimer = this.spawnInterval * (0.7 + Math.random() * 0.7);
      this.spawnGroup();
    }

    // 敵將
    this.bossTimer -= dt;
    if (this.bossTimer <= 0) {
      this.bossTimer = 18 + Math.random() * 10;
      const boss = BOSSES[(Math.random() * BOSSES.length) | 0];
      const e = this.spawn(boss, true);
      if (onBoss) onBoss(e);
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
    this.scene.remove(e.mesh);
    // 幾何體為共用快取，不可 dispose；僅從場景移除即可回收
    this.enemies.splice(index, 1);
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
