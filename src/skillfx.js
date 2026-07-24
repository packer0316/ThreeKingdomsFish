import * as THREE from 'three';
import {
  BatchedRenderer, ParticleSystem, RenderMode,
  PointEmitter, SphereEmitter, ConeEmitter, CircleEmitter,
  ConstantValue, IntervalValue, ConstantColor, Gradient,
  ColorOverLife, SizeOverLife, RotationOverLife, OrbitOverLife, ApplyForce,
  PiecewiseBezier, Bezier,
  Vector3 as QV3, Vector4 as QV4,
} from 'three.quarks';

// 技能粒子特效（three.quarks）------------------------------------
// 大招與招募武將法術的視覺層，全部改用 GPU 粒子取代逐幀操作的 mesh：
//   BladeStormFX  關羽「偃月橫掃」— 分層旋出的刀風（有高度/厚度/銳利度）
//   RedStormFX    呂布「千軍萬馬」— 滿場紅色粒子噴發
//   TornadoFX     援軍（法）— 移動的旋風柱
//   LightningFX   援軍（書）— 落雷閃擊
// 同材質＋同渲染模式的系統由共用 BatchedRenderer 合批，繪製成本固定。

let batch = null;
let sceneRef = null;
let M = null;   // 共用材質

// ---------- 程序化貼圖 ----------
function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 柔光點：白熱核心 → 透明
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

// 光環：細亮圓環、內外緣柔化
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

