import * as THREE from 'three';
import { FIELD } from './config.js';

// 戰場場景（可切換環境）------------------------------------------
// 燈光 / 攝影機常駐；環境（地形、建築、道具）集中放在 envRoot 群組，
// 換場景時整組移除並釋放 GPU 資源，再依 envId 重建：
//   hulao = 虎牢關（石板道、岩壁、城牆城樓、烽火盆）
//   chibi = 赤壁（旗艦甲板戰場、江面、鎖鏈連環船、赤壁崖）
// 貼圖為 ambientCG 的 CC0 PBR 素材；水面波紋為程序化生成。

THREE.Cache.enabled = true; // 讓同一張貼圖只下載一次

const loader = new THREE.TextureLoader();
let MAX_ANISO = 8;

// 虎牢關佈局常數（世界座標，-Z 為戰場遠方）
const GATE_Z = -30;      // 關門所在縱深
const WALL_H = 9;        // 城牆高
const WALL_THICK = 4;    // 城牆厚
const WALL_HALF_W = 44;  // 城牆左右各延伸
const GATE_W = 11;       // 關門洞寬
const GATE_H = 7.2;      // 關門洞高

// 目前環境的根群組與動態特效註冊表（換場景時一併清空）
let envRoot = null;
const envFx = {
  fires: [],     // 烽火盆火焰 { flame, phase }
  waters: [],    // 水面貼圖捲動 { tex }
  bobbers: [],   // 隨浪起伏的船 { obj, baseY, phase, amp }
};

export function createWorld(canvas, envId = 'hulao') {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // 裝置像素比上限 1.5：高 DPI 螢幕不需渲染 2x 的像素量，這是最大的效能來源之一
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // 比 PCFSoft 便宜
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  MAX_ANISO = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();

  // 攝影機：俯視戰場的斜角
  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 17, 20);
  camera.lookAt(0, 2, -8);

  addLights(scene);
  buildEnvironment(scene, envId);

  return { renderer, scene, camera };
}

// 依 envId 重建環境（換房切場景時呼叫；會先拆掉並釋放舊環境）
export function buildEnvironment(scene, envId) {
  if (envRoot) {
    scene.remove(envRoot);
    disposeTree(envRoot);
  }
  if (scene.background && scene.background.dispose) scene.background.dispose();
  envFx.fires.length = 0;
  envFx.waters.length = 0;
  envFx.bobbers.length = 0;

  envRoot = new THREE.Group();
  scene.userData.envId = envId;

  if (envId === 'chibi') {
    scene.fog = new THREE.Fog(0x5a6a80, 50, 150);
    scene.background = makeChibiSky();
    buildChibi(envRoot);
  } else {
    // 遠方霧氣與天色相融，營造關隘的縱深
    scene.fog = new THREE.Fog(0xbfae90, 46, 120);
    scene.background = makeSkyTexture();
    buildGround(envRoot);
    buildCliffs(envRoot);
    buildPass(envRoot);
    buildProps(envRoot);
  }
  scene.add(envRoot);
}

// 釋放整棵環境樹的 GPU 資源（幾何體與材質皆為環境建構時新建，可安全釋放；
// 圖片本體由 THREE.Cache 保留，重建同場景時不需重新下載）
function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k of ['map', 'normalMap', 'roughnessMap']) {
        if (m[k]) m[k].dispose();
      }
      m.dispose();
    }
  });
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

