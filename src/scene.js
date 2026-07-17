import * as THREE from 'three';
import { FIELD } from './config.js';

// 虎牢關戰場場景 ------------------------------------------------
// 以幾片 Plane + 幾何模型 + ambientCG 的 CC0 PBR 貼圖組成逼真的關隘：
// 石板道、碎石地、兩側岩石群（中段留通道）、虎牢關城牆與城樓、木製關門、烽火盆與旗幟。

THREE.Cache.enabled = true; // 讓同一張貼圖只下載一次

const loader = new THREE.TextureLoader();
let MAX_ANISO = 8;

// 佈局常數（世界座標，-Z 為戰場遠方）
const GATE_Z = -30;      // 關門所在縱深
const WALL_H = 9;        // 城牆高
const WALL_THICK = 4;    // 城牆厚
const WALL_HALF_W = 44;  // 城牆左右各延伸
const GATE_W = 11;       // 關門洞寬
const GATE_H = 7.2;      // 關門洞高

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // 裝置像素比上限 1.5：高 DPI 螢幕不需渲染 2x 的像素量，這是最大的效能來源之一
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // 比 PCFSoft 便宜
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  MAX_ANISO = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  // 遠方霧氣與天色相融，營造關隘的縱深
  scene.fog = new THREE.Fog(0xbfae90, 46, 120);
  scene.background = makeSkyTexture();

  // 攝影機：俯視戰場的斜角
  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 17, 20);
  camera.lookAt(0, 2, -8);

  addLights(scene);

  buildGround(scene);
  buildCliffs(scene);
  buildPass(scene);
  buildProps(scene);

  return { renderer, scene, camera };
}

// ---------- 貼圖載入 ----------
function loadTex(url, repeatX = 1, repeatY = 1, srgb = false) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = MAX_ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 建立 PBR 材質（color + normal + roughness）
function pbrMat(slot, rx, ry, extra = {}) {
  return new THREE.MeshStandardMaterial({
    map: loadTex(`textures/${slot}/color.jpg`, rx, ry, true),
    normalMap: loadTex(`textures/${slot}/normal.jpg`, rx, ry),
    roughnessMap: loadTex(`textures/${slot}/rough.jpg`, rx, ry),
    ...extra,
  });
}

// ---------- 燈光（黃昏戰場光）----------
function addLights(scene) {
  scene.add(new THREE.AmbientLight(0xdcd2c0, 0.7));

  const sun = new THREE.DirectionalLight(0xffdca0, 1.5);
  sun.position.set(-26, 34, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);            // 2048→1024，陰影 pass 便宜許多
  const s = sun.shadow.camera;
  s.left = -40; s.right = 40; s.top = 40; s.bottom = -40; // 收緊到戰場範圍
  s.near = 1; s.far = 120;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // 冷色補光讓陰影不死黑（不投影）
  const fill = new THREE.DirectionalLight(0x8fb0e0, 0.35);
  fill.position.set(20, 14, -24);
  scene.add(fill);
}

// ---------- 天空（漸層 + 太陽 + 雲 + 遠山剪影）----------
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');

  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#5b7fb0');
  sky.addColorStop(0.45, '#9fb4c8');
  sky.addColorStop(0.72, '#e7d7b6');
  sky.addColorStop(1, '#efe0c0');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);

  // 太陽光暈
  const sun = g.createRadialGradient(300, 150, 10, 300, 150, 220);
  sun.addColorStop(0, 'rgba(255,244,214,0.95)');
  sun.addColorStop(0.3, 'rgba(255,232,180,0.55)');
  sun.addColorStop(1, 'rgba(255,232,180,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, 1024, 400);

  // 雲層
  g.globalAlpha = 0.9;
  for (let i = 0; i < 26; i++) {
    const x = (i * 173) % 1024;
    const y = 40 + (i * 71) % 230;
    const w = 90 + (i * 53) % 160;
    const h = 22 + (i * 29) % 34;
    const cloud = g.createRadialGradient(x, y, 4, x, y, w);
    const a = 0.16 + ((i * 37) % 30) / 160;
    cloud.addColorStop(0, `rgba(255,255,255,${a})`);
    cloud.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cloud;
    g.beginPath();
    g.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // 遠山剪影
  drawRidge(g, 360, 'rgba(120,132,148,0.6)', 55);
  drawRidge(g, 392, 'rgba(96,108,124,0.75)', 80);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawRidge(g, baseY, color, height) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, baseY);
  let x = 0;
  while (x < 1024) {
    const w = 130 + (x % 3) * 46;
    const h = height * (0.55 + ((x * 13) % 42) / 100);
    g.lineTo(x + w / 2, baseY - h);
    g.lineTo(x + w, baseY);
    x += w;
  }
  g.lineTo(1024, 512); g.lineTo(0, 512); g.closePath(); g.fill();
}