// 刀風彎月：偏心圓相減成月牙，外緣銳利、內側柔化
function makeBladeTexture() {
  return canvasTexture(128, (g, S) => {
    const cx = S / 2, cy = S / 2, R = S * 0.44;
    const grad = g.createRadialGradient(cx, cy, R * 0.3, cx, cy, R);
    grad.addColorStop(0, 'rgba(255,255,255,0.15)');
    grad.addColorStop(0.75, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.96, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    // 挖掉偏移圓 → 月牙形刀刃
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(cx - S * 0.18, cy, R * 0.92, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  });
}

function additiveMat(map) {
  return new THREE.MeshBasicMaterial({
    map, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
}

const burst = (time, count) =>
  ({ time, count: new ConstantValue(count), cycle: 1, interval: 1, probability: 1 });

// ---------- 初始化 / 每幀更新（main.js 呼叫）----------
export function initSkillFX(scene) {
  sceneRef = scene;
  batch = new BatchedRenderer();
  scene.add(batch);
  M = {
    glow: additiveMat(makeGlowTexture()),
    ring: additiveMat(makeRingTexture()),
    blade: additiveMat(makeBladeTexture()),
  };
}

export function updateSkillFX(dt) {
  if (batch) batch.update(dt);
}

// ---------- 效果基底：管理一組粒子系統的掛載與回收 ----------
class FXGroup {
  constructor() {
    this.systems = [];
    this.root = new THREE.Group();
    sceneRef.add(this.root);
  }

  add(sys) {
    batch.addSystem(sys);
    this.root.add(sys.emitter);
    this.systems.push(sys);
    return sys;
  }

  // 掛載定位完成後呼叫：quarks 於發射當下讀 emitter.matrixWorld，
  // 世界矩陣平時只在 render 時刷新，t=0 的爆發若不先手動更新會噴在原點。
  ready() {
    this.root.updateMatrixWorld(true);
  }

  endEmit() {
    for (const s of this.systems) s.endEmit();
  }

  dispose() {
    for (const s of this.systems) batch.deleteSystem(s);
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}

// ---------- 關羽「偃月橫掃」：分層螺旋刀風 ----------
// 三層彎月刀刃在不同高度依序爆出（厚度＋高度），繞中心公轉外擴（螺旋），
// 加一層沿速度拉伸的高速風刃（銳利度）與地面擴散震波環。
export class BladeStormFX extends FXGroup {
  constructor(center) {
    super();
    this.root.position.set(center.x, 0, center.z);

    const LAYERS = [
      { y: 0.45, r: 1.2, count: 24, speed: [12, 17], size: [1.1, 1.7], t: 0 },
      { y: 1.3, r: 0.95, count: 20, speed: [15, 21], size: [0.95, 1.45], t: 0.1 },
      { y: 2.2, r: 0.7, count: 16, speed: [17, 24], size: [0.8, 1.2], t: 0.2 },
    ];
    for (const L of LAYERS) {
      const blades = new ParticleSystem({
        duration: 1.2, looping: false, worldSpace: false,
        startLife: new IntervalValue(0.75, 1.05),
        startSpeed: new IntervalValue(L.speed[0], L.speed[1]),
        startSize: new IntervalValue(L.size[0], L.size[1]),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new ConstantColor(new QV4(0.78, 1, 0.86, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [burst(L.t, L.count)],
        shape: new CircleEmitter({ radius: L.r, thickness: 0.5 }),
        material: M.blade,
        renderMode: RenderMode.BillBoard,
        renderOrder: 2,
      });
      // 公轉（螺旋外擴）＋自轉（刀刃旋切）＋微上升（高度感）
      blades.addBehavior(new OrbitOverLife(new IntervalValue(5, 8), new QV3(0, 0, 1)));
      blades.addBehavior(new RotationOverLife(new IntervalValue(-12, 12)));
      blades.addBehavior(new ApplyForce(new QV3(0, 0, 1), new ConstantValue(1.6)));
      blades.addBehavior(new ColorOverLife(new Gradient(
        [[new QV3(1, 1, 1), 0], [new QV3(0.55, 1, 0.75), 0.4], [new QV3(0.25, 0.8, 0.6), 1]],
        [[1, 0], [0.9, 0.55], [0, 1]]
      )));
      blades.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.65, 1, 1, 0.6), 0]])));
      blades.emitter.rotation.x = -Math.PI / 2;   // 發射圈轉為水平面（徑向外射）
      blades.emitter.position.y = L.y;
      this.add(blades);
    }

    // 高速風刃：拉伸光條純徑向飛出，補刀風的銳利速度感
    const streaks = new ParticleSystem({
      duration: 1.0, looping: false, worldSpace: false,
      startLife: new IntervalValue(0.5, 0.75),
      startSpeed: new IntervalValue(18, 28),
      startSize: new IntervalValue(0.16, 0.3),
      startColor: new ConstantColor(new QV4(0.88, 1, 0.92, 1)),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: [burst(0, 22), burst(0.14, 18)],
      shape: new CircleEmitter({ radius: 0.7, thickness: 0.4 }),
      material: M.glow,
      renderMode: RenderMode.StretchedBillBoard,
      rendererEmitterSettings: { speedFactor: 0.05, lengthFactor: 3 },
      renderOrder: 2,
    });
    streaks.addBehavior(new ColorOverLife(new Gradient(
      [[new QV3(1, 1, 1), 0], [new QV3(0.5, 1, 0.7), 1]],
      [[1, 0], [0, 1]]
    )));
    streaks.emitter.rotation.x = -Math.PI / 2;
    streaks.emitter.position.y = 1.0;
    this.add(streaks);

    // 地面震波環：三道依序擴散到全場
    const rings = new ParticleSystem({
      duration: 1.2, looping: false, worldSpace: false,
      startLife: new ConstantValue(0.6),
      startSpeed: new ConstantValue(0),
      startSize: new IntervalValue(38, 46),
      startColor: new ConstantColor(new QV4(0.7, 1, 0.8, 0.85)),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: [burst(0, 1), burst(0.2, 1), burst(0.4, 1)],
      shape: new PointEmitter(),
      material: M.ring,
      renderMode: RenderMode.HorizontalBillBoard,
      renderOrder: 1,
    });
    rings.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.06, 0.55, 0.9, 1), 0]])));
    rings.addBehavior(new ColorOverLife(new Gradient(
      [[new QV3(0.8, 1, 0.85), 0], [new QV3(0.3, 0.9, 0.6), 1]],
      [[0.85, 0], [0.6, 0.5], [0, 1]]
    )));
    rings.emitter.position.y = 0.12;
    this.add(rings);

    this.ready();
  }
}