// 程序化筒瓦貼圖：2×2 個瓦壟單元（直向筒瓦圓筒＋橫排交疊陰影），可無縫平鋪。
// 每次呼叫回傳新貼圖（環境拆除時會被 disposeTree 釋放，不可共用快取）。
function makeRoofTileTexture() {
  const S = 128, U = S / 2;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  for (let ry = 0; ry < 2; ry++) {
    for (let cx = 0; cx < 2; cx++) {
      const x0 = cx * U, y0 = ry * U;
      // 板瓦溝（深底）
      g.fillStyle = '#2a334e';
      g.fillRect(x0, y0, U, U);
      // 筒瓦：居中垂直圓筒，兩側漸暗
      const barrel = g.createLinearGradient(x0, 0, x0 + U, 0);
      barrel.addColorStop(0, '#2a334e');
      barrel.addColorStop(0.28, '#47537a');
      barrel.addColorStop(0.5, '#56638e');
      barrel.addColorStop(0.72, '#47537a');
      barrel.addColorStop(1, '#2a334e');
      g.fillStyle = barrel;
      g.fillRect(x0 + 6, y0, U - 12, U);
      // 排與排交疊：下緣深影、上方亮一線
      g.fillStyle = 'rgba(12,16,30,0.8)';
      g.fillRect(x0, y0 + U - 7, U, 7);
      g.fillStyle = 'rgba(150,165,205,0.45)';
      g.fillRect(x0 + 6, y0 + U - 10, U - 12, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAX_ANISO;
  return tex;
}

// 中式廡殿頂：正脊沿長邊的四坡頂（前後坡＋兩端山面）。
// 舊版用壓扁的四面錐體，尖頂落在長方形建物中央，遠看會攤成一片
// 不規則多邊形；改為「脊線」構造後輪廓才是正確的屋頂剪影。
// 坡面貼程序化筒瓦貼圖；另附正脊、四條垂脊、兩端金吻與簷角反翹。
function makeRoof(w, d, y, h) {
  const g = new THREE.Group();
  const tileMat = new THREE.MeshStandardMaterial({
    map: makeRoofTileTexture(),
    roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide,
  });
  const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x232c46, roughness: 0.55 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xffcf3a, metalness: 0.8, roughness: 0.3 });

  // 以脊線沿 X 軸建模；若進深較長則整組轉 90 度
  const along = Math.max(w, d);
  const across = Math.min(w, d);
  const ridgeLen = Math.max(along - across, along * 0.3); // 45 度斜脊；過短時保底
  const rx = ridgeLen / 2, hx = along / 2, hz = across / 2;
  const lift = Math.min(0.45, h * 0.2);                   // 簷角微翹

  // 屋面：兩個脊點 + 四個簷角，圍出 6 個三角形（頂點順序皆為外側逆時針）
  const R1 = [-rx, h, 0], R2 = [rx, h, 0];
  const C1 = [-hx, lift, -hz], C2 = [hx, lift, -hz];
  const C3 = [hx, lift, hz], C4 = [-hx, lift, hz];
  const tris = [
    C2, C1, R1, C2, R1, R2,   // 後坡
    C4, C3, R2, C4, R2, R1,   // 前坡
    C1, C4, R1,               // 左山面
    C3, C2, R2,               // 右山面
  ];
  const pos = new Float32Array(tris.length * 3);
  tris.forEach((v, i) => pos.set(v, i * 3));

  // UV：橫向沿瓦壟（每 1.1 世界單位一個貼圖重複＝兩壟）、縱向沿坡面
  // 距離（每 1.0 一個重複＝兩排瓦）。前 4 個三角形為前後坡（橫向取 x），
  // 後 2 個為山面（橫向取 z），瓦壟才會順著各自的坡向。
  const COL = 1.1, ROW = 1.0;
  const slopeLenZ = Math.hypot(hz, h - lift);
  const slopeLenX = Math.hypot(hx - rx, h - lift);
  const uv = new Float32Array(tris.length * 2);
  tris.forEach((v, i) => {
    const hip = i >= 12;                        // 山面三角形（頂點 12 起）
    const t = (v[1] - lift) / (h - lift);       // 簷口 0 → 脊 1
    uv[i * 2] = (hip ? v[2] : v[0]) / COL;
    uv[i * 2 + 1] = t * (hip ? slopeLenX : slopeLenZ) / ROW;
  });

  const slopeGeo = new THREE.BufferGeometry();
  slopeGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  slopeGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  slopeGeo.computeVertexNormals();
  const slope = new THREE.Mesh(slopeGeo, tileMat);
  slope.castShadow = true;
  g.add(slope);

  // 正脊＋兩端金吻（微微向內捲）
  const beam = new THREE.Mesh(new THREE.BoxGeometry(ridgeLen + 0.5, 0.3, 0.42), ridgeMat);
  beam.position.y = h + 0.1;
  beam.castShadow = true;
  g.add(beam);
  for (const side of [-1, 1]) {
    const finial = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.3), goldMat);
    finial.position.set(side * (ridgeLen / 2 + 0.25), h + 0.22, 0);
    finial.rotation.z = side * 0.3;
    g.add(finial);
  }

  // 四條垂脊（脊端連到簷角）
  const zAxis = new THREE.Vector3(0, 0, 1);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const a = new THREE.Vector3(sx * rx, h + 0.05, 0);
      const b = new THREE.Vector3(sx * hx, lift + 0.05, sz * hz);
      const hip = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.16, a.distanceTo(b)),
        ridgeMat
      );
      hip.position.copy(a).add(b).multiplyScalar(0.5);
      hip.quaternion.setFromUnitVectors(zAxis, b.clone().sub(a).normalize());
      g.add(hip);

      // 簷角反翹
      const eave = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.3, 4), tileMat);
      eave.position.set(sx * (hx - 0.1), lift + 0.2, sz * (hz - 0.1));
      eave.rotation.z = sx * -0.7;
      eave.rotation.x = sz * 0.7;
      g.add(eave);
    }
  }

  g.position.y = y;
  if (d > w) g.rotation.y = Math.PI / 2;
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
  envFx.fires.push({ flame, phase: Math.random() * 6 });

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

