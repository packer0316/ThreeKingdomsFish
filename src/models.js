import * as THREE from 'three';

// 程序化 3D 模型：三國小兵、武將砲台、箭矢、金幣 ------------------
// 全部用基本幾何體堆疊，低多邊形風格，不需外部美術資源。

const SKIN = 0xe8b98a;

// 角色一律使用便宜的 Lambert 材質（不需 PBR），大幅降低 shader 負擔。
function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}
// 「金屬感」也用 Lambert，加一點自發光模擬反光。
function metalMat(color) {
  return new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.12 });
}

// ---- 幾何體快取：相同尺寸的幾何體只建立一次、所有實例共用 ----
// （角色會頻繁生成/銷毀，共用可省去大量配置與 GC；因此共用幾何體「不可」被 dispose）
const _geoCache = new Map();
function boxGeo(w, h, d) {
  const k = `B|${w}|${h}|${d}`;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); _geoCache.set(k, g); }
  return g;
}
function cylGeo(rt, rb, h, seg) {
  const k = `C|${rt}|${rb}|${h}|${seg}`;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg); _geoCache.set(k, g); }
  return g;
}
function sphGeo(r) {
  const k = `S|${r}`;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, 10, 8); _geoCache.set(k, g); }
  return g;
}

function box(w, h, d, color, mtl) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mtl || mat(color));
  m.castShadow = true;
  return m;
}
function cyl(rt, rb, h, color, seg = 8, mtl) {
  const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), mtl || mat(color));
  m.castShadow = true;
  return m;
}
function sph(r, color, mtl) {
  const m = new THREE.Mesh(sphGeo(r), mtl || mat(color));
  m.castShadow = true;
  return m;
}

// ---------- 小兵 ----------
// def: { faction, weapon: 'sword'|'spear'|'bow', scale }
export function makeSoldier(def) {
  const g = new THREE.Group();
  const robe = def.faction;

  // 身體（鎧甲袍）
  const torso = box(0.9, 1.1, 0.55, robe);
  torso.position.y = 1.5;
  g.add(torso);

  // 護肩
  const shoulders = box(1.25, 0.28, 0.7, 0x3a3a42, metalMat(0x555560));
  shoulders.position.y = 2.02;
  g.add(shoulders);

  // 腰帶
  const belt = box(0.95, 0.2, 0.6, 0x6a4a1a);
  belt.position.y = 1.0;
  g.add(belt);

  // 頭
  const head = sph(0.34, SKIN);
  head.position.y = 2.55;
  g.add(head);

  // 頭盔
  const helmet = cyl(0.36, 0.42, 0.34, 0x6a6a72, 10, metalMat(0x70707a));
  helmet.position.y = 2.72;
  g.add(helmet);
  const spike = cyl(0.02, 0.08, 0.35, 0xffcf3a, 6, metalMat(0xd8a83a));
  spike.position.y = 3.05;
  g.add(spike);

  // 腿
  const legL = box(0.32, 0.95, 0.36, 0x2a2a30);
  legL.position.set(-0.24, 0.5, 0);
  g.add(legL);
  const legR = box(0.32, 0.95, 0.36, 0x2a2a30);
  legR.position.set(0.24, 0.5, 0);
  g.add(legR);

  // 手臂（持武器的右臂 + 左臂）
  const armL = box(0.26, 0.9, 0.26, robe);
  armL.position.set(-0.62, 1.5, 0.05);
  g.add(armL);

  const armR = new THREE.Group();
  const armRmesh = box(0.26, 0.9, 0.26, robe);
  armRmesh.position.y = -0.35;
  armR.add(armRmesh);
  armR.position.set(0.62, 1.85, 0.1);
  armR.rotation.x = -0.5;
  g.add(armR);

  // 武器掛在右手
  const weapon = makeWeapon(def.weapon);
  weapon.position.y = -0.75;
  armR.add(weapon);

  // 記錄可動部位供走路動畫
  g.userData.parts = { legL, legR, armR };

  const s = def.scale || 1;
  g.scale.setScalar(s);
  return g;
}