// ---------- 呂布「千軍萬馬」：滿場紅色粒子噴發 ----------
// 與天降劍雨的兩波傷害同步，自整片戰場地面向上噴出紅色光條，
// 佐以漂浮餘燼與地面紅光，鋪滿整個畫面。粒子總量約 500，一次性爆發。
export class RedStormFX extends FXGroup {
  constructor(field) {
    super();
    const cx = (field.minX + field.maxX) / 2;
    const cz = (field.minZ + field.maxZ) / 2;
    const R = Math.max(field.maxX - field.minX, field.maxZ - field.minZ) / 2 + 3;
    this.root.position.set(cx, 0, cz);

    // 主體：全場向上噴射的紅色光條（受重力回落如血雨）
    const jets = new ParticleSystem({
      duration: 2.0, looping: false, worldSpace: true,
      startLife: new IntervalValue(0.7, 1.2),
      startSpeed: new IntervalValue(14, 30),
      startSize: new IntervalValue(0.14, 0.3),
      startColor: new ConstantColor(new QV4(1, 0.5, 0.3, 1)),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: [burst(0.45, 180), burst(0.8, 160)],
      shape: new ConeEmitter({ radius: R, angle: 0.3, thickness: 1 }),
      material: M.glow,
      renderMode: RenderMode.StretchedBillBoard,
      rendererEmitterSettings: { speedFactor: 0.05, lengthFactor: 3 },
      renderOrder: 2,
    });
    jets.addBehavior(new ApplyForce(new QV3(0, -1, 0), new ConstantValue(24)));
    jets.addBehavior(new ColorOverLife(new Gradient(
      [[new QV3(1, 0.7, 0.4), 0], [new QV3(1, 0.2, 0.06), 0.45], [new QV3(0.55, 0.03, 0.02), 1]],
      [[1, 0], [1, 0.6], [0, 1]]
    )));
    jets.emitter.rotation.x = -Math.PI / 2;   // 噴射方向轉為朝上
    this.add(jets);

    // 漂浮餘燼：噴發後緩慢飄落的暗紅光點，收尾殘光
    const embers = new ParticleSystem({
      duration: 2.2, looping: false, worldSpace: true,
      startLife: new IntervalValue(1.1, 1.7),
      startSpeed: new IntervalValue(2, 7),
      startSize: new IntervalValue(0.08, 0.22),
      startColor: new ConstantColor(new QV4(1, 0.35, 0.15, 1)),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: [burst(0.5, 90), burst(0.9, 70)],
      shape: new ConeEmitter({ radius: R, angle: 0.5, thickness: 1 }),
      material: M.glow,
      renderMode: RenderMode.BillBoard,
      renderOrder: 2,
    });
    embers.addBehavior(new ApplyForce(new QV3(0, -1, 0), new ConstantValue(3)));
    embers.addBehavior(new ColorOverLife(new Gradient(
      [[new QV3(1, 0.55, 0.25), 0], [new QV3(0.85, 0.12, 0.04), 1]],
      [[1, 0], [0.9, 0.55], [0, 1]]
    )));
    embers.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.9, 0.55, 0), 0]])));
    embers.emitter.rotation.x = -Math.PI / 2;
    this.add(embers);

    // 地面紅光：兩下與噴發同步的全場閃光
    const glowFlash = new ParticleSystem({
      duration: 2.0, looping: false, worldSpace: true,
      startLife: new ConstantValue(0.5),
      startSpeed: new ConstantValue(0),
      startSize: new IntervalValue(55, 65),
      startColor: new ConstantColor(new QV4(1, 0.22, 0.1, 0.45)),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: [burst(0.45, 1), burst(0.8, 1)],
      shape: new PointEmitter(),
      material: M.glow,
      renderMode: RenderMode.HorizontalBillBoard,
      renderOrder: 1,
    });
    glowFlash.addBehavior(new ColorOverLife(new Gradient(
      [[new QV3(1, 0.3, 0.12), 0], [new QV3(0.6, 0.05, 0.02), 1]],
      [[0.5, 0], [0, 1]]
    )));
    glowFlash.emitter.position.y = 0.1;
    this.add(glowFlash);

    this.ready();
  }
}

// ---------- 援軍（法）：移動旋風柱 ----------
// 粒子使用局部空間，整根風柱跟著 root 平移；粒子自底部旋繞上升。
export class TornadoFX extends FXGroup {
  constructor(pos) {
    super();
    this.root.position.copy(pos);

    // 旋繞上升的風柱主體
    const swirl = new ParticleSystem({
      duration: 1, looping: true, worldSpace: false,
      startLife: new IntervalValue(0.5, 0.8),
      startSpeed: new IntervalValue(6, 9),
      startSize: new IntervalValue(0.55, 1.0),
      startColor: new ConstantColor(new QV4(0.82, 0.75, 1, 0.9)),
      emissionOverTime: new ConstantValue(80),
      shape: new ConeEmitter({ radius: 0.45, angle: 0.4, thickness: 1 }),
      material: M.glow,
      renderMode: RenderMode.BillBoard,
      renderOrder: 2,
    });
    swirl.addBehavior(new OrbitOverLife(new IntervalValue(10, 15), new QV3(0, 0, 1)));
    swirl.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.45, 0.9, 1, 1), 0]])));
    swirl.addBehavior(new ColorOverLife(new Gradient(
      [[new QV3(0.95, 0.92, 1), 0], [new QV3(0.62, 0.52, 1), 1]],
      [[0.9, 0], [0.7, 0.5], [0, 1]]
    )));
    swirl.emitter.rotation.x = -Math.PI / 2;   // 沿地面向上發射
    this.add(swirl);

    // 底部旋轉塵環
    const dust = new ParticleSystem({
      duration: 1, looping: true, worldSpace: false,
      startLife: new ConstantValue(0.45),
      startSpeed: new ConstantValue(0),
      startSize: new IntervalValue(2.2, 3.2),
      startColor: new ConstantColor(new QV4(0.72, 0.62, 1, 0.4)),
      emissionOverTime: new ConstantValue(10),
      shape: new PointEmitter(),
      material: M.ring,
      renderMode: RenderMode.HorizontalBillBoard,
      renderOrder: 1,
    });
    dust.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.5, 0.85, 1, 1), 0]])));
    dust.addBehavior(new ColorOverLife(new Gradient(
      [[new QV3(0.72, 0.62, 1), 0], [new QV3(0.5, 0.4, 0.9), 1]],
      [[0.4, 0], [0, 1]]
    )));
    dust.emitter.position.y = 0.08;
    this.add(dust);

    this.ready();
  }
}