// ==================== 赤壁環境 ====================
// 戰場 = 曹軍旗艦的主甲板；四周是夜霧江面、鐵索相連的小船，遠方赤壁崖。

// 黃昏江面天空：深藍漸層 + 火色地平線 + 明月星子 + 紅崖剪影
function makeChibiSky() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');

  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#1c2a4a');
  sky.addColorStop(0.5, '#3a4a6e');
  sky.addColorStop(0.78, '#a86038');
  sky.addColorStop(1, '#d08a4a');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);

  // 明月與月暈
  const moon = g.createRadialGradient(760, 120, 6, 760, 120, 90);
  moon.addColorStop(0, 'rgba(255,246,222,0.95)');
  moon.addColorStop(0.16, 'rgba(255,240,205,0.7)');
  moon.addColorStop(1, 'rgba(255,240,205,0)');
  g.fillStyle = moon;
  g.fillRect(560, 0, 464, 320);
  g.fillStyle = '#fff4da';
  g.beginPath();
  g.arc(760, 120, 26, 0, Math.PI * 2);
  g.fill();

  // 星子
  for (let i = 0; i < 70; i++) {
    const x = (i * 167 + 40) % 1024;
    const y = (i * 67) % 200;
    g.fillStyle = `rgba(255,255,255,${0.2 + (i % 5) * 0.08})`;
    g.fillRect(x, y, 2, 2);
  }

  // 遠處紅崖剪影
  drawRidge(g, 378, 'rgba(110,56,44,0.7)', 75);
  drawRidge(g, 402, 'rgba(80,40,32,0.85)', 100);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 程序化平鋪水波法線貼圖：整數週期正弦疊加 → 無縫平鋪，供江面捲動
function makeWaterNormalTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const waves = [
    { kx: 3, ky: 2, a: 1.0, p: 0.5 },
    { kx: -5, ky: 3, a: 0.6, p: 2.1 },
    { kx: 7, ky: -4, a: 0.35, p: 4.2 },
    { kx: 2, ky: 6, a: 0.45, p: 1.3 },
  ];
  const H = (x, y) => {
    let h = 0;
    for (const w of waves) h += w.a * Math.sin(((w.kx * x + w.ky * y) / S) * Math.PI * 2 + w.p);
    return h;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      img.data[i] = 128 + (H(x + 1, y) - H(x - 1, y)) * 46;
      img.data[i + 1] = 128 + (H(x, y + 1) - H(x, y - 1)) * 46;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.anisotropy = MAX_ANISO;
  return tex;
}