// ---------- 官銜稱號牌（菁英小兵頭上顯示）----------
// 以 canvas 繪字做成 Sprite，永遠面向鏡頭；同一官銜共用同一張貼圖。
const _titleTextures = new Map();
function titleTexture(text) {
  let tex = _titleTextures.get(text);
  if (tex) return tex;

  const w = 560, h = 132;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');

  // 深色底板 + 金框
  ctx.beginPath();
  ctx.roundRect(6, 6, w - 12, h - 12, 26);
  ctx.fillStyle = 'rgba(24,10,4,0.74)';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,205,122,0.85)';
  ctx.stroke();

  ctx.font = '700 62px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd77a';
  ctx.fillText(text, w / 2, h / 2 + 4);

  tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _titleTextures.set(text, tex);
  return tex;
}

export function makeTitleLabel(text) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: titleTexture(text),
    transparent: true,
    depthWrite: false,
  }));
  sp.scale.set(3.3, 0.78, 1);
  sp.position.y = 4.0;   // 小兵頂部約 3.2，稱號牌懸浮在頭頂上方
  return sp;
}

// ---------- 武器 ----------
function makeWeapon(type) {
  const g = new THREE.Group();
  if (type === 'spear') {
    // 長槍
    const shaft = cyl(0.05, 0.05, 3.2, 0x6b4a24, 6);
    shaft.position.y = 0.6;
    g.add(shaft);
    const tip = cyl(0.0, 0.12, 0.5, 0xdadada, 6, metalMat(0xcfcfd8));
    tip.position.y = 2.35;
    g.add(tip);
    const tassel = sph(0.12, 0xc0202a);
    tassel.position.y = 2.0;
    g.add(tassel);
  } else if (type === 'bow') {
    // 弓
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.06, 6, 16, Math.PI * 1.15),
      mat(0x7a4a1a)
    );
    arc.rotation.z = Math.PI / 2 + 0.35;
    arc.position.y = 0.6;
    g.add(arc);
    const string = cyl(0.015, 0.015, 1.55, 0xe8e0c0, 4);
    string.position.set(-0.28, 0.6, 0);
    g.add(string);
    const arrow = cyl(0.03, 0.03, 1.1, 0x5a3a1a, 4);
    arrow.rotation.z = Math.PI / 2;
    arrow.position.set(0.2, 0.6, 0);
    g.add(arrow);
  } else {
    // 環首刀 / 大刀
    const handle = cyl(0.05, 0.05, 0.9, 0x2a2a2a, 6);
    handle.position.y = 0.2;
    g.add(handle);
    const guard = box(0.34, 0.08, 0.12, 0xffcf3a, metalMat(0xd8a83a));
    guard.position.y = 0.66;
    g.add(guard);
    const blade = box(0.12, 1.5, 0.05, 0xcfcfd8, metalMat(0xd8d8e0));
    blade.position.y = 1.45;
    blade.rotation.z = 0.05;
    g.add(blade);
  }
  return g;
}

