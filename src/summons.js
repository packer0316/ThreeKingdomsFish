import * as THREE from 'three';
import { makeSummonGeneral } from './models.js';

// 招募武將（召喚援軍）------------------------------------------------
// 招募到「法/書/騎/槍/劍」的武將時，兩名援軍出現在玩家座位兩側，
// 自動作戰直到招募時間結束：
//   法 / 書 → 遠程，留在座位不接近怪物（法射龍捲風、書打雷電）
//   騎 / 槍 / 劍 → 近戰，衝上戰場砍殺
// 腳底一律有紫色圈框特效，方便玩家分辨自己招募的援軍。

const TYPE_COLOR = {
  法: 0xb98cf0,
  書: 0x5ad0c0,
  騎: 0xe0a83a,
  槍: 0x8fd45a,
  劍: 0xff9a5a,
};

const RING_MAIN = 0x9a4cff;   // 紫色圈框
const RING_ARC = 0xc79cff;

// 腳底紫色圈框（底環 + 兩段旋轉亮弧）
function makeSummonRing() {
  const grp = new THREE.Group();
  const baseMat = new THREE.MeshBasicMaterial({
    color: RING_MAIN, transparent: true, opacity: 0.55,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const base = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.08, 48), baseMat);
  base.rotateX(-Math.PI / 2);
  grp.add(base);

  const glowMat = new THREE.MeshBasicMaterial({
    color: RING_MAIN, transparent: true, opacity: 0.16,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.95, 40), glowMat);
  glow.rotateX(-Math.PI / 2);
  grp.add(glow);

  const arcMat = new THREE.MeshBasicMaterial({
    color: RING_ARC, transparent: true, opacity: 0.85,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const arcGeo = new THREE.RingGeometry(1.12, 1.3, 32, 1, 0, Math.PI * 0.5);
  arcGeo.rotateX(-Math.PI / 2);
  const arcs = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const a = new THREE.Mesh(arcGeo, arcMat);
    a.rotation.y = Math.PI * i;
    arcs.add(a);
  }
  grp.add(arcs);
  grp.userData.arcs = arcs;
  return grp;
}

// ---------- 法術特效：龍捲風（法）----------
// 從施術者朝目標直線飛行的旋轉風柱，命中敵人造成傷害後消散。
const TORNADO_LIFE = 2.0;
class Tornado {
  constructor(scene, from, dir, power, dealDamage) {
    this.scene = scene;
    this.dir = dir.clone().setY(0).normalize();
    this.power = power;
    this.dealDamage = dealDamage;
    this.speed = 20;
    this.life = TORNADO_LIFE;
    this.spin = 0;

    this.group = new THREE.Group();
    this.group.position.copy(from).setY(0.1);
    this.rings = [];
    for (let i = 0; i < 5; i++) {
      const r = 0.3 + i * 0.28;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xcabfff, transparent: true, opacity: 0.5,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 6, 18), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.4 + i * 0.85;
      this.group.add(ring);
      this.rings.push(ring);
    }
    scene.add(this.group);
  }

  update(dt, enemies) {
    this.life -= dt;
    this.spin += dt * 14;
    this.group.position.addScaledVector(this.dir, this.speed * dt);
    this.group.rotation.y = this.spin;
    for (let i = 0; i < this.rings.length; i++) {
      this.rings[i].rotation.z = this.spin * (1 + i * 0.2);
    }

    // 命中最近的敵人（水平距離）
    const p = this.group.position;
    for (const e of enemies) {
      if (e.dead || e.removed) continue;
      const dx = e.mesh.position.x - p.x;
      const dz = e.mesh.position.z - p.z;
      if (dx * dx + dz * dz < (e.radius + 1.0) * (e.radius + 1.0)) {
        this.dealDamage(e, this.power, e.mesh.position.clone().setY(1.6));
        this.life = Math.min(this.life, 0.12);   // 命中後迅速消散
        break;
      }
    }
    return this.life > 0;
  }

  dispose() { this.scene.remove(this.group); }
}

