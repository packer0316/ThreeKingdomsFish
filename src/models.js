import * as THREE from 'three';

// 程序化 3D 模型：三國小兵、武將砲台、箭矢、金幣 ------------------
// 全部用基本幾何體堆疊，低多邊形風格，不需外部美術資源。

const SKIN = 0xe8b98a;

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, ...opts });
}
function metalMat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.7 });
}

function box(w, h, d, color, mtl) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mtl || mat(color));
  m.castShadow = true;
  return m;
}
function cyl(rt, rb, h, color, seg = 8, mtl) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mtl || mat(color));
  m.castShadow = true;
  return m;
}
function sph(r, color, mtl) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mtl || mat(color));
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

// ---------- 箭矢 / 砲彈 ----------
export function makeProjectile(color = 0xffe27a) {
  const g = new THREE.Group();
  const body = cyl(0.08, 0.08, 1.0, 0x6b4a24, 6);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const tip = cyl(0.0, 0.14, 0.35, 0xcfcfd8, 6, metalMat(0xd8d8e0));
  tip.rotation.x = Math.PI / 2;
  tip.position.z = -0.6;
  g.add(tip);
  const glow = sph(0.22, color, new THREE.MeshBasicMaterial({ color }));
  g.add(glow);
  return g;
}

// ---------- 金幣爆點 ----------
export function makeCoin() {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12),
    new THREE.MeshStandardMaterial({ color: 0xffcf3a, metalness: 0.8, roughness: 0.3, emissive: 0x5a4000 })
  );
  m.rotation.x = Math.PI / 2;
  return m;
}
