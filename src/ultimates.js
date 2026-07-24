import * as THREE from 'three';
import { randomSword } from './swordModels.js';
import { BladeStormFX, RedStormFX } from './skillfx.js';

// 玩家武將大招（每次攻擊約 5% 機率觸發）------------------------------
// 全部為「全場範圍技」：對場上所有小兵各造成一次（多波）機率性擊殺，
// 沿用一般命中的擊殺率（透過傳入的 dealDamage 結算獎勵）。
//   呂布「千軍萬馬」：萬劍從天而降插地＋滿場紅色粒子噴發
//   關羽「偃月橫掃」：分層螺旋刀風向外橫掃整個戰場
//   黃忠「萬箭齊發」：箭雨持續 5 秒不斷落下
// 刀風 / 紅粒子視覺層為 three.quarks 粒子（見 skillfx.js）。

// ---------- 呂布：千軍萬馬（天降萬劍）----------
class SkySwords {
  constructor(scene, field, aoe, shake) {
    this.scene = scene;
    this.aoe = aoe;
    this.shake = shake;
    this.time = 0;
    this.life = 1.9;
    this.shook = false;

    this.group = new THREE.Group();
    scene.add(this.group);

    // 程序化備援（FBX 尚未載好時使用）
    this.fbBladeGeo = new THREE.BoxGeometry(0.16, 2.2, 0.1);
    this.fbGuardGeo = new THREE.BoxGeometry(0.52, 0.14, 0.18);
    this.fallbackMats = [];

    this.swords = [];
    for (let i = 0; i < 30; i++) {
      const s = new THREE.Group();
      let mats;
      const sword = randomSword();   // 1/3 機率取 3 把 FBX 之一
      if (sword) {
        s.add(sword.group);
        mats = sword.mats;
        mats.forEach((m) => { m.transparent = true; });
      } else {
        const bm = new THREE.MeshBasicMaterial({ color: 0xcdd8ea, transparent: true, opacity: 1 });
        const gm = new THREE.MeshBasicMaterial({ color: 0xe0b24a, transparent: true, opacity: 1 });
        const blade = new THREE.Mesh(this.fbBladeGeo, bm); blade.position.y = 1.1;
        const guard = new THREE.Mesh(this.fbGuardGeo, gm); guard.position.y = 2.1;
        s.add(blade, guard);
        mats = [bm, gm];
        this.fallbackMats.push(bm, gm);
      }
      const x = field.minX + Math.random() * (field.maxX - field.minX);
      const z = field.minZ + Math.random() * (field.maxZ - field.minZ);
      s.position.set(x, 15 + Math.random() * 10, z);
      s.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(s);
      this.swords.push({ s, mats, vy: 0, groundY: -1.4, landed: false, delay: Math.random() * 0.4, tilt: (Math.random() - 0.5) * 0.5 });
    }
    this.waves = [{ t: 0.5, p: 8, done: false }, { t: 0.85, p: 7, done: false }];
  }

  update(dt) {
    this.time += dt;
    for (const o of this.swords) {
      if (this.time < o.delay) continue;
      if (!o.landed) {
        o.vy += 65 * dt;
        o.s.position.y -= o.vy * dt;
        if (o.s.position.y <= o.groundY) { o.s.position.y = o.groundY; o.landed = true; o.s.rotation.z = o.tilt; }
      }
    }
    if (!this.shook && this.time > 0.46) { this.shook = true; this.shake(true); }
    for (const w of this.waves) if (!w.done && this.time >= w.t) { w.done = true; this.aoe(w.p); }

    if (this.time > this.life - 0.55) {
      const k = Math.max(0, (this.life - this.time) / 0.55);
      for (const o of this.swords) for (const m of o.mats) { m.transparent = true; m.opacity = k; }
    }
    return this.time < this.life;
  }

  dispose() {
    this.scene.remove(this.group);
    this.fbBladeGeo.dispose(); this.fbGuardGeo.dispose();
    for (const o of this.swords) for (const m of o.mats) m.dispose();
  }
}

// ---------- 關羽：偃月橫掃（螺旋刀風，quarks 粒子）----------
class Whirlwind {
  constructor(scene, center, aoe) {
    this.aoe = aoe;
    this.time = 0;
    this.life = 1.6;   // 刀風粒子壽命最長約 1.45s（0.2 延遲 + 1.05 壽命 + 收尾）
    this.fx = new BladeStormFX(center);
    this.waves = [{ t: 0.12, p: 8, done: false }, { t: 0.5, p: 7, done: false }, { t: 0.9, p: 6, done: false }];
  }

  update(dt) {
    this.time += dt;
    for (const w of this.waves) if (!w.done && this.time >= w.t) { w.done = true; this.aoe(w.p); }
    return this.time < this.life;
  }

  dispose() {
    this.fx.dispose();
  }
}

// ---------- 呂布：滿場紅色粒子噴發（與劍雨兩波傷害同步）----------
class RedStorm {
  constructor(field) {
    this.time = 0;
    this.life = 2.8;   // 最後一波 0.9s 噴發 + 最長 1.7s 粒子壽命
    this.fx = new RedStormFX(field);
  }