// ---------- 敵將 Boss ----------
// 精緻版守關大將：鐵甲＋陣營色胸甲、雙層肩甲、裙甲、兜鍪紅纓、
// 怒眉絡腮鬍、長柄大刀與披風金釦。可動部位與小兵相同
// （userData.parts = { legL, legR, armR }），沿用既有走路/揮臂動畫。
export function makeBoss(def) {
  const g = new THREE.Group();
  const ARMOR = def.faction;     // 陣營主色（胸甲/臂甲/裙甲）
  const IRON = 0x34343e;         // 鐵甲底色
  const GOLD = 0xd8a83a;         // 金飾
  const RED = 0xc02030;          // 紅纓 / 流蘇

  // ---- 腿（髖部樞紐，含護膝與戰靴，走路整條擺動）----
  const makeLeg = (side) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.28, 1.2, 0);
    const thigh = box(0.38, 0.6, 0.44, 0x2a2a32);
    thigh.position.y = -0.3;
    leg.add(thigh);
    const knee = box(0.36, 0.16, 0.4, GOLD, metalMat(GOLD));
    knee.position.y = -0.62;
    leg.add(knee);
    const shin = box(0.32, 0.55, 0.36, 0x22222a);
    shin.position.y = -0.85;
    leg.add(shin);
    const boot = box(0.42, 0.3, 0.62, 0x1c1c22);
    boot.position.set(0, -1.06, 0.06);
    leg.add(boot);
    g.add(leg);
    return leg;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // ---- 裙甲（前後擺片＋側片）----
  const skirtF = box(0.95, 0.6, 0.12, ARMOR, metalMat(ARMOR));
  skirtF.position.set(0, 1.08, 0.34);
  skirtF.rotation.x = 0.2;
  g.add(skirtF);
  const skirtHem = box(0.72, 0.07, 0.13, GOLD, metalMat(GOLD));
  skirtHem.position.set(0, 0.84, 0.42);
  skirtHem.rotation.x = 0.2;
  g.add(skirtHem);
  const skirtB = box(0.95, 0.6, 0.12, ARMOR, metalMat(ARMOR));
  skirtB.position.set(0, 1.08, -0.34);
  skirtB.rotation.x = -0.2;
  g.add(skirtB);
  for (const side of [-1, 1]) {
    const skirtS = box(0.12, 0.58, 0.72, ARMOR, metalMat(ARMOR));
    skirtS.position.set(side * 0.55, 1.08, 0);
    skirtS.rotation.z = side * -0.16;
    g.add(skirtS);
  }

  // ---- 軀幹：鐵甲底＋陣營色胸甲＋金釘金邊 ----
  const torso = box(1.2, 1.2, 0.75, IRON, metalMat(IRON));
  torso.position.y = 2.0;
  g.add(torso);
  const chest = box(1.05, 0.85, 0.14, ARMOR, metalMat(ARMOR));
  chest.position.set(0, 2.12, 0.42);
  g.add(chest);
  for (const sx of [-1, 1]) {
    for (const sy of [0, 1]) {
      const stud = sph(0.055, GOLD, metalMat(GOLD));
      stud.position.set(sx * 0.36, 1.9 + sy * 0.46, 0.5);
      g.add(stud);
    }
  }
  const trim = box(1.24, 0.09, 0.78, GOLD, metalMat(GOLD));
  trim.position.y = 1.66;
  g.add(trim);
  const belt = box(1.26, 0.24, 0.8, 0x3a2412);
  belt.position.y = 1.46;
  g.add(belt);
  const buckle = box(0.3, 0.2, 0.08, GOLD, metalMat(GOLD));
  buckle.position.set(0, 1.46, 0.42);
  g.add(buckle);

  // ---- 雙層肩甲＋金緣 ----
  for (const side of [-1, 1]) {
    const p1 = box(0.66, 0.2, 0.9, ARMOR, metalMat(ARMOR));
    p1.position.set(side * 0.85, 2.5, 0);
    p1.rotation.z = side * -0.32;
    g.add(p1);
    const p2 = box(0.5, 0.18, 0.74, IRON, metalMat(IRON));
    p2.position.set(side * 0.72, 2.68, 0);
    p2.rotation.z = side * -0.2;
    g.add(p2);
    const rim = box(0.1, 0.1, 0.92, GOLD, metalMat(GOLD));
    rim.position.set(side * 1.08, 2.36, 0);
    rim.rotation.z = side * -0.32;
    g.add(rim);
  }

  // ---- 左臂（垂持，含鐵護腕）----
  const armL = box(0.32, 1.0, 0.32, ARMOR);
  armL.position.set(-0.88, 1.98, 0.05);
  g.add(armL);
  const bracerL = box(0.38, 0.3, 0.38, IRON, metalMat(IRON));
  bracerL.position.set(-0.88, 1.5, 0.05);
  g.add(bracerL);
  const handL = sph(0.16, SKIN);
  handL.position.set(-0.88, 1.28, 0.05);
  g.add(handL);

  // ---- 右臂（揮擊樞紐）＋ 長柄大刀 ----
  const armR = new THREE.Group();
  armR.position.set(0.88, 2.42, 0.12);
  armR.rotation.x = -0.5;
  const armRm = box(0.32, 0.95, 0.32, ARMOR);
  armRm.position.y = -0.4;
  armR.add(armRm);
  const bracerR = box(0.38, 0.28, 0.38, IRON, metalMat(IRON));
  bracerR.position.y = -0.82;
  armR.add(bracerR);
  const handR = sph(0.17, SKIN);
  handR.position.y = -1.05;
  armR.add(handR);

  const saber = new THREE.Group();
  saber.position.y = -1.05;
  const shaft = cyl(0.06, 0.06, 3.0, 0x2c1a0e, 8);
  shaft.position.y = 0.4;
  saber.add(shaft);
  const buttCap = cyl(0.09, 0.04, 0.22, GOLD, 8, metalMat(GOLD));
  buttCap.position.y = -1.2;
  saber.add(buttCap);
  const ferrule = cyl(0.09, 0.07, 0.3, GOLD, 8, metalMat(GOLD));
  ferrule.position.y = 1.95;
  saber.add(ferrule);
  const tassel = cyl(0.04, 0.13, 0.32, RED, 8);
  tassel.position.set(0, 1.78, 0);
  saber.add(tassel);
  const blade = box(0.24, 1.35, 0.08, 0xd8dae2, metalMat(0xd8dae2));
  blade.position.set(0.12, 2.62, 0);
  blade.rotation.z = 0.14;
  saber.add(blade);
  const bladeBack = box(0.1, 1.2, 0.07, GOLD, metalMat(GOLD));
  bladeBack.position.set(0.32, 2.56, 0);
  bladeBack.rotation.z = 0.3;
  saber.add(bladeBack);
  const bladeTip = box(0.2, 0.42, 0.075, 0xd8dae2, metalMat(0xd8dae2));
  bladeTip.position.set(0.32, 3.32, 0);
  bladeTip.rotation.z = 0.42;
  saber.add(bladeTip);
  armR.add(saber);
  g.add(armR);

  // ---- 頭：怒眉＋絡腮鬍 ----
  const neck = cyl(0.18, 0.22, 0.22, SKIN, 8);
  neck.position.y = 2.66;
  g.add(neck);
  const head = sph(0.42, SKIN);
  head.position.y = 3.0;
  g.add(head);
  const beard = box(0.56, 0.38, 0.2, 0x201612);
  beard.position.set(0, 2.78, 0.28);
  g.add(beard);
  for (const side of [-1, 1]) {
    const brow = box(0.2, 0.055, 0.06, 0x201612);
    brow.position.set(side * 0.16, 3.14, 0.37);
    brow.rotation.z = side * 0.3;   // 內端壓低 → 怒相
    g.add(brow);
  }

  // ---- 兜鍪：鐵盔＋金盔沿＋護頰＋紅纓 ----
  const dome = sph(0.46, IRON, metalMat(IRON));
  dome.scale.y = 0.8;
  dome.position.y = 3.3;
  g.add(dome);
  const brim = cyl(0.55, 0.58, 0.12, GOLD, 12, metalMat(GOLD));
  brim.position.y = 3.12;
  g.add(brim);
  for (const side of [-1, 1]) {
    const cheek = box(0.12, 0.34, 0.34, IRON, metalMat(IRON));
    cheek.position.set(side * 0.44, 2.92, 0.02);
    g.add(cheek);
  }
  const crest = cyl(0.1, 0.14, 0.2, GOLD, 8, metalMat(GOLD));
  crest.position.y = 3.72;
  g.add(crest);
  const ying = cyl(0.03, 0.2, 0.42, RED, 8);   // 倒錐紅纓，覆蓋盔頂
  ying.position.y = 3.94;
  g.add(ying);
  const yingBall = sph(0.06, GOLD, metalMat(GOLD));
  yingBall.position.y = 4.14;
  g.add(yingBall);

  // ---- 披風（上窄下寬的梯形，暗紅＋金色下襬）＋肩釦 ----
  const capeShape = new THREE.Shape();
  capeShape.moveTo(-0.62, 0.8);
  capeShape.lineTo(0.62, 0.8);
  capeShape.lineTo(1.0, -1.05);
  capeShape.lineTo(-1.0, -1.05);
  capeShape.closePath();
  const cape = new THREE.Mesh(
    new THREE.ShapeGeometry(capeShape),
    mat(0x4a0c14, { side: THREE.DoubleSide })
  );
  cape.position.set(0, 2.0, -0.56);
  cape.rotation.x = 0.16;
  g.add(cape);
  const capeHem = box(1.9, 0.1, 0.05, GOLD, metalMat(GOLD));
  capeHem.position.set(0, 0.97, -0.73);
  capeHem.rotation.x = 0.16;
  g.add(capeHem);
  for (const side of [-1, 1]) {
    const clasp = sph(0.09, GOLD, metalMat(GOLD));
    clasp.position.set(side * 0.5, 2.72, -0.34);
    g.add(clasp);
  }

  g.userData.parts = { legL, legR, armR };
  g.scale.setScalar(def.scale || 1.8);
  return g;
}