// ---------- 地面：碎石地 + 中央石板道 ----------
function buildGround(scene) {
  const groundMat = pbrMat('ground', 36, 36, { roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -18);
  ground.receiveShadow = true;
  scene.add(ground);

  // 通往關門的石板道
  const roadMat = pbrMat('road', 3, 16, { roughness: 0.95 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(13, 78), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, GATE_Z + 34);
  road.receiveShadow = true;
  scene.add(road);
}

// ---------- 兩側岩石：前後各一組岩石群，中段留出小兵進場的通道 ----------
function buildCliffs(scene) {
  const rockMat = pbrMat('cliff', 3, 3, { roughness: 1 });
  const boulderMat = pbrMat('cliff', 1.4, 1.4, { roughness: 1 });

  // 小兵從左右邊界橫向行軍進場（活動縱深 z ∈ [FIELD.minZ, FIELD.maxZ]），
  // 這條縱深帶的兩側完全不放岩石，只在後方（靠城牆）與前方（靠鏡頭）各堆一組，
  // 讓側面留出看得見的通道。
  for (const side of [-1, 1]) {
    const group = new THREE.Group();
    const blocks = [
      // 後組：接住城牆兩端、擋住牆後空景
      { x: 34, y: 7, z: -31, w: 18, h: 24, d: 14, rx: 0.05, rz: -0.12 },
      { x: 27, y: 4, z: -37, w: 14, h: 16, d: 14, rx: 0.1,  rz: -0.2 },
      // 前組：框住畫面邊緣，不伸入通道
      { x: 35, y: 8, z: 11,  w: 18, h: 26, d: 18, rx: 0.02, rz: -0.08 },
      { x: 28, y: 3, z: 6,   w: 12, h: 12, d: 9,  rx: 0.08, rz: -0.16 },
    ];
    for (const b of blocks) {
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d, 2, 2, 2);
      jitter(geo, 1.1);
      const m = new THREE.Mesh(geo, rockMat);
      m.position.set(side * b.x, b.y, b.z);
      m.rotation.set(b.rx, side * 0.15, side * b.rz);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
    }
    // 散落的巨石：點綴通道口兩旁與遠處，不踩進小兵的行軍帶
    const boulders = [
      { x: 24, z: 3,   r: 2.2 },
      { x: 30, z: 1.5, r: 1.5 },
      { x: 23, z: -24, r: 1.8 },
      { x: 29, z: -26, r: 2.4 },
      { x: 43, z: -11, r: 3.2 }, // 通道遠端的孤石，暗示路往場外延伸
    ];
    boulders.forEach((b, i) => {
      const geo = new THREE.IcosahedronGeometry(b.r, 1);
      jitter(geo, b.r * 0.28);
      const rock = new THREE.Mesh(geo, boulderMat);
      rock.position.set(side * b.x, b.r * 0.6, b.z);
      rock.rotation.set(i, i * 1.3, i * 0.7);
      rock.castShadow = rock.receiveShadow = true;
      group.add(rock);
    });
    scene.add(group);
  }
}

// 讓石塊表面凹凸不規則。位移量是「頂點座標的連續函數」，
// 因此重合的頂點（BoxGeometry 邊緣、Icosahedron 面接縫）會得到相同位移，
// 不會被扯裂出裂縫。
function jitter(geo, amt) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n =
      Math.sin(v.x * 1.7 + v.y * 2.3) +
      Math.sin(v.y * 1.3 + v.z * 1.9) +
      Math.sin(v.z * 2.1 + v.x * 1.1);
    const d = (n / 3) * amt;
    const len = v.length() || 1;
    p.setXYZ(i, v.x + (v.x / len) * d, v.y + (v.y / len) * d, v.z + (v.z / len) * d);
  }
  geo.computeVertexNormals();
}