  update(dt) {
    this.time += dt;
    return this.time < this.life;
  }

  dispose() {
    this.fx.dispose();
  }
}

// ---------- 黃忠：萬箭齊發（箭雨 5 秒）----------
class ArrowRain {
  constructor(scene, field, aoe) {
    this.scene = scene;
    this.aoe = aoe;
    this.field = field;
    this.time = 0;
    this.life = 5.0;
    this.spawnT = 0;
    this.nextWave = 0;

    this.group = new THREE.Group();
    scene.add(this.group);
    this.shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 5);
    this.tipGeo = new THREE.ConeGeometry(0.09, 0.28, 5);
    this.shaftMat = new THREE.MeshBasicMaterial({ color: 0x6b4a24 });
    this.tipMat = new THREE.MeshBasicMaterial({ color: 0xd8d8e0 });
    this.arrows = [];
  }

  spawnArrow() {
    const a = new THREE.Group();
    const shaft = new THREE.Mesh(this.shaftGeo, this.shaftMat);
    const tip = new THREE.Mesh(this.tipGeo, this.tipMat); tip.position.y = -0.8; tip.rotation.x = Math.PI;
    const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.22), this.tipMat); fletch.position.y = 0.66;
    a.add(shaft, tip, fletch);
    a.rotation.x = -0.4;   // 斜向落下
    const x = this.field.minX + Math.random() * (this.field.maxX - this.field.minX);
    const z = this.field.minZ + Math.random() * (this.field.maxZ - this.field.minZ);
    a.position.set(x, 17 + Math.random() * 7, z);
    this.group.add(a);
    this.arrows.push({ a, vy: 24 + Math.random() * 10, ground: 0.6 });
  }

  update(dt) {
    this.time += dt;
    if (this.time < this.life - 0.5) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = 0.05; for (let i = 0; i < 4; i++) this.spawnArrow(); }
    }
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const o = this.arrows[i];
      o.a.position.y -= o.vy * dt;
      o.a.position.z += o.vy * dt * 0.38;   // 沿傾斜方向前移
      if (o.a.position.y <= o.ground) { this.group.remove(o.a); this.arrows.splice(i, 1); }
    }
    if (this.time >= this.nextWave && this.time < this.life) { this.nextWave += 0.45; this.aoe(5); }

    if (this.time >= this.life) {
      for (const o of this.arrows) this.group.remove(o.a);
      this.arrows.length = 0;
      return false;
    }
    return true;
  }

  dispose() {
    this.scene.remove(this.group);
    this.shaftGeo.dispose(); this.tipGeo.dispose();
    this.shaftMat.dispose(); this.tipMat.dispose();
  }
}

const SKILL = {
  lubu: { who: '呂布', skill: '千軍萬馬' },
  guanyu: { who: '關羽', skill: '偃月橫掃' },
  huangzhong: { who: '黃忠', skill: '萬箭齊發' },
};

export class UltimateManager {
  // opts: { dealDamage(enemy,power,hitPos)->killed, shake(strong), getHeroPos()->Vector3, field }
  constructor(scene, enemyMgr, opts = {}) {
    this.scene = scene;
    this.enemyMgr = enemyMgr;
    this.dealDamage = opts.dealDamage || (() => false);
    this.shake = opts.shake || (() => {});
    this.getHeroPos = opts.getHeroPos || (() => new THREE.Vector3());
    this.field = opts.field || { minX: -22, maxX: 22, minZ: -20, maxZ: -1 };
    this.effects = [];
    this.banner = document.getElementById('ult-banner');
    this._bannerTimer = null;
  }

  // 對全場小兵（不含 Boss）各造成一次機率性傷害
  aoe(power) {
    const list = this.enemyMgr.enemies.filter((e) => !e.isBoss && !e.dead && !e.removed);
    for (const e of list) this.dealDamage(e, power, e.mesh.position.clone().setY(1.6));
  }

  trigger(kind) {
    const aoe = (p) => this.aoe(p);
    if (kind === 'lubu') {
      this.effects.push(new SkySwords(this.scene, this.field, aoe, this.shake));
      this.effects.push(new RedStorm(this.field));
    } else if (kind === 'guanyu') {
      this.effects.push(new Whirlwind(this.scene, this.getHeroPos(), aoe));
      this.shake(false);
    } else if (kind === 'huangzhong') {
      this.effects.push(new ArrowRain(this.scene, this.field, aoe));
    } else {
      return;
    }
    this.announce(kind);
  }

  announce(kind) {
    if (!this.banner) return;
    const s = SKILL[kind];
    if (!s) return;
    this.banner.innerHTML =
      `<span class="ult-who">${s.who}</span><span class="ult-skill">${s.skill}</span>`;
    this.banner.classList.remove('hidden', 'show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => {
      this.banner.classList.remove('show');
      this.banner.classList.add('hidden');
    }, 1500);
  }

  update(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      if (!e.update(dt)) { e.dispose(); this.effects.splice(i, 1); }
    }
  }
}