// ---------- 近戰武將（中座玩家，可移動砍殺）----------
// 回傳的 group.userData.parts = { legL, legR, armR } 供走路 / 揮刀動畫
export function makeMeleeGeneral(def) {
  const g = new THREE.Group();
  const robe = def.robe;

  // 身體
  const torso = box(1.0, 1.2, 0.6, robe);
  torso.position.y = 1.55;
  g.add(torso);

  const shoulders = box(1.5, 0.34, 0.82, 0x3a3a42, metalMat(0x606070));
  shoulders.position.y = 2.18;
  g.add(shoulders);

  const belt = box(1.05, 0.22, 0.66, 0x6a4a1a);
  belt.position.y = 1.02;
  g.add(belt);

  // 頭 + 武將頭盔 + 雙翎
  const head = sph(0.36, SKIN);
  head.position.y = 2.62;
  g.add(head);

  const helm = cyl(0.4, 0.48, 0.44, def.color, 12, metalMat(def.color));
  helm.position.y = 2.84;
  g.add(helm);
  for (const side of [-1, 1]) {
    const plume = box(0.07, 0.9, 0.07, 0xd0202a);
    plume.position.set(side * 0.2, 3.5, 0);
    plume.rotation.z = side * 0.28;
    g.add(plume);
  }

  // 披風（武將色）
  const cape = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.9),
    mat(def.color, { side: THREE.DoubleSide })
  );
  cape.position.set(0, 1.55, -0.45);
  cape.rotation.x = 0.12;
  g.add(cape);

  // 腿
  const legL = box(0.34, 1.0, 0.4, 0x2a2a30);
  legL.position.set(-0.26, 0.52, 0);
  g.add(legL);
  const legR = box(0.34, 1.0, 0.4, 0x2a2a30);
  legR.position.set(0.26, 0.52, 0);
  g.add(legR);

  // 左臂
  const armL = box(0.28, 0.95, 0.28, robe);
  armL.position.set(-0.66, 1.55, 0.05);
  g.add(armL);

  // 右臂（持刀，可揮動）
  const armR = new THREE.Group();
  const armRmesh = box(0.28, 0.95, 0.28, robe);
  armRmesh.position.y = -0.38;
  armR.add(armRmesh);
  armR.position.set(0.66, 1.92, 0.12);
  armR.rotation.x = -0.5;
  g.add(armR);

  // 大刀（青龍偃月刀風）
  const blade = makeGeneralBlade(def.blade);
  blade.position.y = -0.8;
  armR.add(blade);

  g.userData.parts = { legL, legR, armR };
  g.scale.setScalar(def.scale || 1.25);
  return g;
}