// ---------- 法術特效：雷電（書）----------
// 瞬發：在目標頭上劈下閃電，立即造成傷害，光柱短暫閃現後消失。
const BOLT_LIFE = 0.32;
class Lightning {
  constructor(scene, target, power, dealDamage) {
    this.scene = scene;
    this.life = BOLT_LIFE;

    const pos = target.mesh.position.clone();
    dealDamage(target, power, pos.clone().setY(1.6));   // 瞬間傷害

    this.group = new THREE.Group();
    this.group.position.set(pos.x, 0, pos.z);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xbfe8ff, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    // 鋸齒狀分段光柱
    let y = 7.5;
    let x = 0, z = 0;
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.3, 5), mat);
      const nx = (Math.random() - 0.5) * 0.6;
      const nz = (Math.random() - 0.5) * 0.6;
      seg.position.set((x + nx) / 2, y - 0.65, (z + nz) / 2);
      seg.rotation.z = (nx - x) * 0.5;
      seg.rotation.x = (nz - z) * 0.5;
      this.group.add(seg);
      x = nx; z = nz; y -= 1.25;
    }
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), mat);
    flash.position.y = 1.4;
    this.group.add(flash);
    scene.add(this.group);
  }

  update(dt) {
    this.life -= dt;
    const k = Math.max(0, this.life / BOLT_LIFE);
    this.group.traverse((o) => { if (o.material) o.material.opacity = 0.95 * k; });
    return this.life > 0;
  }

  dispose() { this.scene.remove(this.group); }
}

// ---------- 單一召喚武將 ----------
class SummonUnit {
  constructor(scene, enemyMgr, character, x, z, duration, mgr) {
    this.scene = scene;
    this.enemyMgr = enemyMgr;
    this.mgr = mgr;                 // 用於產生法術特效
    this.char = character;
    this.type = character.type;
    this.ranged = (this.type === '法' || this.type === '書');

    this.home = new THREE.Vector3(x, 0, z);
    this.mesh = makeSummonGeneral(this.type, TYPE_COLOR[this.type]);
    this.mesh.position.copy(this.home);
    this.facing = Math.PI;
    this.mesh.rotation.y = this.facing;
    scene.add(this.mesh);

    this.ring = makeSummonRing();
    this.ring.position.y = 0.05;
    this.mesh.add(this.ring);

    this.parts = this.mesh.userData.parts;
    this.armRBase = this.mesh.userData.armRBase ?? -0.5;

    this.life = duration;
    this.time = 0;
    this.target = null;
    this.attackCd = Math.random() * 0.4;
    this.swingT = 0;

    // 行為參數
    this.speed = 12;
    this.meleeRange = 2.8;
    this.attackInterval = this.ranged ? 1.1 : 0.5;
    this.power = 2 + ({ H: 0, R: 0, SR: 1, SSR: 2 }[character.rarity] || 0);
    this.done = false;
  }

  faceTo(px, pz) {
    const dx = px - this.mesh.position.x;
    const dz = pz - this.mesh.position.z;
    this.facing = Math.atan2(dx, dz);
    this.mesh.rotation.y = this.facing;
  }