function buildChibi(root) {
  // ---- 江面（法線貼圖捲動 = 流水）----
  const waterNormal = makeWaterNormalTexture();
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(360, 360),
    new THREE.MeshStandardMaterial({
      color: 0x2a4a58,
      normalMap: waterNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.28,
      metalness: 0.25,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -1.4, -30);
  water.receiveShadow = true;
  root.add(water);
  envFx.waters.push({ tex: waterNormal });

  // ---- 旗艦主甲板（戰場地面；夠寬讓小兵進出場都踩在船上）----
  const deckMat = pbrMat('wood', 12, 7, { roughness: 0.85 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(84, 1.8, 48), deckMat);
  deck.position.set(0, -0.9, -8);   // 頂面剛好 y=0
  deck.receiveShadow = true;
  root.add(deck);

  // 舷牆（甲板四緣的矮牆）與繫纜樁
  const railMat = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.9 });
  const rails = [
    { w: 84, d: 1.1, x: 0, z: 15.5, h: 1.1 },
    { w: 84, d: 1.1, x: 0, z: -31.5, h: 1.6 },
    { w: 1.1, d: 48, x: 41.5, z: -8, h: 1.3 },
    { w: 1.1, d: 48, x: -41.5, z: -8, h: 1.3 },
  ];
  for (const r of rails) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(r.w, r.h, r.d), railMat);
    rail.position.set(r.x, r.h / 2, r.z);
    rail.castShadow = true;
    root.add(rail);
  }
  for (let i = -3; i <= 3; i++) {
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.9, 0.5), railMat);
      post.position.set(side * 41.5, 0.95, -8 + i * 7.4);
      post.castShadow = true;
      root.add(post);
    }
  }

  // ---- 艉樓（樓船指揮台，戰場後方的視覺主體）----
  const woodMat = pbrMat('wood', 2, 3, { roughness: 0.9 });
  const castle = new THREE.Group();
  castle.position.set(0, 0, -27.5);
  const base = new THREE.Mesh(new THREE.BoxGeometry(22, 1.4, 8), woodMat);
  base.position.y = 0.7;
  base.castShadow = base.receiveShadow = true;
  castle.add(base);
  // 樓身：木板貼圖染朱紅 → 上漆木構的樓船艙壁
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(17, 4.6, 6),
    pbrMat('wood', 5, 1.6, { color: 0xb85238, roughness: 0.85 })
  );
  body.position.y = 1.4 + 2.3;
  body.castShadow = true;
  castle.add(body);
  for (const px of [-1, 1]) {
    for (const pz of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 5, 10), woodMat);
      pillar.position.set(px * 9.6, 1.4 + 2.5, pz * 3.4);
      pillar.castShadow = true;
      castle.add(pillar);
    }
  }
  castle.add(makeRoof(24, 10, 6.2, 2.6));
  castle.add(makeRoof(18, 8, 9.0, 2.0));
  // 帥旗「曹」立於艉樓頂
  const flagship = makeBanner('曹', '#1e3a66');
  flagship.scale.setScalar(1.35);
  flagship.position.set(0, 10.6, -27.5);
  root.add(flagship);
  root.add(castle);

  // ---- 雙桅與battened帆（掛「曹」字帆）----
  const sailTex = makeSailTexture('曹');
  for (const side of [-1, 1]) {
    const mastG = new THREE.Group();
    mastG.position.set(side * 15, 0, -20);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 19, 10), woodMat);
    mast.position.y = 9.5;
    mast.castShadow = true;
    mastG.add(mast);
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 10.5, 8), woodMat);
    yard.rotation.z = Math.PI / 2;
    yard.position.y = 14.2;
    mastG.add(yard);
    const sail = new THREE.Mesh(
      new THREE.PlaneGeometry(9.4, 7.6),
      new THREE.MeshStandardMaterial({ map: sailTex, side: THREE.DoubleSide, roughness: 0.9 })
    );
    sail.position.y = 10.2;
    sail.castShadow = true;
    mastG.add(sail);
    root.add(mastG);
  }

  // ---- 甲板道具：烽火盆、軍旗 ----
  for (const pos of [[-30, 11], [30, 11], [-30, -25], [30, -25]]) {
    root.add(makeBrazier(pos[0], pos[1]));
  }
  const flags = [
    { char: '曹', color: '#1e3a66', x: -20 },
    { char: '魏', color: '#2a5bb2', x: -12 },
    { char: '魏', color: '#2a5bb2', x: 12 },
    { char: '曹', color: '#1e3a66', x: 20 },
  ];
  for (const f of flags) {
    const banner = makeBanner(f.char, f.color);
    banner.position.set(f.x, 0, FIELD.minZ - 5);
    root.add(banner);
  }

  // ---- 連環小船（鐵索與旗艦相連，隨浪起伏）----
  const shipMat = pbrMat('wood', 3, 2, { roughness: 0.9 });
  const ships = [
    { x: -52, z: -16, ry: 0.35, s: 1.0, hook: [-42, -14] },
    { x: 51, z: -8, ry: -0.4, s: 1.1, hook: [42, -8] },
    { x: -46, z: -44, ry: -0.15, s: 1.25, hook: [-40, -31] },
    { x: 47, z: -42, ry: 0.5, s: 1.1, hook: [40, -31] },
    { x: 4, z: -58, ry: 0.08, s: 1.35, hook: [8, -32] },
  ];
  for (const sd of ships) {
    const ship = makeSmallShip(shipMat, sailTex);
    ship.position.set(sd.x, -0.55, sd.z);
    ship.rotation.y = sd.ry;
    ship.scale.setScalar(sd.s);
    root.add(ship);
    envFx.bobbers.push({ obj: ship, baseY: -0.55, phase: Math.random() * 6.28, amp: 0.22 });

    // 鐵索：從旗艦舷邊垂到小船船頭
    root.add(makeChain(
      new THREE.Vector3(sd.hook[0], -0.1, sd.hook[1]),
      new THREE.Vector3(sd.x, -0.35, sd.z)
    ));
  }

  // ---- 遠方赤壁崖（紅色岩壁 + 摩崖石刻「赤壁」）----
  const cliffMat = pbrMat('cliff', 4, 3, { roughness: 1, color: 0xb06552 });
  const cliffs = [
    { x: -42, z: -80, w: 46, h: 30, d: 16 },
    { x: 8, z: -86, w: 54, h: 38, d: 18 },
    { x: 54, z: -78, w: 42, h: 26, d: 16 },
  ];
  cliffs.forEach((cf, i) => {
    const geo = new THREE.BoxGeometry(cf.w, cf.h, cf.d, 2, 2, 2);
    jitter(geo, 1.6);
    const m = new THREE.Mesh(geo, cliffMat);
    m.position.set(cf.x, cf.h / 2 - 3, cf.z);
    m.rotation.y = (i - 1) * 0.12;
    root.add(m);
  });
  root.add(makeCliffInscription());
}