// ---------- 虎牢關城牆 + 關門 + 城樓 ----------
function buildPass(scene) {
  const wallMat = pbrMat('wall', 8, 2.4, { roughness: 0.95 });
  const wallMatV = pbrMat('wall', 2.4, 2.4, { roughness: 0.95 });
  const woodMat = pbrMat('wood', 2, 3, { roughness: 0.9 });
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0x35302a, roughness: 1 });

  const pass = new THREE.Group();
  pass.position.z = GATE_Z;

  // 左右兩段城牆（中間留出關門洞）
  const segW = WALL_HALF_W - GATE_W / 2;
  for (const side of [-1, 1]) {
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(segW, WALL_H, WALL_THICK),
      wallMat
    );
    seg.position.set(side * (GATE_W / 2 + segW / 2), WALL_H / 2, 0);
    seg.castShadow = seg.receiveShadow = true;
    pass.add(seg);
  }

  // 關門上方的橫楣（門洞頂到城牆頂之間的石材）
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(GATE_W + 1.5, WALL_H - GATE_H, WALL_THICK),
    wallMatV
  );
  lintel.position.set(0, GATE_H + (WALL_H - GATE_H) / 2, 0);
  lintel.castShadow = lintel.receiveShadow = true;
  pass.add(lintel);

  // 拱門（半圓石拱）
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(GATE_W / 2, 0.7, 10, 24, Math.PI),
    wallMatV
  );
  arch.position.set(0, GATE_H, WALL_THICK / 2);
  arch.castShadow = true;
  pass.add(arch);

  // 門洞內的陰影通道
  const tunnel = new THREE.Mesh(
    new THREE.BoxGeometry(GATE_W, GATE_H, WALL_THICK + 0.4),
    stoneDark
  );
  tunnel.position.set(0, GATE_H / 2, 0);
  pass.add(tunnel);

  // 木製關門（雙扇，微開）
  for (const side of [-1, 1]) {
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(GATE_W / 2 - 0.15, GATE_H - 0.3, 0.4),
      woodMat
    );
    door.position.set(side * (GATE_W / 4), (GATE_H - 0.3) / 2, WALL_THICK / 2 - 0.3);
    door.rotation.y = side * 0.12;
    door.castShadow = true;
    // 門釘
    addDoorStuds(door, GATE_W / 2 - 0.15, GATE_H - 0.3);
    pass.add(door);
  }

  // 城垛（垛口）
  buildBattlements(pass, wallMatV);

  // 城樓（門樓）
  buildGateTower(pass, wallMatV, woodMat);

  // 虎牢關匾額
  pass.add(makePlaque('虎牢關'));

  scene.add(pass);
}

function addDoorStuds(door, w, h) {
  const studMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.8, roughness: 0.4 });
  const geo = new THREE.SphereGeometry(0.12, 8, 8);
  for (let ix = -1; ix <= 1; ix++) {
    for (let iy = -2; iy <= 2; iy++) {
      const s = new THREE.Mesh(geo, studMat);
      s.position.set(ix * (w / 3), iy * (h / 5.5), 0.22);
      door.add(s);
    }
  }
}

function buildBattlements(pass, mat) {
  const bw = 2.0, gap = 1.2;
  const step = bw + gap;
  const count = Math.floor((WALL_HALF_W * 2) / step);
  const startX = -count * step / 2 + bw / 2;
  for (let i = 0; i < count; i++) {
    const x = startX + i * step;
    if (Math.abs(x) < GATE_W / 2 + 1) continue; // 關門正上方留空
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, 1.5, WALL_THICK * 0.7), mat);
    m.position.set(x, WALL_H + 0.75, 0);
    m.castShadow = true;
    pass.add(m);
  }
}

function buildGateTower(pass, wallMat, woodMat) {
  const tower = new THREE.Group();
  tower.position.set(0, WALL_H + 0.4, 0);

  const baseW = 18, baseD = 7, baseH = 1.2;
  const platform = new THREE.Mesh(new THREE.BoxGeometry(baseW, baseH, baseD), wallMat);
  platform.position.y = baseH / 2;
  platform.castShadow = platform.receiveShadow = true;
  tower.add(platform);

  // 樓身 + 木柱
  const bodyH = 4.2;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(baseW - 3, bodyH, baseD - 2),
    new THREE.MeshStandardMaterial({ color: 0x7a3020, roughness: 0.85 })
  );
  body.position.y = baseH + bodyH / 2;
  body.castShadow = true;
  tower.add(body);

  const pillarMat = woodMat;
  for (const px of [-1, 1]) {
    for (const pz of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, bodyH + 0.4, 10), pillarMat);
      pillar.position.set(px * (baseW / 2 - 1.2), baseH + bodyH / 2, pz * (baseD / 2 - 1));
      pillar.castShadow = true;
      tower.add(pillar);
    }
  }

  // 中式屋頂（雙層飛簷）
  tower.add(makeRoof(baseW + 4, baseD + 3.5, baseH + bodyH, 2.4));
  tower.add(makeRoof(baseW - 1, baseD - 0.5, baseH + bodyH + 2.6, 1.8));

  pass.add(tower);
}