  pickTarget() {
    let best = null, bestD = Infinity;
    for (const e of this.enemyMgr.enemies) {
      if (e.dead || e.removed) continue;
      const d = e.mesh.position.distanceTo(this.mesh.position);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  update(dt) {
    this.time += dt;
    this.life -= dt;
    if (this.life <= 0) { this.done = true; return; }

    // 圈框旋轉 + 微幅呼吸
    if (this.ring.userData.arcs) this.ring.userData.arcs.rotation.y += dt * 1.8;

    if (!this.target || this.target.dead || this.target.removed) {
      this.target = this.pickTarget();
    }
    const t = this.target;

    if (this.ranged) {
      // 遠程：留在座位，面向目標，定時施法
      this.mesh.position.lerp(this.home, Math.min(1, dt * 6));  // 若被推移，緩慢歸位
      if (t) this.faceTo(t.mesh.position.x, t.mesh.position.z);
      this.attackCd -= dt;
      if (t && this.attackCd <= 0) {
        this.attackCd = this.attackInterval;
        this.castSpell(t);
        this.swingT = 0.3;
      }
    } else {
      // 近戰：衝向目標砍殺，無目標則回座位
      const dest = t ? t.mesh.position : this.home;
      const dx = dest.x - this.mesh.position.x;
      const dz = dest.z - this.mesh.position.z;
      const dist = Math.hypot(dx, dz) || 0.0001;
      const stop = t ? this.meleeRange : 0.2;
      if (dist > stop) {
        const step = Math.min(this.speed * dt, dist - stop);
        this.mesh.position.x += (dx / dist) * step;
        this.mesh.position.z += (dz / dist) * step;
        this.faceTo(dest.x, dest.z);
        this.walkPhase = (this.walkPhase || 0) + dt * 10;
      } else if (t) {
        this.faceTo(t.mesh.position.x, t.mesh.position.z);
        this.attackCd -= dt;
        if (this.attackCd <= 0) {
          this.attackCd = this.attackInterval;
          this.mgr.dealDamage(t, this.power, t.mesh.position.clone().setY(1.6));
          this.swingT = 0.28;
        }
      }
    }

    this.animate(dt);
  }

  // 施放法術（法：龍捲風／書：雷電）
  castSpell(t) {
    if (this.type === '法') {
      const from = this.mesh.position.clone().setY(1.6);
      const dir = t.mesh.position.clone().sub(this.mesh.position);
      this.mgr.spawnFx(new Tornado(this.scene, from, dir, this.power, this.mgr.dealDamage));
    } else {
      this.mgr.spawnFx(new Lightning(this.scene, t, this.power, this.mgr.dealDamage));
    }
  }

  // 揮擊 / 施法擺臂 + 走路腿部擺動
  animate(dt) {
    const armR = this.parts.armR;
    if (this.swingT > 0) {
      this.swingT -= dt;
      const k = Math.max(0, this.swingT / 0.3);
      armR.rotation.x = this.armRBase - Math.sin((1 - k) * Math.PI) * 1.3;
    } else {
      armR.rotation.x = this.armRBase;
    }
    if (this.parts.legL && this.walkPhase != null && !this.ranged) {
      const s = Math.sin(this.walkPhase) * 0.5;
      this.parts.legL.rotation.x = s;
      this.parts.legR.rotation.x = -s;
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
  }
}

// ---------- 召喚管理器 ----------
export class SummonManager {
  // opts: { dealDamage(enemy,power,hitPos)->killed, getPlayerX()->number, turretZ }
  constructor(scene, enemyMgr, opts = {}) {
    this.scene = scene;
    this.enemyMgr = enemyMgr;
    this.dealDamage = opts.dealDamage || (() => false);
    this.getPlayerX = opts.getPlayerX || (() => 0);
    this.turretZ = opts.turretZ ?? 6;
    this.units = [];
    this.fx = [];
  }

  spawnFx(fx) { this.fx.push(fx); }

  get active() { return this.units.length > 0; }

  // 清掉目前在場的援軍（重新招募時取代舊的兩名）
  clear() {
    for (const u of this.units) u.dispose();
    this.units.length = 0;
  }

  // 招募到的一組武將（通常兩名）：分列玩家座位左右兩側，作戰 durationSec 秒。
  // 會先清除上一批援軍——重新招募即以新的兩名取代舊的。
  summonPair(chars, durationSec) {
    this.clear();
    const px = this.getPlayerX();
    const sides = [-1, 1];
    chars.forEach((c, i) => {
      const side = sides[i % 2];
      const x = px + side * 5.5;
      this.units.push(new SummonUnit(this.scene, this.enemyMgr, c, x, this.turretZ, durationSec, this));
    });
  }

  update(dt) {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      u.update(dt);
      if (u.done) { u.dispose(); this.units.splice(i, 1); }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      const alive = f.update(dt, this.enemyMgr.enemies);
      if (!alive) { f.dispose(); this.fx.splice(i, 1); }
    }
  }
}
