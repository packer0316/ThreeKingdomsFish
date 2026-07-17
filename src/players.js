import * as THREE from 'three';
import { makeArcherGeneral } from './models.js';
import { loadLubu } from './lubu.js';
import { FIELD, BET_LEVELS, GENERALS } from './config.js';

// 讓一根預設沿 Y 軸、單位長度的圓柱在 a、b 兩點之間拉伸對齊（用於弓弦）
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
function stretchSegment(mesh, a, b) {
  _dir.subVectors(b, a);
  const len = _dir.length() || 0.0001;
  mesh.position.copy(a).addScaledVector(_dir, 0.5);
  mesh.scale.y = len;
  mesh.quaternion.setFromUnitVectors(_up, _dir.multiplyScalar(1 / len));
}

// 左右兩側的 AI 陪玩玩家（弓箭手）------------------------------
// 各自持弓，會自動選定敵人、轉身瞄準，拉弓 → 放箭循環，
// 命中擊殺後累積自己的籌碼，並在畫面下方角落顯示座位資訊。

export class AIPlayer {
  constructor(scene, def, bulletMgr, enemyMgr, root) {
    this.scene = scene;
    this.def = def;
    this.bulletMgr = bulletMgr;
    this.enemyMgr = enemyMgr;
    this.general = GENERALS[def.generalIndex] || GENERALS[0];

    this.coins = def.coins;
    this.betIndex = def.betIndex;
    this.retargetCooldown = 0;
    this.current = null;                       // 目前鎖定的敵人
    this.target = new THREE.Vector3(def.x, 1.4, -8);

    // 拉弓循環參數
    this.drawTime = def.drawTime || 0.5;       // 拉滿弓所需時間
    this.recoverTime = def.recoverTime || 0.35;// 放箭後回復 / 搭新箭
    this.phase = 'idle';                       // idle | draw | recover
    this.phaseT = 0;
    this.drawVal = 0;                          // 0=鬆弦 1=滿弓
    this.maxDraw = 0.55;                       // nock 最大後移量

    this.turret = this.buildArcher();
    scene.add(this.turret);
    this.applyDraw(0);

    this.buildSeat(root);
  }

  get bet() { return BET_LEVELS[this.betIndex]; }

