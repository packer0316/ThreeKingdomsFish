import * as THREE from 'three';
import { ENEMY_TYPES, BOSSES, FIELD } from './config.js';
import { makeSoldier, makeBoss } from './models.js';

// 敵人物件與生成管理 --------------------------------------------

let idCounter = 1;

export class Enemy {
  constructor(def, isBoss = false) {
    this.def = def;
    this.isBoss = isBoss;
    this.id = idCounter++;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.value = def.value;
    this.name = def.name || def.label;
    this.dead = false;

    this.mesh = isBoss ? makeBoss(def) : makeSoldier(def);

    // 從左或右邊界進場，橫向行軍
    this.dir = Math.random() < 0.5 ? 1 : -1;
    const startX = this.dir === 1 ? FIELD.minX - 2 : FIELD.maxX + 2;
    const z = FIELD.minZ + Math.random() * (FIELD.maxZ - FIELD.minZ);
    this.mesh.position.set(startX, 0, z);
    this.mesh.rotation.y = this.dir === 1 ? Math.PI / 2 : -Math.PI / 2;

    this.speed = def.speed * (0.8 + Math.random() * 0.4);
    this.walkPhase = Math.random() * Math.PI * 2;
    // 碰撞半徑（世界座標，供命中判定）
    this.radius = (isBoss ? 2.2 : 1.1) * (def.scale || 1);
  }

  update(dt) {
    this.mesh.position.x += this.dir * this.speed * dt * 3;
    this.walkPhase += dt * this.speed * 6;

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

  hit(dmg) {
    this.hp -= dmg;
    // 受擊閃紅
    this.flash();
    return this.hp <= 0;
  }

  flash() {
    this.mesh.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive) {
        o.material.emissive.setHex(0x882020);
        setTimeout(() => o.material.emissive.setHex(0x000000), 90);
      }
    });
  }

  worldPos() {
    return this.mesh.position;
  }
}

export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1.1;
    this.bossTimer = 14;
  }

  spawn(def, isBoss = false) {
    const e = new Enemy(def, isBoss);
    this.scene.add(e.mesh);
    this.enemies.push(e);
    return e;
  }

  update(dt, onBoss) {
    // 一般小兵
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < 22) {
      this.spawnTimer = this.spawnInterval * (0.6 + Math.random() * 0.8);
      const def = ENEMY_TYPES[(Math.random() * ENEMY_TYPES.length) | 0];
      this.spawn(def, false);
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
    e.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
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
