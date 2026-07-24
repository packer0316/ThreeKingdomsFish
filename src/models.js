import * as THREE from 'three';

// 程序化 3D 模型：三國小兵、武將砲台、箭矢、金幣 ------------------
// 全部用基本幾何體堆疊，低多邊形風格，不需外部美術資源。

const SKIN = 0xe8b98a;

// 持握俯仰角：讓武器與前臂（armR 已 rotation.x = -0.5）大致垂直。
// 前臂沿 armR 的 -Y，武器幾何沿 +Y；繞 +X 的「正角」才會把 +Y 轉向 +Z（面朝方向）。
// 世界俯仰 = -0.5 + GRIP_PITCH ≈ +1.35 → 刀身朝前、略上揚（負角會變成朝後拿反）。
const GRIP_PITCH = 1.85;

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

  // 武器握在右手：近戰武器與前臂垂直（刀 / 槍朝前微上），不再沿手臂縱向穿過手臂
  const weapon = makeWeapon(def.weapon);
  if (def.weapon === 'bow') {
    weapon.position.y = -0.75;                  // 弓維持原本握法
  } else {
    weapon.position.set(0, -0.62, 0);
    weapon.rotation.x = GRIP_PITCH;
  }
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

// ---------- 小兵對話泡泡（閒談台詞）----------
// 寬度依字數自適應，底部帶指向小兵的尾巴；同一句台詞共用貼圖。
const _bubbleTextures = new Map();
function bubbleTexture(text) {
  let entry = _bubbleTextures.get(text);
  if (entry) return entry;

  const font = '700 46px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const textW = measure.measureText(text).width;

  const w = Math.ceil(textW + 88);
  const h = 128;                    // 上方泡泡本體 96 + 下方尾巴
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');

  ctx.beginPath();
  ctx.roundRect(5, 5, w - 10, 92, 22);
  ctx.fillStyle = 'rgba(16,14,10,0.8)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,238,196,0.75)';
  ctx.stroke();

  // 尾巴（指向下方的小兵）
  ctx.beginPath();
  ctx.moveTo(w / 2 - 14, 95);
  ctx.lineTo(w / 2 + 14, 95);
  ctx.lineTo(w / 2, 122);
  ctx.closePath();
  ctx.fillStyle = 'rgba(16,14,10,0.8)';
  ctx.fill();

  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff2d8';
  ctx.fillText(text, w / 2, 52);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  entry = { tex, aspect: w / h };
  _bubbleTextures.set(text, entry);
  return entry;
}

export function makeSpeechBubble(text) {
  const { tex, aspect } = bubbleTexture(text);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  }));
  const H = 1.05;
  sp.scale.set(H * aspect, H, 1);
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