// 摩崖石刻「赤壁」二字（直書，懸於中央崖面）
function makeCliffInscription() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 256);
  g.font = 'bold 104px "Microsoft JhengHei", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.strokeStyle = 'rgba(40,10,8,0.9)';
  g.lineWidth = 10;
  g.strokeText('赤', 64, 66);
  g.strokeText('壁', 64, 186);
  g.fillStyle = '#e8503a';
  g.fillText('赤', 64, 66);
  g.fillText('壁', 64, 186);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(6.5, 13),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  plane.position.set(14, 15, -74.5);
  return plane;
}

// 帆布貼圖：米白帆面 + 橫向帆骨 + 中央大字
function makeSailTexture(char) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d3c5a6';
  g.fillRect(0, 0, 256, 256);
  // 風霜污漬
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(120,100,70,${0.05 + (i % 3) * 0.03})`;
    g.beginPath();
    g.ellipse((i * 73) % 256, (i * 97) % 256, 30 + (i % 4) * 12, 16, i, 0, Math.PI * 2);
    g.fill();
  }
  // 帆骨
  g.strokeStyle = 'rgba(74,48,24,0.75)';
  g.lineWidth = 5;
  for (let y = 24; y < 256; y += 38) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
  }
  // 中央大字
  g.font = 'bold 120px "Microsoft JhengHei", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(110,30,24,0.9)';
  g.fillText(char, 128, 132);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 連環小船：船殼 + 翹起船艏艉 + 小艙房 + 單桅小帆 + 燈籠
function makeSmallShip(shipMat, sailTex) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(9.5, 1.9, 4.4), shipMat);
  hull.castShadow = true;
  g.add(hull);
  for (const side of [-1, 1]) {
    const prow = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.7, 3.6), shipMat);
    prow.position.set(side * 5.4, 0.75, 0);
    prow.rotation.z = side * -0.5;
    prow.castShadow = true;
    g.add(prow);
  }
  const house = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 1.7, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x5a3018, roughness: 0.9 })
  );
  house.position.set(-1.2, 1.75, 0);
  house.castShadow = true;
  g.add(house);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.35, 3.1),
    new THREE.MeshStandardMaterial({ color: 0x2b3550, roughness: 0.7 })
  );
  roof.position.set(-1.2, 2.75, 0);
  g.add(roof);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 8, 8), shipMat);
  mast.position.set(1.6, 4.6, 0);
  mast.castShadow = true;
  g.add(mast);
  const sail = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 3.0),
    new THREE.MeshStandardMaterial({ map: sailTex, side: THREE.DoubleSide, roughness: 0.9 })
  );
  sail.position.set(1.6, 5.6, 0);
  sail.rotation.y = Math.PI / 2;
  g.add(sail);

  // 船燈（自發光，隨 envFx.fires 微微搖曳）
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffa04a })
  );
  lantern.position.set(4.6, 2.4, 0);
  g.add(lantern);
  envFx.fires.push({ flame: lantern, phase: Math.random() * 6 });

  return g;
}

// 鐵索：沿下垂曲線串起環環相扣的鏈環（連環船的「鎖」）
const CHAIN_MAT = new THREE.MeshStandardMaterial({ color: 0x2c2c32, metalness: 0.8, roughness: 0.5 });
const CHAIN_GEO = new THREE.TorusGeometry(0.3, 0.075, 6, 10);
function makeChain(from, to) {
  const g = new THREE.Group();
  const dist = from.distanceTo(to);
  const n = Math.max(6, Math.ceil(dist / 0.52));
  const sag = Math.min(1.6, dist * 0.12);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(from, to, t);
    p.y -= sag * 4 * t * (1 - t);   // 拋物線下垂
    pts.push(p);
  }
  const xAxis = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < n; i++) {
    const link = new THREE.Mesh(CHAIN_GEO, CHAIN_MAT);
    link.position.copy(pts[i]).add(pts[i + 1]).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(pts[i + 1], pts[i]).normalize();
    link.quaternion.setFromUnitVectors(xAxis, dir);   // 環面含住鏈條方向
    if (i % 2 === 1) link.rotateX(Math.PI / 2);       // 相鄰鏈環交錯 90 度
    g.add(link);
  }
  return g;
}

// 環境動態特效（由 main 的迴圈每幀呼叫）：火焰閃動、水面流動、船身起伏
export function updateSceneFx(dt, t) {
  for (const f of envFx.fires) {
    f.flame.scale.y = 0.9 + Math.sin(t * 12 + f.phase) * 0.15;
    f.flame.rotation.y += dt * 3;
  }
  for (const w of envFx.waters) {
    w.tex.offset.x = t * 0.018;
    w.tex.offset.y = t * 0.011;
  }
  for (const b of envFx.bobbers) {
    b.obj.position.y = b.baseY + Math.sin(t * 0.8 + b.phase) * b.amp;
    b.obj.rotation.z = Math.sin(t * 0.6 + b.phase) * 0.02;
    b.obj.rotation.x = Math.sin(t * 0.5 + b.phase * 1.7) * 0.015;
  }
}
