import * as THREE from 'three';
import { makeProjectile } from './arrowModel.js';

// 砲彈 / 箭矢管理 -----------------------------------------------

export class BulletManager {
  constructor(scene) {
    this.scene = scene;
    this.bullets = [];
  }

  // origin: Vector3 起點, dir: Vector3 單位方向, power: 傷害
  // owner: 發射者（AI 玩家物件），null 代表中座的真人玩家
  fire(origin, dir, power, color, owner = null) {
    const mesh = makeProjectile(color);
    mesh.position.copy(origin);
    // 讓箭頭朝向飛行方向
    mesh.lookAt(origin.clone().add(dir));
    this.scene.add(mesh);
    this.bullets.push({
      mesh,
      dir: dir.clone().normalize(),
      speed: 42,
      power,
      life: 2.2,
      owner,
    });
  }

  update(dt, enemies, onHit) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.mesh.position.addScaledVector(b.dir, b.speed * dt);
      b.life -= dt;

      let hitSomething = false;
      // 命中判定（水平面距離）
      for (const e of enemies) {
        if (e.dead) continue;
        const p = e.mesh.position;
        const bp = b.mesh.position;
        const dx = bp.x - p.x;
        const dz = bp.z - (p.z);
        const dy = bp.y - 1.4;
        if (dx * dx + dz * dz < e.radius * e.radius && Math.abs(dy) < 2.2) {
          onHit(e, b, bp.clone());
          hitSomething = true;
          break;
        }
      }

      if (hitSomething || b.life <= 0) {
        this.remove(i);
      }
    }
  }

  remove(i) {
    const b = this.bullets[i];
    this.scene.remove(b.mesh);
    // 箭矢幾何體為共用快取，不可 dispose
    this.bullets.splice(i, 1);
  }

  // 清空所有在場飛行中的箭矢 / 砲彈（換房重建時用）
  clear() {
    for (const b of this.bullets) this.scene.remove(b.mesh);
    this.bullets.length = 0;
  }
}