// 中式廡殿頂：低矮四坡 + 反翹屋簷角
function makeRoof(w, d, y, h) {
  const g = new THREE.Group();
  const tileMat = new THREE.MeshStandardMaterial({ color: 0x2b3550, roughness: 0.6, metalness: 0.1 });

  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, h, 4), tileMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  roof.position.y = y + h / 2;
  roof.castShadow = true;
  g.add(roof);

  // 屋脊寶頂
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xffcf3a, metalness: 0.8, roughness: 0.3 })
  );
  knob.position.y = y + h + 0.2;
  g.add(knob);

  // 四角反翹
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const eave = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 4), tileMat);
      eave.position.set(sx * w * 0.42, y + 0.2, sz * d * 0.42);
      eave.rotation.z = sx * -0.7;
      eave.rotation.x = sz * 0.7;
      g.add(eave);
    }
  }
  return g;
}

// 匾額「虎牢關」
function makePlaque(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 192;
  const ctx = c.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, 0, 192);
  grd.addColorStop(0, '#3a1c10'); grd.addColorStop(1, '#22120a');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = '#e0b040'; ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, 492, 172);
  ctx.fillStyle = '#f0d38a';
  ctx.font = 'bold 118px "Microsoft JhengHei", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 104);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(6, 2.2, 0.4),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })
  );
  board.position.set(0, GATE_H + 1.6, WALL_THICK / 2 + 0.1);
  board.castShadow = true;
  return board;
}

// ---------- 場景道具：烽火盆 + 三國旗幟 + 拒馬 ----------
function buildProps(scene) {
  // 關門兩側烽火盆
  for (const x of [-GATE_W / 2 - 3, GATE_W / 2 + 3]) {
    scene.add(makeBrazier(x, GATE_Z + 4));
  }

  // 通道旁的三國旗幟
  const flags = [
    { char: '魏', color: '#2a5bb2', x: -20 },
    { char: '蜀', color: '#b23a2a', x: -12 },
    { char: '吳', color: '#2a9a5b', x: 12 },
    { char: '呂', color: '#6a2ac0', x: 20 },
  ];
  for (const f of flags) {
    const banner = makeBanner(f.char, f.color);
    banner.position.set(f.x, 0, FIELD.minZ - 4);
    scene.add(banner);
  }

  // 木製拒馬（戰場障礙）
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    const chevaux = makeChevalDeFrise();
    chevaux.position.set(side * (16 + (i % 3) * 3), 0, GATE_Z + 12 + (i % 3) * 5);
    chevaux.rotation.y = side * 0.4;
    scene.add(chevaux);
  }
}

const fireLights = [];
function makeBrazier(x, z) {
  const g = new THREE.Group();
  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.28, 2.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.6, roughness: 0.5 })
  );
  stand.position.y = 1.2;
  stand.castShadow = true;
  g.add(stand);

  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.5, 0.7, 12),
    new THREE.MeshStandardMaterial({ color: 0x3a3a40, metalness: 0.7, roughness: 0.4 })
  );
  bowl.position.y = 2.6;
  g.add(bowl);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.6, 1.6, 10),
    new THREE.MeshBasicMaterial({ color: 0xff8a2a })
  );
  flame.position.y = 3.6;
  g.add(flame);

  // 只保留自發光火焰（不放 PointLight，避免每個片元多算一盞燈的成本）
  fireLights.push({ flame, phase: Math.random() * 6 });

  g.position.set(x, 0, z);
  return g;
}

function makeBanner(char, color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a2a12, roughness: 1 })
  );
  pole.position.y = 4;
  pole.castShadow = true;
  g.add(pole);

  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, 128, 256);
  ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 116, 244);
  ctx.fillStyle = '#ffe9b0';
  ctx.font = 'bold 120px "Microsoft JhengHei", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(char, 64, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 4.4),
    new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 })
  );
  flag.position.set(1.4, 5.4, 0);
  g.add(flag);
  return g;
}

function makeChevalDeFrise() {
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3f22, roughness: 1 });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4, 6), woodMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.y = 1.3;
  beam.castShadow = true;
  g.add(beam);
  for (let i = -1; i <= 1; i++) {
    const spikeA = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 2.6, 6), woodMat);
    spikeA.position.set(i * 1.2, 1.3, 0);
    spikeA.rotation.x = 0.9;
    spikeA.castShadow = true;
    g.add(spikeA);
    const spikeB = spikeA.clone();
    spikeB.rotation.x = -0.9;
    g.add(spikeB);
  }
  return g;
}

// 讓烽火盆火焰閃動（由 main 的迴圈呼叫）
export function updateSceneFx(dt, t) {
  for (const f of fireLights) {
    f.flame.scale.y = 0.9 + Math.sin(t * 12 + f.phase) * 0.15;
    f.flame.rotation.y += dt * 3;
  }
}
