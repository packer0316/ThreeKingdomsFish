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
export function makeBoss(def) {
  const g = makeSoldier({ faction: def.faction, weapon: 'sword', scale: 1 });

  // 披風
  const cape = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.8),
    mat(0x7a1030, { side: THREE.DoubleSide })
  );
  cape.position.set(0, 1.5, -0.4);
  cape.rotation.x = 0.15;
  g.add(cape);

  // 華麗頭冠
  const crown = cyl(0.44, 0.5, 0.5, 0xffcf3a, 12, metalMat(0xffcf3a));
  crown.position.y = 2.8;
  g.add(crown);

  // 頭頂雙翎
  for (const side of [-1, 1]) {
    const plume = box(0.06, 0.9, 0.06, 0xd0202a);
    plume.position.set(side * 0.2, 3.5, 0);
    plume.rotation.z = side * 0.3;
    g.add(plume);
  }

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