  // ---------- 建立弓箭手 ----------
  buildArcher() {
    const t = makeArcherGeneral(this.general);
    t.position.set(this.def.x, 0, FIELD.turretZ);

    // 箭矢發射點（弓的前方），朝向 -Z
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, t.userData.parts.bowY, t.userData.parts.bowZ - 0.5);
    t.add(muzzle);
    t.userData.muzzle = muzzle;
    return t;
  }

  // ---------- 建立畫面座位面板 ----------
  buildSeat(root) {
    const el = document.createElement('div');
    el.className = 'seat seat-' + this.def.seat;
    el.innerHTML =
      `<div class="seat-name">${this.def.name}</div>` +
      `<div class="seat-info">` +
        `<span class="seat-general">弓將・${this.general.name}</span>` +
        `<span class="seat-bet">押 ${fmt(this.bet)}</span>` +
      `</div>` +
      `<div class="seat-coin"><span class="coin-icon">🪙</span>` +
        `<span class="seat-coin-value">0</span></div>`;
    root.appendChild(el);
    this.seatEl = el;
    this.coinEl = el.querySelector('.seat-coin-value');
    this.refreshSeat();
  }

  refreshSeat() {
    this.coinEl.textContent = fmt(this.coins);
  }

  // 擊殺獲得籌碼：更新數字並閃爍座位
  win(amount) {
    this.coins += amount;
    this.refreshSeat();
    this.seatEl.classList.remove('flash');
    void this.seatEl.offsetWidth; // 觸發重繪以重啟動畫
    this.seatEl.classList.add('flash');
  }

  // ---------- 每幀更新：選目標、轉身瞄準、拉弓放箭 ----------
  update(dt) {
    this.retargetCooldown -= dt;
    if (!this.current || this.current.dead || this.retargetCooldown <= 0) {
      this.current = this.enemyMgr.nearest(this.turret.position);
      this.retargetCooldown = 0.6 + Math.random() * 0.8;
    }

    const hasTarget = this.current && !this.current.dead;
    if (hasTarget) this.target.copy(this.current.mesh.position).setY(1.4);
    this.aimAt(this.target);

    this.stepDraw(dt, hasTarget);
  }

  // 弓箭手整體轉身面向目標（本體正面朝 -Z）
  aimAt(point) {
    const dx = point.x - this.turret.position.x;
    const dz = point.z - this.turret.position.z;
    this.turret.rotation.y = Math.atan2(-dx, -dz);
  }

  // 拉弓 → 放箭 → 回復 的狀態機
  stepDraw(dt, hasTarget) {
    const parts = this.turret.userData.parts;

    if (!hasTarget) {
      // 沒有目標：鬆弦、收箭
      this.drawVal = Math.max(0, this.drawVal - dt * 3);
      this.phase = 'idle';
      parts.nockedArrow.visible = this.drawVal > 0.05;
      this.applyDraw(this.drawVal);
      return;
    }

    if (this.phase === 'idle') {
      this.phase = 'draw';
      this.phaseT = 0;
      parts.nockedArrow.visible = true;
    }

    this.phaseT += dt;
    if (this.phase === 'draw') {
      this.drawVal = Math.min(1, this.phaseT / this.drawTime);
      if (this.drawVal >= 1) {
        this.releaseArrow();               // 放箭！
        parts.nockedArrow.visible = false;
        this.phase = 'recover';
        this.phaseT = 0;
      }
    } else if (this.phase === 'recover') {
      // 弦快速回彈，然後搭上新箭
      this.drawVal = Math.max(0, 1 - this.phaseT / (this.recoverTime * 0.4));
      if (this.phaseT >= this.recoverTime) {
        this.phase = 'idle';
      }
    }

    this.applyDraw(this.drawVal);
  }

  // 依拉弓進度移動 nock、拉伸弓弦
  applyDraw(v) {
    const p = this.turret.userData.parts;
    const nockZ = p.restZ + v * this.maxDraw;
    p.nock.position.z = nockZ;
    const nockPos = new THREE.Vector3(0, p.bowY, nockZ);
    stretchSegment(p.stringTop, p.tipTop, nockPos);
    stretchSegment(p.stringBot, p.tipBot, nockPos);
  }

  releaseArrow() {
    const muzzleWorld = new THREE.Vector3();
    this.turret.userData.muzzle.getWorldPosition(muzzleWorld);
    const dir = new THREE.Vector3().subVectors(this.target, muzzleWorld).normalize();
    const power = 1 + Math.floor(this.betIndex / 2);
    this.bulletMgr.fire(muzzleWorld, dir, power, this.general.blade, this);
  }
}

function fmt(n) {
  return Math.floor(n).toLocaleString('en-US');
}

// 中座近戰武將（真人玩家操控，模型為呂布 Lubu.fbx）------------------
// 收到攻擊指令時會離開砲位、跑向敵人並揮刀砍殺；閒置時走回原位。
// 動作以 AnimationMixer 播放，子片段依 LUBU_ANIM_DEFINE.txt 切出：
//   idle（待機/移動）、attack1/2/4（揮刀，輪替）、ultimate（大絕招）

const LUBU_TARGET_HEIGHT = 4.5;   // 模型正規化後的世界高度
const LUBU_MODEL_YAW = 0;         // 模型正面若非 +Z，可在此加上旋轉修正
const ULT_EVERY = 8;              // 每累積 N 次揮刀施放一次大絕招

// Box3.setFromObject 仍會納入 visible=false 的節點，需自行排除已關閉的赤兔馬。
function visibleBounds(root) {
  const result = new THREE.Box3();
  const meshBox = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!o.visible || !o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (!o.geometry.boundingBox) return;
    meshBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    result.union(meshBox);
  });
  return result;
}