function makeGeneralBlade(color) {
  const g = new THREE.Group();
  const handle = cyl(0.06, 0.06, 1.6, 0x3a2412, 6);
  handle.position.y = 0.4;
  g.add(handle);
  const guard = cyl(0.16, 0.16, 0.1, 0xffcf3a, 10, metalMat(0xd8a83a));
  guard.position.y = 1.2;
  g.add(guard);
  const blade = box(0.16, 1.4, 0.06, color, metalMat(color));
  blade.position.set(0.12, 1.9, 0);
  blade.rotation.z = 0.12;
  g.add(blade);
  const back = box(0.06, 1.2, 0.05, 0xd8a83a, metalMat(0xd8a83a));
  back.position.set(0.3, 1.85, 0);
  back.rotation.z = 0.28;
  g.add(back);
  return g;
}

// ---------- 弓箭手（左右兩側玩家）----------
// 面向 -Z 方向；userData.parts 提供拉弓動畫所需的部位與弓弦端點。
export function makeArcherGeneral(def) {
  const g = new THREE.Group();
  const robe = def.robe;

  const R = 0.6;                 // 弓半徑
  const bowY = 1.75;             // 弓的高度
  const bowZ = -0.9;             // 弓中心的縱向位置（-Z = 前方）
  const tipDY = 0.766 * R;       // 弓梢相對弓心的上下偏移
  const tipDZ = 0.643 * R;       // 弓梢相對弓心的後移（朝弦側）

  // 軀幹 / 護肩 / 腰帶
  const torso = box(0.95, 1.15, 0.58, robe);
  torso.position.y = 1.5;
  g.add(torso);
  const shoulders = box(1.4, 0.3, 0.78, 0x3a3a42, metalMat(0x606070));
  shoulders.position.y = 2.08;
  g.add(shoulders);
  const belt = box(1.0, 0.2, 0.62, 0x6a4a1a);
  belt.position.y = 0.98;
  g.add(belt);

  // 頭 + 頭盔 + 帽羽
  const head = sph(0.34, SKIN);
  head.position.y = 2.5;
  g.add(head);
  const helm = cyl(0.38, 0.46, 0.4, def.color, 12, metalMat(def.color));
  helm.position.y = 2.7;
  g.add(helm);
  const plume = box(0.06, 0.7, 0.06, 0xd0202a);
  plume.position.set(0.18, 3.2, 0.05);
  plume.rotation.z = 0.32;
  g.add(plume);

  // 腿
  const legL = box(0.32, 0.95, 0.38, 0x2a2a30);
  legL.position.set(-0.24, 0.5, 0);
  g.add(legL);
  const legR = box(0.32, 0.95, 0.38, 0x2a2a30);
  legR.position.set(0.24, 0.5, 0);
  g.add(legR);

  // 背後箭袋 + 露出的箭羽
  const quiver = cyl(0.15, 0.15, 0.9, 0x5a3a1a, 8);
  quiver.position.set(-0.34, 1.75, 0.34);
  quiver.rotation.x = -0.4;
  g.add(quiver);
  for (let i = -1; i <= 1; i++) {
    const feather = box(0.045, 0.28, 0.045, 0xdcdcdc);
    feather.position.set(-0.34 + i * 0.09, 2.2, 0.52);
    feather.rotation.x = -0.4;
    g.add(feather);
  }

  // 持弓左臂（伸向前方握住弓身）
  const bowArm = box(0.24, 0.8, 0.24, robe);
  bowArm.rotation.x = Math.PI / 2.1;
  bowArm.position.set(-0.28, bowY, bowZ + 0.55);
  g.add(bowArm);

  // 弓身（弧線；belly 朝前、雙梢朝後靠弦側）
  const bowPivot = new THREE.Group();
  const a = 2.27;                                     // 半弧角（約 130°）
  const bowArc = new THREE.Mesh(
    new THREE.TorusGeometry(R, 0.05, 6, 22, a * 2),
    mat(0x6b4a24)
  );
  bowArc.castShadow = true;
  bowArc.rotation.z = -a;                             // 讓弧線對稱於 belly
  bowPivot.add(bowArc);
  bowPivot.rotation.y = Math.PI / 2;                  // 立成 YZ 平面的直立弓
  bowPivot.position.set(0, bowY, bowZ);
  g.add(bowPivot);

  // 弓弦兩段（每幀依 nock 位置重新拉伸）
  const stringMat = mat(0xeee6c8, { metalness: 0, roughness: 1 });
  const stringTop = cyl(0.012, 0.012, 1, 0, 4, stringMat);
  const stringBot = cyl(0.012, 0.012, 1, 0, 4, stringMat);
  g.add(stringTop, stringBot);

  // 搭箭處（nock）：含箭 + 拉弦的手與前臂，整組隨拉弓往後移動
  const nock = new THREE.Group();
  nock.position.set(0, bowY, bowZ + tipDZ);
  g.add(nock);

  const nockedArrow = new THREE.Group();
  const shaft = cyl(0.02, 0.02, 1.15, 0x5a3a1a, 5);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.55;
  nockedArrow.add(shaft);
  const ntip = cyl(0, 0.05, 0.16, 0, 5, metalMat(0xd8d8e0));
  ntip.rotation.x = -Math.PI / 2;
  ntip.position.z = -1.18;
  nockedArrow.add(ntip);
  const fletch = box(0.02, 0.16, 0.16, 0xd05a3a);
  fletch.position.z = 0.05;
  nockedArrow.add(fletch);
  nock.add(nockedArrow);

  const hand = box(0.16, 0.16, 0.18, SKIN);
  nock.add(hand);
  const forearm = box(0.22, 0.22, 0.6, robe);
  forearm.position.z = 0.42;   // 前臂向後（朝肩膀）
  nock.add(forearm);

  g.userData.parts = {
    legL, legR, nock, nockedArrow, stringTop, stringBot,
    bowY, bowZ,
    tipTop: new THREE.Vector3(0, bowY + tipDY, bowZ + tipDZ),
    tipBot: new THREE.Vector3(0, bowY - tipDY, bowZ + tipDZ),
    restZ: bowZ + tipDZ,
  };
  g.scale.setScalar(def.scale || 1.15);
  return g;
}

