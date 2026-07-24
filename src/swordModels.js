import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// 呂布「千軍萬馬」天降之劍：public/models/sword 下 3 把 FBX，隨機取用。
// 模型預設朝上（劍尖朝 +Y）→ 這裡翻轉成劍尖朝下並讓劍尖落在 group 原點，
// 好讓大招把劍「插進地面」（劍身朝上矗立）。

const BASE = import.meta.env.BASE_URL || '/';
const DEFS = [
  { fbx: 'models/sword/sword1/Meshy_AI_Sword_0724001000_texture.fbx', tex: 'models/sword/sword1/Meshy_AI_Sword_0724001000_texture.png' },
  { fbx: 'models/sword/sword2/Meshy_AI_Sword_0724113358_texture.fbx', tex: 'models/sword/sword2/Meshy_AI_Sword_0724113358_texture.png' },
  { fbx: 'models/sword/sword3/Meshy_AI_sword_0724113413_texture.fbx', tex: 'models/sword/sword3/Meshy_AI_sword_0724113413_texture.png' },
];

const TARGET_LEN = 2.8;      // 正規化後的劍長
const templates = [];        // { proto: Group }
let started = false;

function normalize(fbx) {
  // 縮放到目標長度（取最長軸）
  let box = new THREE.Box3().setFromObject(fbx);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z) || 1;
  const scale = TARGET_LEN / longest;

  const holder = new THREE.Group();
  fbx.scale.setScalar(scale);
  fbx.rotation.x = Math.PI;    // 翻轉：劍尖朝下
  holder.add(fbx);

  // 讓最低點（劍尖）落在原點 y=0、水平置中
  box = new THREE.Box3().setFromObject(holder);
  const center = box.getCenter(new THREE.Vector3());
  fbx.position.x -= center.x;
  fbx.position.z -= center.z;
  fbx.position.y -= box.min.y;

  holder.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.frustumCulled = false;
    // Meshy 常用 MatCap（偏亮不受光）→ 改成 Lambert，貼圖真實色
    const fix = (m) => {
      const tex = m ? (m.map || m.matcap || m.emissiveMap || null) : null;
      if (tex) tex.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshLambertMaterial({ map: tex, color: tex ? 0xffffff : (m && m.color ? m.color.getHex() : 0xd8dce6) });
    };
    o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
  });
  return holder;
}

export function preloadSwords() {
  if (started) return;
  started = true;
  for (const def of DEFS) {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => (/\.png$/i.test(url) ? BASE + def.tex : url));
    const loader = new FBXLoader(manager);
    loader.load(
      BASE + def.fbx,
      (fbx) => { templates.push({ proto: normalize(fbx) }); },
      undefined,
      (err) => console.error('[sword] FBX 載入失敗', def.fbx, err)
    );
  }
}

// 隨機取一把劍（1/3 機率）。回傳 { group, mats }；尚未載好回傳 null。
export function randomSword() {
  if (templates.length === 0) return null;
  const t = templates[(Math.random() * templates.length) | 0];
  const group = t.proto.clone(true);
  const mats = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();   // 各自材質，淡出時互不影響
    mats.push(o.material);
  });
  return { group, mats };
}

// 模組載入即開始下載
preloadSwords();