export class MeleeGeneral {
  // attack(enemy): 由主程式提供，回傳是否成功攻擊（籌碼足夠並命中）
  constructor(scene, def, enemyMgr, attack) {
    this.scene = scene;
    this.def = def;
    this.enemyMgr = enemyMgr;
    this.attack = attack;
    this.home = new THREE.Vector3(0, 0, FIELD.turretZ);

    // 模型非同步載入前，先用空群組佔位，載好後再塞入呂布模型
    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.home);
    this.facing = Math.PI;                 // 面向戰場（-Z）
    this.mesh.rotation.y = this.facing;
    scene.add(this.mesh);

    // 本機玩家識別光圈：半透明底環搭配兩層反向旋轉的亮弧。
    this.haloTime = 0;
    this.halo = new THREE.Group();
    this.halo.position.y = 0.07;            // 稍微離地，避免與地面閃爍
    this.mesh.add(this.halo);

    this.haloBaseMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc94a,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const baseGeometry = new THREE.RingGeometry(1.42, 1.72, 64);
    baseGeometry.rotateX(-Math.PI / 2);
    this.halo.add(new THREE.Mesh(baseGeometry, this.haloBaseMaterial));

    this.haloArcs = new THREE.Group();
    this.haloArcMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff1a3,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const arcGeometry = new THREE.RingGeometry(1.5, 1.84, 32, 1, 0, Math.PI * 0.38);
    arcGeometry.rotateX(-Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const arc = new THREE.Mesh(arcGeometry, this.haloArcMaterial);
      arc.rotation.y = (Math.PI * 2 * i) / 3;
      this.haloArcs.add(arc);
    }
    this.halo.add(this.haloArcs);