// ---------- 武將砲台（玩家）----------
export function makeGeneralTurret(def) {
  const g = new THREE.Group();

  // 底座平台
  const base = cyl(2.0, 2.4, 0.6, 0x4a3520, 12);
  base.position.y = 0.3;
  g.add(base);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.0, 0.14, 8, 24),
    metalMat(0xffcf3a)
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.62;
  g.add(ring);

  // 旋轉頭（瞄準）
  const head = new THREE.Group();
  head.position.y = 0.6;
  g.add(head);

  // 武將本體
  const body = box(1.3, 1.6, 0.9, def.robe);
  body.position.y = 1.4;
  head.add(body);

  const shoulders = box(1.9, 0.4, 1.1, 0x444450, metalMat(0x606070));
  shoulders.position.y = 2.15;
  head.add(shoulders);

  const face = sph(0.42, SKIN);
  face.position.y = 2.75;
  head.add(face);

  const helm = cyl(0.46, 0.54, 0.5, def.color, 12, metalMat(def.color));
  helm.position.y = 2.95;
  head.add(helm);
  for (const side of [-1, 1]) {
    const plume = box(0.07, 1.0, 0.07, 0xd0202a);
    plume.position.set(side * 0.22, 3.7, 0);
    plume.rotation.z = side * 0.28;
    head.add(plume);
  }

  // 大型弩砲 / 砲管（朝前）
  const cannon = cyl(0.35, 0.42, 2.6, 0x2a2a30, 12, metalMat(0x40404a));
  cannon.rotation.x = Math.PI / 2;
  cannon.position.set(0, 1.6, -1.6);
  head.add(cannon);
  const muzzle = cyl(0.5, 0.5, 0.4, def.blade, 12, metalMat(def.blade));
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 1.6, -2.9);
  head.add(muzzle);

  g.userData.head = head;
  g.userData.muzzleZ = -3.1;
  return g;
}