// ---------- 曹操（赤壁 Boss 專屬造型）----------
// 依魏武帝形象細作：不戴兜鍪，束髮金冠＋上揚黑髮、細眉、八字鬍與山羊鬍；
// 藍紫錦袍配深紫胸甲、交領金邊、高立領，腰繫赤褐大帶佩玉，
// 背披紫青大氅，右手持「倚天劍」（直身雙刃劍，金吞口鑲紅玉）。
// 可動部位與其他 Boss 相同（userData.parts = { legL, legR, armR }）。
function makeCaoCao(def) {
  const g = new THREE.Group();
  const ROBE = 0x2f4fa2;    // 錦袍藍
  const ARMOR = 0x283058;   // 胸甲深紫藍
  const NAVY = 0x1c2240;    // 裙甲/護腕深藍
  const PURPLE = 0x453a78;  // 側裙/內襯紫
  const GOLD = 0xd8a83a;    // 金飾
  const HAIR = 0x181320;    // 髮鬚墨黑
  const SASH = 0x6e2a20;    // 赤褐腰帶

  // ---- 腿（髖部樞紐；勁裝長褲＋金護膝＋翹尖官靴）----
  const makeLeg = (side) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.26, 1.2, 0);
    const thigh = box(0.34, 0.58, 0.4, 0x232438);
    thigh.position.y = -0.28;
    leg.add(thigh);
    const knee = box(0.32, 0.14, 0.36, GOLD, metalMat(GOLD));
    knee.position.y = -0.6;
    leg.add(knee);
    const shin = box(0.3, 0.52, 0.34, 0x191a26);
    shin.position.y = -0.84;
    leg.add(shin);
    const boot = box(0.38, 0.28, 0.56, 0x14141c);
    boot.position.set(0, -1.06, 0.05);
    leg.add(boot);
    const bootTip = box(0.28, 0.16, 0.18, 0x14141c);   // 翹起的靴尖
    bootTip.position.set(0, -1.0, 0.38);
    bootTip.rotation.x = -0.55;
    leg.add(bootTip);
    const bootTrim = box(0.4, 0.07, 0.58, GOLD, metalMat(GOLD)); // 靴口金邊
    bootTrim.position.set(0, -0.93, 0.05);
    leg.add(bootTrim);
    g.add(leg);
    return leg;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // ---- 袍裙：前後深藍擺片（金襬）＋兩側紫裙＋中央銀札甲短簾 ----
  const skirtF = box(0.85, 0.62, 0.1, NAVY);
  skirtF.position.set(0, 1.05, 0.3);
  skirtF.rotation.x = 0.16;
  g.add(skirtF);
  const hemF = box(0.85, 0.09, 0.11, GOLD, metalMat(GOLD));
  hemF.position.set(0, 0.78, 0.37);
  hemF.rotation.x = 0.16;
  g.add(hemF);
  const skirtB = box(0.9, 0.66, 0.1, NAVY);
  skirtB.position.set(0, 1.03, -0.3);
  skirtB.rotation.x = -0.16;
  g.add(skirtB);
  for (const side of [-1, 1]) {
    const skirtS = box(0.1, 0.6, 0.6, PURPLE);
    skirtS.position.set(side * 0.5, 1.05, 0);
    skirtS.rotation.z = side * -0.14;
    g.add(skirtS);
  }
  for (let i = -1; i <= 1; i++) {
    const lame = box(0.14, 0.46, 0.05, 0x9aa0b4, metalMat(0x9aa0b4));
    lame.position.set(i * 0.17, 1.04, 0.38);
    lame.rotation.x = 0.16;
    g.add(lame);
  }

  // ---- 軀幹：深紫胸甲＋紫錦胸面＋交領金邊＋金胸釦 ----
  const torso = box(1.08, 1.15, 0.66, ARMOR, metalMat(ARMOR));
  torso.position.y = 2.0;
  g.add(torso);
  const chest = box(0.92, 0.8, 0.1, PURPLE);
  chest.position.set(0, 2.1, 0.36);
  g.add(chest);
  for (const side of [-1, 1]) {
    const lapel = box(0.52, 0.09, 0.06, GOLD, metalMat(GOLD)); // 交領（V 領金緣）
    lapel.position.set(side * 0.21, 2.42, 0.42);
    lapel.rotation.z = side * 0.72;
    g.add(lapel);
  }
  const brooch = sph(0.09, GOLD, metalMat(GOLD));   // 領口金釦
  brooch.position.set(0, 2.22, 0.44);
  g.add(brooch);
  const waistTrim = box(0.7, 0.05, 0.06, GOLD, metalMat(GOLD)); // 腹甲金紋
  waistTrim.position.set(0, 1.84, 0.38);
  g.add(waistTrim);

  // 腰帶＋金帶鉤＋玉佩
  const belt = box(1.12, 0.2, 0.72, SASH);
  belt.position.y = 1.5;
  g.add(belt);
  const buckle = box(0.26, 0.15, 0.06, GOLD, metalMat(GOLD));
  buckle.position.set(0, 1.5, 0.4);
  g.add(buckle);
  const jadeCord = box(0.03, 0.12, 0.03, GOLD, metalMat(GOLD));
  jadeCord.position.set(0.3, 1.36, 0.38);
  g.add(jadeCord);
  const jade = cyl(0.08, 0.08, 0.03, 0x7ac0a0, 10);
  jade.rotation.x = Math.PI / 2;
  jade.position.set(0.3, 1.24, 0.38);
  g.add(jade);

  // ---- 高立領（後高前開，襯出頭部；金緣）----
  const collarB = box(0.7, 0.5, 0.1, ARMOR, metalMat(ARMOR));
  collarB.position.set(0, 2.74, -0.3);
  collarB.rotation.x = 0.22;
  g.add(collarB);
  const collarEdge = box(0.72, 0.06, 0.11, GOLD, metalMat(GOLD));
  collarEdge.position.set(0, 2.98, -0.36);
  collarEdge.rotation.x = 0.22;
  g.add(collarEdge);
  for (const side of [-1, 1]) {
    const collarS = box(0.1, 0.44, 0.4, ARMOR, metalMat(ARMOR));
    collarS.position.set(side * 0.36, 2.72, -0.08);
    collarS.rotation.z = side * -0.18;
    collarS.rotation.y = side * 0.3;
    g.add(collarS);
  }

  // ---- 圓肩甲（覆於錦袖上，金緣托底）----
  for (const side of [-1, 1]) {
    const pad = sph(0.34, ARMOR, metalMat(ARMOR));
    pad.scale.set(1.15, 0.75, 1.05);
    pad.position.set(side * 0.72, 2.56, 0.02);
    g.add(pad);
    const rim = box(0.42, 0.07, 0.58, GOLD, metalMat(GOLD));
    rim.position.set(side * 0.82, 2.38, 0.02);
    rim.rotation.z = side * -0.3;
    g.add(rim);
  }

  // ---- 左臂（垂持；錦袖＋深藍護腕金線）----
  const armL = box(0.3, 0.95, 0.3, ROBE);
  armL.position.set(-0.8, 1.98, 0.05);
  g.add(armL);
  const cuffGoldL = box(0.37, 0.06, 0.37, GOLD, metalMat(GOLD));
  cuffGoldL.position.set(-0.8, 1.66, 0.05);
  g.add(cuffGoldL);
  const cuffL = box(0.36, 0.26, 0.36, NAVY, metalMat(NAVY));
  cuffL.position.set(-0.8, 1.5, 0.05);
  g.add(cuffL);
  const handL = sph(0.15, SKIN);
  handL.position.set(-0.8, 1.28, 0.05);
  g.add(handL);

  // ---- 右臂（揮擊樞紐）＋ 倚天劍 ----
  const armR = new THREE.Group();
  armR.position.set(0.8, 2.42, 0.12);
  armR.rotation.x = -0.5;
  const armRm = box(0.3, 0.9, 0.3, ROBE);
  armRm.position.y = -0.38;
  armR.add(armRm);
  const cuffGoldR = box(0.37, 0.06, 0.37, GOLD, metalMat(GOLD));
  cuffGoldR.position.y = -0.64;
  armR.add(cuffGoldR);
  const cuffR = box(0.36, 0.26, 0.36, NAVY, metalMat(NAVY));
  cuffR.position.y = -0.8;
  armR.add(cuffR);
  const handR = sph(0.16, SKIN);
  handR.position.y = -1.02;
  armR.add(handR);

  // 倚天劍：墨柄金線、金吞口鑲紅玉、亮銀直刃（近格處鏨金銘文）
  const sword = new THREE.Group();
  sword.position.y = -1.02;
  sword.rotation.x = GRIP_PITCH;   // 與前臂垂直、劍尖朝前微揚（同其他武將握法）
  sword.rotation.x = GRIP_PITCH;   // 劍身與前臂垂直、朝前
  const grip = cyl(0.05, 0.055, 0.46, 0x241a30, 8);
  sword.add(grip);
  for (const dy of [-0.1, 0.1]) {
    const wire = cyl(0.056, 0.056, 0.035, GOLD, 8, metalMat(GOLD));
    wire.position.y = dy;
    sword.add(wire);
  }
  const pommel = sph(0.07, GOLD, metalMat(GOLD));
  pommel.position.y = -0.28;
  sword.add(pommel);
  const guard = box(0.42, 0.09, 0.16, GOLD, metalMat(GOLD));
  guard.position.y = 0.28;
  sword.add(guard);
  for (const side of [-1, 1]) {
    const tipBall = sph(0.05, GOLD, metalMat(GOLD));
    tipBall.position.set(side * 0.21, 0.28, 0);
    sword.add(tipBall);
  }
  const gem = sph(0.045, 0xc02030, metalMat(0xc02030));
  gem.position.set(0, 0.3, 0.09);
  sword.add(gem);
  const blade = box(0.15, 1.65, 0.05, 0xe8ecf6, metalMat(0xe8ecf6));
  blade.position.y = 1.12;
  sword.add(blade);
  const inscription = box(0.05, 0.5, 0.052, GOLD, metalMat(GOLD));
  inscription.position.y = 0.62;
  sword.add(inscription);
  const bladeTip = cyl(0.0, 0.08, 0.28, 0xe8ecf6, 4, metalMat(0xe8ecf6));
  bladeTip.scale.z = 0.32;             // 壓扁成刃形（縮放網格，不影響共用幾何體）
  bladeTip.position.y = 2.08;
  sword.add(bladeTip);
  armR.add(sword);
  g.add(armR);

  // ---- 頭：細眉、八字鬍、山羊鬍（不戴盔）----
  const neck = cyl(0.16, 0.2, 0.24, SKIN, 8);
  neck.position.y = 2.72;
  g.add(neck);
  const head = sph(0.4, SKIN);
  head.position.y = 3.06;
  g.add(head);
  for (const side of [-1, 1]) {
    const brow = box(0.18, 0.05, 0.05, HAIR);
    brow.position.set(side * 0.15, 3.18, 0.34);
    brow.rotation.z = side * 0.15;   // 微挑眉 → 梟雄自得之相
    g.add(brow);
  }
  for (const side of [-1, 1]) {
    const mustache = box(0.16, 0.045, 0.05, HAIR);   // 八字鬍
    mustache.position.set(side * 0.12, 2.94, 0.36);
    mustache.rotation.z = side * -0.35;
    g.add(mustache);
  }
  const jawBeard = box(0.34, 0.12, 0.06, HAIR);      // 頷下短髭
  jawBeard.position.set(0, 2.82, 0.3);
  g.add(jawBeard);
  const goatee = box(0.15, 0.32, 0.09, HAIR);        // 山羊鬍
  goatee.position.set(0, 2.7, 0.3);
  goatee.rotation.x = 0.1;
  g.add(goatee);

  // ---- 髮：後攏髮罩＋鬢角＋上揚髮束＋髮髻 ----
  const hairCap = sph(0.43, HAIR);
  hairCap.scale.set(1.0, 0.85, 1.0);
  hairCap.position.set(0, 3.24, -0.1);   // 上移後收，露出額頭與眉眼
  g.add(hairCap);
  for (const side of [-1, 1]) {
    const sideburn = box(0.08, 0.22, 0.1, HAIR);
    sideburn.position.set(side * 0.36, 2.98, 0.16);
    g.add(sideburn);
  }
  const spikes = [
    { x: 0, z: -0.16, rx: 0.5, rz: 0 },       // 後束
    { x: -0.16, z: -0.08, rx: 0.4, rz: 0.35 },
    { x: 0.16, z: -0.08, rx: 0.4, rz: -0.35 },
    { x: 0, z: 0.12, rx: -0.2, rz: 0 },       // 前額上揚
  ];
  for (const sp of spikes) {
    const tuft = cyl(0.0, 0.09, 0.34, HAIR, 5);
    tuft.position.set(sp.x, 3.6, sp.z);
    tuft.rotation.x = sp.rx;
    tuft.rotation.z = sp.rz;
    g.add(tuft);
  }
  const bun = sph(0.12, HAIR);
  bun.position.set(0, 3.64, -0.02);
  g.add(bun);

  // ---- 束髮金冠：金環座＋前立板＋雙翅上揚＋紅玉＋橫貫金簪 ----
  const crownBase = cyl(0.13, 0.15, 0.12, GOLD, 8, metalMat(GOLD));
  crownBase.position.set(0, 3.62, 0.04);
  g.add(crownBase);
  const crownPlate = box(0.16, 0.17, 0.05, GOLD, metalMat(GOLD));
  crownPlate.position.set(0, 3.74, 0.08);
  g.add(crownPlate);
  for (const side of [-1, 1]) {
    const wing = box(0.05, 0.26, 0.04, GOLD, metalMat(GOLD));
    wing.position.set(side * 0.12, 3.78, 0.05);
    wing.rotation.z = side * -0.5;
    g.add(wing);
  }
  const crownGem = sph(0.045, 0xc02030, metalMat(0xc02030));
  crownGem.position.set(0, 3.66, 0.16);
  g.add(crownGem);
  const hairpin = cyl(0.02, 0.02, 0.5, GOLD, 6, metalMat(GOLD));
  hairpin.rotation.z = Math.PI / 2;
  hairpin.position.set(0, 3.6, -0.02);
  g.add(hairpin);

  // ---- 紫青大氅（金襬、金肩釦）----
  const capeShape = new THREE.Shape();
  capeShape.moveTo(-0.55, 0.85);
  capeShape.lineTo(0.55, 0.85);
  capeShape.lineTo(0.95, -1.1);
  capeShape.lineTo(-0.95, -1.1);
  capeShape.closePath();
  const cape = new THREE.Mesh(
    new THREE.ShapeGeometry(capeShape),
    mat(0x241a44, { side: THREE.DoubleSide })
  );
  cape.position.set(0, 2.05, -0.5);
  cape.rotation.x = 0.14;
  g.add(cape);
  const capeHem = box(1.8, 0.09, 0.05, GOLD, metalMat(GOLD));
  capeHem.position.set(0, 0.96, -0.68);
  capeHem.rotation.x = 0.14;
  g.add(capeHem);
  for (const side of [-1, 1]) {
    const clasp = sph(0.08, GOLD, metalMat(GOLD));
    clasp.position.set(side * 0.45, 2.75, -0.3);
    g.add(clasp);
  }

  g.userData.parts = { legL, legR, armR };
  g.scale.setScalar(def.scale || 1.8);
  return g;
}

