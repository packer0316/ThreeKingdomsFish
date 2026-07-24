import * as THREE from 'three';
import {
  BatchedRenderer, ParticleSystem, RenderMode,
  PointEmitter, SphereEmitter,
  ConstantValue, IntervalValue, ConstantColor, Gradient,
  ColorOverLife, SizeOverLife, RotationOverLife, ApplyForce,
  PiecewiseBezier, Bezier,
  Vector3 as QV3, Vector4 as QV4,
} from 'three.quarks';

// 擊中粒子特效（three.quarks）------------------------------------
// 一次擊中 = 五層疊加：閃光、衝擊環、飛濺火星（拉伸）、餘燼光點、塵煙。
// 全部系統開場即建好放進物件池，擊中時只搬 emitter 位置 + restart()，
// 不做任何執行期配置；相同材質的系統由 BatchedRenderer 合批，
// 整套特效的繪製成本固定為 3 個 draw call（加法 2 種貼圖 + 塵煙）。

const POOL_SIZE = 24;   // 同時在演的擊中特效上限（超過時回收最舊的一發）

// ---------- 程序化貼圖 ----------
function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 柔光點：白熱核心 → 透明（閃光、火星、餘燼共用）
function makeGlowTexture() {
  return canvasTexture(64, (g, S) => {
    const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.9)');
    r.addColorStop(0.6, 'rgba(255,255,255,0.25)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, S, S);
  });
}

// 衝擊環：細亮圓環、內外緣柔化
function makeRingTexture() {
  return canvasTexture(128, (g, S) => {
    const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    r.addColorStop(0.55, 'rgba(255,255,255,0)');
    r.addColorStop(0.72, 'rgba(255,255,255,0.9)');
    r.addColorStop(0.8, 'rgba(255,255,255,1)');
    r.addColorStop(0.9, 'rgba(255,255,255,0.35)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, S, S);
  });
}

// 塵煙：多個柔緣圓斑疊出的不規則棉絮
function makeSmokeTexture() {
  return canvasTexture(128, (g, S) => {
    const blobs = [
      [0.5, 0.5, 0.42, 0.5], [0.34, 0.42, 0.26, 0.4], [0.66, 0.44, 0.24, 0.38],
      [0.44, 0.64, 0.25, 0.36], [0.6, 0.62, 0.22, 0.34], [0.5, 0.34, 0.2, 0.3],
    ];
    for (const [x, y, rad, a] of blobs) {
      const r = g.createRadialGradient(x * S, y * S, 0, x * S, y * S, rad * S);
      r.addColorStop(0, `rgba(255,255,255,${a})`);
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, S, S);
    }
  });
}

