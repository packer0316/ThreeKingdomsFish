import * as THREE from 'three';
import { makeGeneralTurret } from './models.js';
import { FIELD, BET_LEVELS, GENERALS } from './config.js';

// 左右兩側的 AI 陪玩玩家 ----------------------------------------
// 各自擁有一座武將砲台，會自動選定敵人、轉向瞄準並連續開火，
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
    this.fireInterval = def.fireInterval || 0.24;
    this.fireCooldown = Math.random() * 0.4;
    this.retargetCooldown = 0;
    this.current = null;                       // 目前鎖定的敵人
    this.target = new THREE.Vector3(def.x, 1.4, -8);

    this.turret = this.buildTurret();
    scene.add(this.turret);

    this.buildSeat(root);
  }

  get bet() { return BET_LEVELS[this.betIndex]; }

  // ---------- 建立側邊砲台 ----------
  buildTurret() {
    const t = makeGeneralTurret(this.general);
    t.position.set(this.def.x, 0, FIELD.turretZ);
    // 側邊玩家整體略朝戰場中央傾斜，看起來像圍著戰場
    t.rotation.y = -Math.sign(this.def.x) * 0.18;

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 1.6, t.userData.muzzleZ);
    t.userData.head.add(muzzle);
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
        `<span class="seat-general">武將・${this.general.name}</span>` +
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

  // ---------- 每幀更新：選目標、瞄準、開火 ----------
  update(dt) {
    this.retargetCooldown -= dt;
    if (!this.current || this.current.dead || this.retargetCooldown <= 0) {
      this.current = this.enemyMgr.nearest(this.turret.position);
      this.retargetCooldown = 0.6 + Math.random() * 0.8;
    }

    if (this.current && !this.current.dead) {
      this.target.copy(this.current.mesh.position).setY(1.4);
    }
    this.aimAt(this.target);

    this.fireCooldown -= dt;
    if (this.current && !this.current.dead && this.fireCooldown <= 0) {
      this.fireCooldown = this.fireInterval * (0.7 + Math.random() * 0.7);
      this.fire();
    }
  }

  aimAt(point) {
    const head = this.turret.userData.head;
    // 扣掉砲台整體的傾斜，讓瞄準角度落在頭部本地座標
    const dx = point.x - this.turret.position.x;
    const dz = point.z - this.turret.position.z;
    head.rotation.y = Math.atan2(-dx, -dz) - this.turret.rotation.y;
  }

  fire() {
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