// ---------- 援軍（書）：落雷閃擊 ----------
// 一次性：天頂劈下的拉伸光束＋落點閃光＋四散電花＋地面衝擊環。
export class LightningFX extends FXGroup {
  constructor(x, z) {
    super();
    this.root.position.set(x, 0, z);

    // 主雷束：自高空往下的高速拉伸光條
    const bolt = new ParticleSystem({
      duration: 0.3, looping: false, worldSpace: false,
      startLife: new IntervalValue(0.2, 0.28),
      startSpeed: new IntervalValue(32, 44),
      startSize: new IntervalValue(0.25, 0.42),
      startColor: new ConstantColor(new QV4(0.8, 0.93, 1, 1)),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: [burst(0, 10)],
      shape: new ConeEmitter({ radius: 0.35, angle: 0.08, thickness: 1 }),
      material: M.glow,
      renderMode: RenderMode.StretchedBillBoard,
      rendererEmitterSettings: { speedFactor: 0.05, lengthFactor: 3.5 },
      renderOrder: 2,
    });
    bolt.addBehavior(new ColorOverLife(new Gradient(
      [[new QV3(1, 1, 1), 0], [new QV3(0.55, 0.8, 1), 1]],
      [[1, 0], [0, 1]]
    )));
    bolt.emitter.position.y = 8.5;
    bolt.emitter.rotation.x = Math.PI / 2;   // 朝正下方發射
    this.add(bolt);

    // 落點閃光：連閃兩下
    const flash = new ParticleSystem({
      duration: 0.3, looping: false, worldSpace: false,
      startLife: new ConstantValue(0.16),
      startSpeed: new ConstantValue(0),
      startSize: new IntervalValue(2.6, 3.6),
      startColor: new ConstantColor(new QV4(0.9, 0.97, 1, 1)),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: [burst(0, 1), burst(0.08, 1)],
      shape: new PointEmitter(),
      material: M.glow,
      renderMode: RenderMode.BillBoard,
      renderOrder: 2,
    });
    flash.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.7, 1, 1, 0.75), 0]])));
    flash.emitter.position.y = 1.2;
    this.add(flash);

    // 四散電花：受重力墜落的短命亮條
    const sparks = new ParticleSystem({
      duration: 0.5, looping: false, worldSpace: false,
      startLife: new IntervalValue(0.3, 0.5),
      startSpeed: new IntervalValue(6, 13),
      startSize: new IntervalValue(0.1, 0.2),
      startColor: new ConstantColor(new QV4(0.75, 0.9, 1, 1)),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: [burst(0.02, 16)],
      shape: new SphereEmitter({ radius: 0.3 }),
      material: M.glow,
      renderMode: RenderMode.StretchedBillBoard,
      rendererEmitterSettings: { speedFactor: 0.045, lengthFactor: 2.2 },
      renderOrder: 2,
    });
    sparks.addBehavior(new ApplyForce(new QV3(0, -1, 0), new ConstantValue(20)));
    sparks.addBehavior(new ColorOverLife(new Gradient(
      [[new QV3(1, 1, 1), 0], [new QV3(0.4, 0.7, 1), 1]],
      [[1, 0], [0, 1]]
    )));
    sparks.emitter.position.y = 1.0;
    this.add(sparks);

    // 地面衝擊環
    const ring = new ParticleSystem({
      duration: 0.5, looping: false, worldSpace: false,
      startLife: new ConstantValue(0.4),
      startSpeed: new ConstantValue(0),
      startSize: new IntervalValue(7, 9),
      startColor: new ConstantColor(new QV4(0.7, 0.9, 1, 0.85)),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: [burst(0.02, 1)],
      shape: new PointEmitter(),
      material: M.ring,
      renderMode: RenderMode.HorizontalBillBoard,
      renderOrder: 1,
    });
    ring.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.15, 0.7, 0.95, 1), 0]])));
    ring.addBehavior(new ColorOverLife(new Gradient(
      [[new QV3(0.8, 0.95, 1), 0], [new QV3(0.4, 0.7, 1), 1]],
      [[0.85, 0], [0, 1]]
    )));
    ring.emitter.position.y = 0.12;
    this.add(ring);

    this.ready();
  }
}