// ---------- 共用材質（材質相同的系統會被合批）----------
function additiveMat(map) {
  return new THREE.MeshBasicMaterial({
    map, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
}

// ---------- 單發擊中特效（五個粒子系統為一組）----------
function buildHitInstance(shared) {
  const { glowMat, ringMat, smokeMat } = shared;

  // 1) 中心閃光：一瞬白金亮斑
  const flash = new ParticleSystem({
    duration: 0.3, looping: false, worldSpace: true,
    startLife: new ConstantValue(0.14),
    startSpeed: new ConstantValue(0),
    startSize: new IntervalValue(1.6, 2.1),
    startColor: new ConstantColor(new QV4(1, 0.92, 0.6, 1)),
    emissionOverTime: new ConstantValue(0),
    emissionBursts: [{ time: 0, count: new ConstantValue(1), cycle: 1, interval: 1, probability: 1 }],
    shape: new PointEmitter(),
    material: glowMat,
    renderMode: RenderMode.BillBoard,
    renderOrder: 2,
  });
  flash.addBehavior(new ColorOverLife(new Gradient(
    [[new QV3(1, 1, 1), 0], [new QV3(1, 0.75, 0.3), 1]],
    [[1, 0], [0, 1]]
  )));
  flash.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.6, 1, 1, 0.75), 0]])));

  // 2) 衝擊環：面向鏡頭快速擴散的金色光圈
  const ring = new ParticleSystem({
    duration: 0.4, looping: false, worldSpace: true,
    startLife: new ConstantValue(0.3),
    startSpeed: new ConstantValue(0),
    startSize: new ConstantValue(3.2),
    startColor: new ConstantColor(new QV4(1, 0.85, 0.45, 0.9)),
    emissionOverTime: new ConstantValue(0),
    emissionBursts: [{ time: 0, count: new ConstantValue(1), cycle: 1, interval: 1, probability: 1 }],
    shape: new PointEmitter(),
    material: ringMat,
    renderMode: RenderMode.BillBoard,
    renderOrder: 2,
  });
  ring.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.12, 0.7, 0.95, 1), 0]])));
  ring.addBehavior(new ColorOverLife(new Gradient(
    [[new QV3(1, 0.9, 0.55), 0], [new QV3(1, 0.5, 0.15), 1]],
    [[0.9, 0], [0.9, 0.4], [0, 1]]
  )));

  // 3) 飛濺火星：沿速度方向拉伸的高速亮條，受重力下墜
  const sparks = new ParticleSystem({
    duration: 0.7, looping: false, worldSpace: true,
    startLife: new IntervalValue(0.25, 0.5),
    startSpeed: new IntervalValue(5, 13),
    startSize: new IntervalValue(0.1, 0.22),
    startColor: new ConstantColor(new QV4(1, 1, 1, 1)),
    emissionOverTime: new ConstantValue(0),
    emissionBursts: [{ time: 0, count: new ConstantValue(16), cycle: 1, interval: 1, probability: 1 }],
    shape: new SphereEmitter({ radius: 0.08 }),
    material: glowMat,
    renderMode: RenderMode.StretchedBillBoard,
    rendererEmitterSettings: { speedFactor: 0.045, lengthFactor: 2.2 },
    renderOrder: 2,
  });
  sparks.addBehavior(new ApplyForce(new QV3(0, -1, 0), new ConstantValue(26)));
  sparks.addBehavior(new ColorOverLife(new Gradient(
    [[new QV3(1, 1, 0.9), 0], [new QV3(1, 0.72, 0.2), 0.35], [new QV3(0.9, 0.22, 0.03), 1]],
    [[1, 0], [1, 0.7], [0, 1]]
  )));
  sparks.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.85, 0.5, 0.1), 0]])));

  // 4) 餘燼光點：較慢的漂浮小亮點，收尾的火紅殘光
  const embers = new ParticleSystem({
    duration: 1.1, looping: false, worldSpace: true,
    startLife: new IntervalValue(0.45, 0.9),
    startSpeed: new IntervalValue(1.2, 4),
    startSize: new IntervalValue(0.05, 0.13),
    startColor: new ConstantColor(new QV4(1, 0.8, 0.35, 1)),
    emissionOverTime: new ConstantValue(0),
    emissionBursts: [{ time: 0, count: new ConstantValue(10), cycle: 1, interval: 1, probability: 1 }],
    shape: new SphereEmitter({ radius: 0.15 }),
    material: glowMat,
    renderMode: RenderMode.BillBoard,
    renderOrder: 2,
  });
  embers.addBehavior(new ApplyForce(new QV3(0, -1, 0), new ConstantValue(7)));
  embers.addBehavior(new ColorOverLife(new Gradient(
    [[new QV3(1, 0.85, 0.4), 0], [new QV3(0.95, 0.3, 0.05), 1]],
    [[1, 0], [0.9, 0.55], [0, 1]]
  )));
  embers.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.9, 0.55, 0), 0]])));

  // 5) 塵煙：一小蓬旋轉擴散的暗棕塵霧，給爆點量體感
  const smoke = new ParticleSystem({
    duration: 1.0, looping: false, worldSpace: true,
    startLife: new IntervalValue(0.45, 0.75),
    startSpeed: new IntervalValue(0.6, 1.6),
    startSize: new IntervalValue(0.55, 0.95),
    startRotation: new IntervalValue(0, Math.PI * 2),
    startColor: new ConstantColor(new QV4(0.32, 0.26, 0.2, 0.4)),
    emissionOverTime: new ConstantValue(0),
    emissionBursts: [{ time: 0, count: new ConstantValue(4), cycle: 1, interval: 1, probability: 1 }],
    shape: new SphereEmitter({ radius: 0.12 }),
    material: smokeMat,
    renderMode: RenderMode.BillBoard,
    renderOrder: 1,
  });
  smoke.addBehavior(new ApplyForce(new QV3(0, 1, 0), new ConstantValue(2.2)));
  smoke.addBehavior(new RotationOverLife(new IntervalValue(-1.6, 1.6)));
  smoke.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.5, 0.9, 1, 1), 0]])));
  smoke.addBehavior(new ColorOverLife(new Gradient(
    [[new QV3(0.4, 0.33, 0.26), 0], [new QV3(0.22, 0.19, 0.16), 1]],
    [[0.5, 0], [0.35, 0.4], [0, 1]]
  )));

  return [flash, ring, sparks, embers, smoke];
}

export class HitFX {
  constructor(scene) {
    this.batch = new BatchedRenderer();
    scene.add(this.batch);

    const shared = {
      glowMat: additiveMat(makeGlowTexture()),
      ringMat: additiveMat(makeRingTexture()),
      smokeMat: new THREE.MeshBasicMaterial({
        map: makeSmokeTexture(), transparent: true, depthWrite: false,
      }),
    };

    // 物件池：全部系統先建好、先播完（time 停在尾端不再產粒子）
    this.pool = [];
    this.next = 0;
    for (let i = 0; i < POOL_SIZE; i++) {
      const systems = buildHitInstance(shared);
      for (const s of systems) {
        this.batch.addSystem(s);
        scene.add(s.emitter);
        s.stop();   // 建好即停，等第一次擊中再播
      }
      this.pool.push(systems);
    }
  }

  // 在世界座標 pos 播放一發擊中特效；scale 可放大重擊（如 Boss）
  spawn(pos, scale = 1) {
    const systems = this.pool[this.next];
    this.next = (this.next + 1) % POOL_SIZE;
    for (const s of systems) {
      s.emitter.position.copy(pos);
      s.emitter.scale.setScalar(scale);
      s.restart();
      s.play();
    }
  }

  // 每幀推進所有粒子模擬
  update(dt) {
    this.batch.update(dt);
  }

  // 立即清除場上所有粒子（換房重建時用）
  clear() {
    for (const systems of this.pool) {
      for (const s of systems) {
        s.particles.length = 0;
        s.stop();
      }
    }
  }
}