    this.haloOuterArcs = new THREE.Group();
    const outerArcGeometry = new THREE.RingGeometry(1.9, 2.02, 32, 1, 0, Math.PI * 0.26);
    outerArcGeometry.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const arc = new THREE.Mesh(outerArcGeometry, this.haloArcMaterial);
      arc.rotation.y = (Math.PI * i) / 2;
      this.haloOuterArcs.add(arc);
    }
    this.halo.add(this.haloOuterArcs);

    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.attackCycle = ['attack1', 'attack2', 'attack4'];
    this.lastAttack = null;
    this.ready = false;

    this.speed = 13;             // 移動速度（世界單位/秒）
    this.meleeRange = 2.4;       // 揮刀有效距離
    this.attackInterval = 0.34;  // 揮刀間隔
    this.attackCooldown = 0;
    this.holdTimer = 0;          // 一次性動作保留時間（>0 時不切回 idle）
    this.ultLock = 0;            // 大絕招鎖定（>0 時不被普通揮刀動作打斷）
    this.hitCount = 0;
    this.target = null;

    this.loadModel();
  }

  async loadModel() {
    const { object, clips } = await loadLubu();
    const model = object;

    // 正規化大小：等比縮放到目標高度
    let box = visibleBounds(model);
    const size = box.getSize(new THREE.Vector3());
    const s = size.y > 0 ? LUBU_TARGET_HEIGHT / size.y : 1;
    model.scale.setScalar(s);

    // 對齊：腳踩地面（y=0），水平置中
    box = visibleBounds(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
    model.rotation.y = LUBU_MODEL_YAW;

    this.mesh.add(model);

    // 建立動作
    this.mixer = new THREE.AnimationMixer(model);
    for (const [name, clip] of Object.entries(clips)) {
      if (clip) this.actions[name] = this.mixer.clipAction(clip);
    }
    this.attackCycle = this.attackCycle.filter((n) => this.actions[n]);

    this.ready = true;
    this.play('idle');
  }

  // 播放動作；loop=false 為一次性動作（播完停在最後一格）
  play(name, loop = true) {
    const next = this.actions[name];
    if (!next) return;
    if (loop && next === this.currentAction) return;   // 迴圈動作不重複重置

    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.fadeIn(0.15);
    next.play();
    if (this.currentAction && this.currentAction !== next) this.currentAction.fadeOut(0.15);
    this.currentAction = next;
  }

  // 切換武將：呂布模型固定，僅更新資料（顏色/名稱）
  setGeneral(def) {
    this.def = def;
  }

  // 觸發一次揮刀動作（普通攻擊隨機挑選，或每 ULT_EVERY 次施放大絕招）
  triggerSlash() {
    this.hitCount++;
    if (this.hitCount % ULT_EVERY === 0 && this.actions.ultimate) {
      this.play('ultimate', false);
      const d = this.actions.ultimate.getClip().duration;
      this.holdTimer = d;
      this.ultLock = d;                 // 大絕招期間不被普通揮刀打斷
      return;
    }
    if (this.ultLock > 0 || this.attackCycle.length === 0) return;
    const choices = this.attackCycle.filter((name) => name !== this.lastAttack);
    const pool = choices.length > 0 ? choices : this.attackCycle;
    const name = pool[Math.floor(Math.random() * pool.length)];
    this.lastAttack = name;
    this.play(name, false);
    this.holdTimer = Math.max(this.holdTimer, this.actions[name].getClip().duration);
  }

  // cmd: { attack: bool, auto: bool, point: THREE.Vector3 }
  update(dt, cmd) {
    if (this.mixer) this.mixer.update(dt);
    this.haloTime += dt;
    this.haloArcs.rotation.y += dt * 2.2;
    this.haloOuterArcs.rotation.y -= dt * 1.35;
    const pulse = (Math.sin(this.haloTime * 4) + 1) * 0.5;
    this.haloBaseMaterial.opacity = 0.2 + pulse * 0.12;
    this.haloArcMaterial.opacity = 0.72 + pulse * 0.2;
    if (!this.ready) return;            // 模型尚未載入

    this.holdTimer = Math.max(0, this.holdTimer - dt);
    this.ultLock = Math.max(0, this.ultLock - dt);

    // 選定目標
    if (cmd.attack || cmd.auto) {
      if (!this.target || this.target.dead) {
        const ref = cmd.attack ? cmd.point : this.mesh.position;
        this.target = this.enemyMgr.nearest(ref);
      }
    } else {
      this.target = null;
    }

    const hunting = this.target && !this.target.dead;
    const dest = hunting ? this.target.mesh.position : this.home;

    const dx = dest.x - this.mesh.position.x;
    const dz = dest.z - this.mesh.position.z;
    const dist = Math.hypot(dx, dz) || 0.0001;
    const stopDist = hunting ? this.meleeRange : 0.2;

    // 移動
    if (dist > stopDist) {
      const step = Math.min(this.speed * dt, dist - stopDist);
      this.mesh.position.x += (dx / dist) * step;
      this.mesh.position.z += (dz / dist) * step;
      this.facing = Math.atan2(dx, dz);
    } else if (hunting) {
      this.facing = Math.atan2(dx, dz);
    }
    this.mesh.rotation.y = this.facing;

    // 揮刀攻擊（傷害節奏維持不變，動作由 mixer 播放）
    this.attackCooldown -= dt;
    if (hunting && dist <= stopDist + 0.5 && this.attackCooldown <= 0) {
      this.attackCooldown = this.attackInterval;
      const ok = this.attack(this.target);
      // 讓一次性動作完整播完，再挑選下一個攻擊動作，避免每次傷害判定都重置動畫。
      if (ok) {
        if (this.holdTimer <= 0) this.triggerSlash();
      } else {
        this.target = null;             // 籌碼不足 → 收兵
      }
      if (this.target && this.target.dead) this.target = null;
    }

    // 沒有一次性動作在播放時，回到待機（移動時亦用 idle，無專屬走路動作）
    if (this.holdTimer <= 0) this.play('idle');
  }
}
