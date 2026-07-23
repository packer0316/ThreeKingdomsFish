import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { makeArcherGeneral } from './models.js';
import { loadCharacter, CHARACTERS } from './characters.js';
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

    this.seat = def.seat;        // 目前所在座位 slot：'left' | 'mid' | 'right'
    this.onMoney = null;         // 金錢變動回呼（由主程式接到底部 HUD）

    this.turret = this.buildArcher();
    scene.add(this.turret);
    this.applyDraw(0);
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

  // 換座位：把弓箭手移到指定座位的橫向座標
  moveToSeat(x) {
    this.turret.position.x = x;
    this.def.x = x;
  }

  // 換房 / 換座位時更新此 AI 的資料（畫面顯示由底部 HUD 統一渲染）
  applySeatData(data) {
    if (data.name != null) this.def.name = data.name;
    if (data.generalIndex != null) this.general = GENERALS[data.generalIndex] || this.general;
    if (data.betIndex != null) this.betIndex = data.betIndex;
    if (data.coins != null) this.coins = data.coins;
  }

  // 金錢真實計算：放箭消耗下注、擊殺獲得獎勵，變動即通知 HUD
  pay(amount) {
    this.coins = Math.max(0, this.coins - amount);
    if (this.onMoney) this.onMoney(false);
  }
  win(amount) {
    this.coins += amount;
    if (this.onMoney) this.onMoney(true);
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
    this.pay(this.bet);          // 放箭消耗一次下注（金錢真實計算）
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

// 衝刺特效參數
const GHOST_COUNT = 6;            // 殘影池大小
const GHOST_LIFE = 0.32;          // 殘影淡出秒數
const GHOST_INTERVAL = 0.07;      // 衝刺時的殘影生成間隔
const DUST_LIFE = 0.38;           // 塵光粒子壽命
const DASH_TRIGGER_DIST = 6;      // 距離目標超過此值才觸發衝刺（貼身跟隨不衝刺）

// 衝刺粒子共用資源（避免每顆粒子各自配置幾何體/材質）
const DUST_GEO = new THREE.SphereGeometry(0.16, 6, 6);
const DUST_MAT = new THREE.MeshBasicMaterial({
  color: 0xffd98a,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

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

    // 本機玩家識別光圈：多層次「主角光環」——柔光暈 + 主環 + 掃光弧 +
    // 一圈旋轉刻度虛線 + 內側反向細環。暖金色、有層次但不刺眼。
    this.haloTime = 0;
    this.halo = new THREE.Group();
    this.halo.position.y = 0.05;            // 稍微離地，避免與地面閃爍
    this.mesh.add(this.halo);

    const gold = 0xffd98a, brightGold = 0xfff0c0, amber = 0xffb85a;
    const mkMat = (color, opacity) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mkRing = (inner, outer, mat, seg = 64, len) => {
      const g = len != null
        ? new THREE.RingGeometry(inner, outer, seg, 1, 0, len)
        : new THREE.RingGeometry(inner, outer, seg);
      g.rotateX(-Math.PI / 2);
      return new THREE.Mesh(g, mat);
    };

    // 內側柔光暈（讓腳下有落地感而非懸浮）
    this.haloGlowMaterial = mkMat(amber, 0.12);
    this.halo.add(mkRing(0.2, 1.32, this.haloGlowMaterial, 48));

    // 主環（明亮細環）
    this.haloBaseMaterial = mkMat(gold, 0.5);
    this.halo.add(mkRing(1.3, 1.42, this.haloBaseMaterial, 72));

    // 外側細環（極淡，增添層次）
    this.haloRimMaterial = mkMat(gold, 0.16);
    this.halo.add(mkRing(1.74, 1.8, this.haloRimMaterial, 72));

    // 掃光弧（兩道對稱長弧，順向旋轉）
    this.haloArcs = new THREE.Group();
    this.haloArcMaterial = mkMat(brightGold, 0.7);
    for (let i = 0; i < 2; i++) {
      const arc = mkRing(1.44, 1.66, this.haloArcMaterial, 48, Math.PI * 0.42);
      arc.rotation.y = Math.PI * i;
      this.haloArcs.add(arc);
    }
    this.halo.add(this.haloArcs);

    // 內側反向細環（逆向旋轉，做出雙環交錯感）
    this.haloInner = new THREE.Group();
    this.haloInnerMaterial = mkMat(brightGold, 0.4);
    for (let i = 0; i < 3; i++) {
      const arc = mkRing(1.04, 1.14, this.haloInnerMaterial, 40, Math.PI * 0.34);
      arc.rotation.y = (Math.PI * 2 * i) / 3;
      this.haloInner.add(arc);
    }
    this.halo.add(this.haloInner);

    this.character = CHARACTERS.lubu;   // 目前操控的武將角色（可切換 FBX 模型）
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.attackCycle = ['attack1', 'attack2', 'attack4'];
    this.lastAttack = null;
    this.ready = false;

    this.speed = 13;             // 一般移動速度（貼身跟隨、收兵回原位）
    this.sprintSpeed = 26;       // 遠距離撲向敵人時的衝刺速度
    this.dashing = false;        // 衝刺中（僅遠距離接敵時觸發，貼身跟隨不衝刺）
    this.meleeRange = 2.4;       // 揮刀有效距離
    this.attackInterval = 0.34;  // 揮刀間隔
    this.attackCooldown = 0;
    this.holdTimer = 0;          // 一次性動作保留時間（>0 時不切回 idle）
    this.ultLock = 0;            // 大絕招鎖定（>0 時不被普通揮刀動作打斷）
    this.hitCount = 0;
    this.target = null;          // 目前攻擊中的敵人
    this.selected = null;        // 玩家點選鎖定的敵人（永遠優先攻擊）

    // 衝刺特效狀態：殘影池 + 塵光粒子
    this.model = null;
    this.ghosts = [];
    this.ghostSrcNodes = [];
    this.ghostTimer = 0;
    this.dust = [];
    this.dustTimer = 0;

    // 鎖定目標的地面紅圈（細底環 + 兩段旋轉亮弧，較先前更細更收斂）
    this.targetRingMat = new THREE.MeshBasicMaterial({
      color: 0xff5a44,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.targetRing = new THREE.Group();
    const ringBaseGeo = new THREE.RingGeometry(1.02, 1.12, 56);
    ringBaseGeo.rotateX(-Math.PI / 2);
    this.targetRing.add(new THREE.Mesh(ringBaseGeo, this.targetRingMat));
    const ringArcGeo = new THREE.RingGeometry(1.16, 1.28, 40, 1, 0, Math.PI * 0.5);
    ringArcGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const arc = new THREE.Mesh(ringArcGeo, this.targetRingMat);
      arc.rotation.y = Math.PI * i;
      this.targetRing.add(arc);
    }
    this.targetRing.position.y = 0.05;
    this.targetRing.visible = false;
    scene.add(this.targetRing);

    this.loadModel();
  }

  async loadModel() {
    const character = this.character;
    const { object, clips } = await loadCharacter(character);
    // 切換角色時可能中途又被切走：只採用最後一次請求的角色
    if (this.character !== character) return;
    const model = object;

    // 先歸零變換，讓正規化可重複套用（切換角色來回時不會累積縮放）
    model.position.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.rotation.set(0, 0, 0);

    // 正規化大小：等比縮放到目標高度
    let box = visibleBounds(model);
    const size = box.getSize(new THREE.Vector3());
    const s = size.y > 0 ? character.height / size.y : 1;
    model.scale.setScalar(s);

    // 對齊：腳踩地面（y=0），水平置中
    box = visibleBounds(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
    model.rotation.y = character.yaw || 0;

    this.mesh.add(model);
    this.model = model;
    this.buildGhosts(model);

    // 建立動作
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [name, clip] of Object.entries(clips)) {
      if (clip) this.actions[name] = this.mixer.clipAction(clip);
    }
    this.attackCycle = (character.attackCycle || ['attack1', 'attack2', 'attack4'])
      .filter((n) => this.actions[n]);
    this.currentAction = null;
    this.lastAttack = null;

    this.ready = true;
    this.play('idle');
  }

  // 切換操控角色（呂布 / 關羽…）：卸下舊模型與動作，載入新模型
  async setCharacter(def) {
    if (!def || (this.character && this.character.id === def.id)) return;
    this.character = def;
    this.ready = false;
    this.holdTimer = 0;
    this.ultLock = 0;
    this.hitCount = 0;

    // 卸下舊模型
    if (this.model) { this.mesh.remove(this.model); this.model = null; }
    // 回收舊殘影
    for (const g of this.ghosts) this.scene.remove(g.root);
    this.ghosts = [];
    // 停掉舊動作
    if (this.mixer) this.mixer.stopAllAction();
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;

    await this.loadModel();
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

  // 換座位：把待命原位（與模型）移到指定座位的橫向座標
  moveToSeat(x) {
    this.home.x = x;
    // 非攻擊狀態時直接歸位，避免長距離走動穿越戰場
    if (!this.target) this.mesh.position.x = x;
  }

  // 玩家點選敵人：立即鎖定並前往攻擊（不需長按）
  select(enemy) {
    if (!enemy || enemy.dead || enemy.removed) return;
    this.selected = enemy;
    this.target = enemy;
    // 被鎖定的小兵有機率驚呼（帶入感）
    if (this.enemyMgr.shoutTargeted) this.enemyMgr.shoutTargeted(enemy);
  }

  // 點擊空地：取消鎖定（非自動模式下武將會走回原位）
  clearSelection() {
    this.selected = null;
  }

  // 建立殘影池：複製一次骨架模型，之後衝刺時重複使用（凍結姿勢淡出）
  buildGhosts(model) {
    this.ghostSrcNodes = [];
    model.traverse((o) => this.ghostSrcNodes.push(o));

    for (let i = 0; i < GHOST_COUNT; i++) {
      const root = cloneSkinned(model);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffb84d,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const nodes = [];
      root.traverse((o) => {
        nodes.push(o);
        if (o.isMesh) {
          o.material = mat;
          o.castShadow = false;
          o.receiveShadow = false;
        }
      });
      root.visible = false;
      this.scene.add(root);
      this.ghosts.push({ root, nodes, mat, life: 0 });
    }
  }

  // 取出池中最舊的殘影，套用當前姿勢後放在原地淡出
  spawnGhost() {
    let g = this.ghosts[0];
    for (const c of this.ghosts) if (c.life < g.life) g = c;

    // 殘影掛在場景根層，直接取模型的世界矩陣定位
    this.model.matrixWorld.decompose(g.root.position, g.root.quaternion, g.root.scale);
    for (let i = 1; i < g.nodes.length; i++) {
      const src = this.ghostSrcNodes[i];
      const dst = g.nodes[i];
      dst.position.copy(src.position);
      dst.quaternion.copy(src.quaternion);
      dst.scale.copy(src.scale);
    }
    g.life = GHOST_LIFE;
    g.mat.opacity = 0.4;
    g.root.visible = true;
  }

  // 足下塵光：拖在衝刺方向的後方
  spawnDust() {
    const back = new THREE.Vector3(-Math.sin(this.facing), 0, -Math.cos(this.facing));
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(DUST_GEO, DUST_MAT);
      m.position.copy(this.mesh.position);
      m.position.x += (Math.random() - 0.5) * 0.8;
      m.position.z += (Math.random() - 0.5) * 0.8;
      m.position.y = 0.25 + Math.random() * 0.9;
      const v = back.clone().multiplyScalar(2 + Math.random() * 3);
      v.x += (Math.random() - 0.5) * 1.5;
      v.z += (Math.random() - 0.5) * 1.5;
      v.y = 0.4 + Math.random() * 0.8;
      this.scene.add(m);
      this.dust.push({ mesh: m, v, life: DUST_LIFE });
    }
  }

  // 衝刺特效：衝刺中持續產生殘影與塵光，並更新既有粒子的淡出
  updateSprintFx(dt, sprinting) {
    if (sprinting) {
      this.ghostTimer -= dt;
      if (this.ghostTimer <= 0 && this.ghosts.length > 0) {
        this.ghostTimer = GHOST_INTERVAL;
        this.spawnGhost();
      }
      this.dustTimer -= dt;
      if (this.dustTimer <= 0) {
        this.dustTimer = 0.05;
        this.spawnDust();
      }
    } else {
      this.ghostTimer = 0;
      this.dustTimer = 0;
    }

    for (const g of this.ghosts) {
      if (g.life <= 0) continue;
      g.life -= dt;
      if (g.life <= 0) {
        g.root.visible = false;
        g.mat.opacity = 0;
      } else {
        g.mat.opacity = (g.life / GHOST_LIFE) * 0.4;
      }
    }

    for (let i = this.dust.length - 1; i >= 0; i--) {
      const p = this.dust[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.dust.splice(i, 1);
        continue;
      }
      p.mesh.position.addScaledVector(p.v, dt);
      p.v.y += 2.5 * dt;   // 塵光輕微上飄
      p.mesh.scale.setScalar(0.5 + (p.life / DUST_LIFE) * 0.9);
    }
  }

  // 鎖定紅圈跟著目前目標腳下轉動
  updateTargetRing(dt) {
    const t = this.target;
    if (!t || t.dead || t.removed) {
      this.targetRing.visible = false;
      return;
    }
    this.targetRing.visible = true;
    this.targetRing.position.set(t.mesh.position.x, 0.05, t.mesh.position.z);
    this.targetRing.rotation.y += dt * 2.0;
    this.targetRing.scale.setScalar(Math.max(1, t.radius));
    this.targetRingMat.opacity = 0.4 + (Math.sin(this.haloTime * 4) + 1) * 0.12;
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

  // cmd: { auto: bool }
  update(dt, cmd) {
    if (this.mixer) this.mixer.update(dt);
    this.haloTime += dt;
    this.haloArcs.rotation.y += dt * 1.5;    // 掃光弧順向
    this.haloInner.rotation.y -= dt * 1.1;   // 內環逆向
    const pulse = (Math.sin(this.haloTime * 2.4) + 1) * 0.5;
    this.haloBaseMaterial.opacity = 0.4 + pulse * 0.14;
    this.haloArcMaterial.opacity = 0.55 + pulse * 0.22;
    this.haloInnerMaterial.opacity = 0.32 + pulse * 0.14;
    if (!this.ready) return;            // 模型尚未載入

    this.holdTimer = Math.max(0, this.holdTimer - dt);
    this.ultLock = Math.max(0, this.ultLock - dt);

    // 目標決策：玩家點選的敵人永遠優先；自動模式撿離自己最近的；否則收兵回原位。
    // 目標死亡或離場時清除，讓下一幀重新選擇（自動）或返回原位（手動）。
    if (this.selected && (this.selected.dead || this.selected.removed)) this.selected = null;
    if (this.target && (this.target.dead || this.target.removed)) this.target = null;
    if (this.selected) {
      this.target = this.selected;
    } else if (cmd.auto) {
      if (!this.target) this.target = this.enemyMgr.nearest(this.mesh.position);
    } else {
      this.target = null;
    }

    const hunting = !!this.target;
    const dest = hunting ? this.target.mesh.position : this.home;

    const dx = dest.x - this.mesh.position.x;
    const dz = dest.z - this.mesh.position.z;
    const dist = Math.hypot(dx, dz) || 0.0001;
    const stopDist = hunting ? this.meleeRange : 0.2;

    // 衝刺判定（帶遲滯）：只有距離目標夠遠（換目標 / 目標跑遠）才觸發衝刺，
    // 衝到貼身後解除；近身跟著敵人移動攻擊時用一般速度、不出殘影。
    if (!hunting) {
      this.dashing = false;
    } else if (dist > DASH_TRIGGER_DIST) {
      this.dashing = true;
    } else if (dist <= stopDist + 0.3) {
      this.dashing = false;
    }

    // 移動：衝刺時全速，其餘（貼身跟隨、收兵回原位）用一般速度
    if (dist > stopDist) {
      const speed = this.dashing ? this.sprintSpeed : this.speed;
      const step = Math.min(speed * dt, dist - stopDist);
      this.mesh.position.x += (dx / dist) * step;
      this.mesh.position.z += (dz / dist) * step;
      this.facing = Math.atan2(dx, dz);
    } else if (hunting) {
      this.facing = Math.atan2(dx, dz);
    }
    this.mesh.rotation.y = this.facing;

    this.updateSprintFx(dt, this.dashing && dist > stopDist);
    this.updateTargetRing(dt);

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
        this.selected = null;
      }
      if (this.target && this.target.dead) this.target = null;
    }

    // 沒有一次性動作在播放時，回到待機（移動時亦用 idle，無專屬走路動作）
    if (this.holdTimer <= 0) this.play('idle');
  }
}