// ---------- 箭矢 / 砲彈（共用幾何體與材質，發射頻繁不再逐發配置）----------
const _projBodyMat = new THREE.MeshLambertMaterial({ color: 0x6b4a24 });
const _projTipMat = new THREE.MeshLambertMaterial({ color: 0xd8d8e0, emissive: 0xd8d8e0, emissiveIntensity: 0.12 });
const _glowMats = new Map();
export function makeProjectile(color = 0xffe27a) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(cylGeo(0.08, 0.08, 1.0, 6), _projBodyMat);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const tip = new THREE.Mesh(cylGeo(0.0, 0.14, 0.35, 6), _projTipMat);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = -0.6;
  g.add(tip);
  let gm = _glowMats.get(color);
  if (!gm) { gm = new THREE.MeshBasicMaterial({ color }); _glowMats.set(color, gm); }
  g.add(new THREE.Mesh(sphGeo(0.22), gm));
  return g;
}

// ---------- 金幣爆點（共用幾何體與材質）----------
const _coinMat = new THREE.MeshLambertMaterial({ color: 0xffcf3a, emissive: 0x5a4000 });
export function makeCoin() {
  const m = new THREE.Mesh(cylGeo(0.3, 0.3, 0.06, 12), _coinMat);
  m.rotation.x = Math.PI / 2;
  return m;
}