// ---------- 敵將 Boss ----------
// 精緻版守關大將：鐵甲＋陣營色胸甲、雙層肩甲、裙甲、兜鍪紅纓、
// 怒眉絡腮鬍、長柄大刀與披風金釦。可動部位與小兵相同
// （userData.parts = { legL, legR, armR }），沿用既有走路/揮臂動畫。
// 具專屬造型的武將（曹操）在此分流。
export function makeBoss(def) {
  if (def.id === 'caocao') return makeCaoCao(def);
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
  saber.rotation.x = GRIP_PITCH;   // 長柄大刀與前臂垂直、朝前
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

// ---------- 黃忠（玩家可操控的弓將，原地射擊）----------
// 沿用弓箭手 rig（userData.parts 相容拉弓機制），再疊加老將造型：
// 白鬚白髮、綠金鎧甲、鍍金大弓、綠金披風，比一般弓兵更精緻壯碩。
export function makeHuangzhong() {
  const HZ = { name: '黃忠', color: 0xcaa23a, robe: 0x2f7a3a, blade: 0x9be86a, scale: 1.3 };
  const g = makeArcherGeneral(HZ);
  const GOLD = 0xd8a83a;

  // 鍍金大弓（把木弓改成金色）
  g.traverse((o) => {
    if (o.geometry && o.geometry.type === 'TorusGeometry') o.material = metalMat(0xe0b24a);
  });

  // 金胸甲 + 金腹帶
  const chest = box(0.82, 0.6, 0.12, GOLD, metalMat(GOLD));
  chest.position.set(0, 1.62, 0.3);
  g.add(chest);
  const beltGold = box(1.02, 0.1, 0.64, GOLD, metalMat(GOLD));
  beltGold.position.y = 0.98;
  g.add(beltGold);

  // 加大金護肩
  for (const s of [-1, 1]) {
    const pad = sph(0.27, GOLD, metalMat(GOLD));
    pad.scale.set(1.15, 0.72, 1.05);
    pad.position.set(s * 0.62, 2.02, 0.02);
    g.add(pad);
  }

  // 白鬚（老將）＋白鬢
  const WHITE = 0xece8dc;
  const beard = box(0.44, 0.52, 0.16, WHITE);
  beard.position.set(0, 2.18, 0.28);
  g.add(beard);
  const beardTip = box(0.26, 0.3, 0.14, WHITE);
  beardTip.position.set(0, 1.9, 0.3);
  g.add(beardTip);
  for (const s of [-1, 1]) {
    const whisk = box(0.09, 0.26, 0.12, WHITE);
    whisk.position.set(s * 0.27, 2.46, 0.16);
    g.add(whisk);
  }
  // 白髮髻（盔後）
  const bun = sph(0.17, WHITE);
  bun.position.set(0, 2.74, -0.26);
  g.add(bun);

  // 綠金披風
  const cape = new THREE.Mesh(
    new THREE.PlaneGeometry(1.12, 1.62),
    mat(0x1f5a2a, { side: THREE.DoubleSide })
  );
  cape.position.set(0, 1.55, -0.36);
  cape.rotation.x = 0.1;
  g.add(cape);
  const capeHem = box(1.12, 0.1, 0.04, GOLD, metalMat(GOLD));
  capeHem.position.set(0, 0.76, -0.4);
  cape.rotation.x = 0.1;
  g.add(capeHem);

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

// ---------- 招募武將（召喚單位）----------
// type: '法' | '書'（遠程法術）｜ '騎' | '槍' | '劍'（近戰）
// 回傳 group.userData.parts = { legL, legR, armR } 供走路 / 揮擊動畫。
// 面向 -Z（戰場方向）。
function makeSummonProp(type, color) {
  const g = new THREE.Group();
  if (type === '槍' || type === '騎') {
    const shaft = cyl(0.05, 0.05, 3.2, 0x6b4a24, 6);
    shaft.position.y = 0.6; g.add(shaft);
    const tip = cyl(0.0, 0.12, 0.5, 0xdadada, 6, metalMat(0xcfcfd8));
    tip.position.y = 2.35; g.add(tip);
    const tassel = sph(0.12, 0xc0202a); tassel.position.y = 2.0; g.add(tassel);
  } else if (type === '劍') {
    const handle = cyl(0.05, 0.05, 0.5, 0x2a2a2a, 6); handle.position.y = 0.2; g.add(handle);
    const guard = box(0.34, 0.08, 0.12, 0xffcf3a, metalMat(0xd8a83a)); guard.position.y = 0.46; g.add(guard);
    const blade = box(0.13, 1.6, 0.05, 0xe8ecf6, metalMat(0xe8ecf6)); blade.position.y = 1.3; g.add(blade);
    const tipB = cyl(0.0, 0.075, 0.28, 0xe8ecf6, 4, metalMat(0xe8ecf6));
    tipB.scale.z = 0.35; tipB.position.y = 2.15; g.add(tipB);
  } else if (type === '法') {
    // 法杖：長桿 + 頂端能量寶珠（自發光）
    const staff = cyl(0.05, 0.05, 2.4, 0x4a2f6a, 6); staff.position.y = 0.5; g.add(staff);
    const claw = cyl(0.16, 0.05, 0.34, color, 6, metalMat(color)); claw.position.y = 1.75; g.add(claw);
    const orb = new THREE.Mesh(sphGeo(0.2), new THREE.MeshBasicMaterial({ color }));
    orb.position.y = 1.95; g.add(orb);
  } else {
    // 書：手持典籍 + 上方浮空符卷
    const book = box(0.5, 0.62, 0.14, 0x8a2f2f, metalMat(0x8a2f2f)); book.position.y = 0.5; g.add(book);
    const pages = box(0.42, 0.54, 0.16, 0xf0e8d0); pages.position.set(0, 0.5, 0.02); g.add(pages);
    const glow = new THREE.Mesh(sphGeo(0.16), new THREE.MeshBasicMaterial({ color }));
    glow.position.y = 1.0; g.add(glow);
  }
  return g;
}

function makeHorse(color = 0x5a3a22) {
  // 模型正面朝 +Z（執行時整體再旋轉 180° 面向戰場），故馬頭在 +Z、馬尾在 -Z
  const h = new THREE.Group();
  const body = box(0.92, 0.95, 2.3, color); body.position.y = 1.5; h.add(body);
  const rump = box(0.9, 0.9, 0.7, color); rump.position.set(0, 1.55, -1.0); h.add(rump);
  const neck = box(0.5, 0.95, 0.55, color); neck.position.set(0, 2.02, 1.0); neck.rotation.x = 0.5; h.add(neck);
  const head = box(0.42, 0.5, 0.85, color); head.position.set(0, 2.42, 1.45); h.add(head);
  const mane = box(0.16, 0.9, 0.5, 0x2a1c10); mane.position.set(0, 2.1, 0.86); mane.rotation.x = 0.5; h.add(mane);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = box(0.24, 1.5, 0.26, 0x241810);
    leg.position.set(sx * 0.33, 0.75, sz * 0.85); h.add(leg);
    const hoof = box(0.28, 0.2, 0.3, 0x14100a);
    hoof.position.set(sx * 0.33, 0.1, sz * 0.85); h.add(hoof);
  }
  const tail = box(0.18, 1.0, 0.18, 0x2a1c10); tail.position.set(0, 1.55, -1.4); tail.rotation.x = -0.7; h.add(tail);
  return h;
}

export function makeSummonGeneral(type, color = 0x9a6cff) {
  const g = new THREE.Group();
  const robe = color;
  const isCaster = (type === '法' || type === '書');

  let baseY = 0;
  if (type === '騎') {
    g.add(makeHorse(0x5a3a22));
    baseY = 1.5;                 // 騎士抬高到馬背
  }

  const body = new THREE.Group();
  body.position.y = baseY;
  g.add(body);

  const torso = box(0.9, 1.15, 0.56, robe); torso.position.y = 1.5; body.add(torso);
  const shoulders = box(1.35, 0.3, 0.78, 0x3a3a42, metalMat(0x606070)); shoulders.position.y = 2.08; body.add(shoulders);
  const belt = box(0.98, 0.2, 0.6, 0x6a4a1a); belt.position.y = 0.98; body.add(belt);
  const head = sph(0.33, SKIN); head.position.y = 2.5; body.add(head);

  if (isCaster) {
    const cap = cyl(0.18, 0.34, 0.4, robe, 8); cap.position.y = 2.82; body.add(cap);   // 道冠 / 儒巾
    const robeSkirt = box(1.0, 1.0, 0.62, robe); robeSkirt.position.y = 0.72; body.add(robeSkirt);
  } else {
    const helm = cyl(0.37, 0.45, 0.4, color, 12, metalMat(color)); helm.position.y = 2.72; body.add(helm);
    for (const side of [-1, 1]) {
      const plume = box(0.06, 0.7, 0.06, 0xd0202a);
      plume.position.set(side * 0.16, 3.2, 0); plume.rotation.z = side * 0.3; body.add(plume);
    }
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), mat(color, { side: THREE.DoubleSide }));
    cape.position.set(0, 1.5, -0.4); cape.rotation.x = 0.12; body.add(cape);
  }

  const legL = box(0.3, 0.95, 0.36, 0x2a2a30); legL.position.set(-0.22, 0.5, 0); body.add(legL);
  const legR = box(0.3, 0.95, 0.36, 0x2a2a30); legR.position.set(0.22, 0.5, 0); body.add(legR);

  const armL = box(0.25, 0.9, 0.25, robe); armL.position.set(-0.6, 1.5, 0.05); body.add(armL);

  const armR = new THREE.Group();
  const armRm = box(0.25, 0.9, 0.25, robe); armRm.position.y = -0.35; armR.add(armRm);
  armR.position.set(0.6, 1.85, 0.1); armR.rotation.x = -0.5; body.add(armR);

  const prop = makeSummonProp(type, color);
  prop.position.y = -0.62;
  prop.rotation.x = GRIP_PITCH;
  armR.add(prop);

  g.userData.parts = { legL, legR, armR };
  g.userData.armRBase = -0.5;
  g.scale.setScalar(1.3);
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
