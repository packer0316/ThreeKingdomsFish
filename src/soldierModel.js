import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

// 一般小兵共用 FBX 模型（public/models/soldier_normal/）------------------
// 只載入一次，之後每隻小兵用 SkeletonUtils.clone 複製骨架與網格，各自建立
// AnimationMixer 播放動作：平常 Walking，被擊殺時 Knock_Down_1（播完才移除）。

const BASE = import.meta.env.BASE_URL || '/';
const FBX_URL = BASE + 'models/soldier_normal/Meshy_AI_Three_Kingdoms_Soldie_biped_Meshy_AI_Meshy_Merged_Animations.fbx';
const TEX_URL = BASE + 'models/soldier_normal/Meshy_AI_Three_Kingdoms_Soldie_biped_texture_0.png';

const SOLDIER_HEIGHT = 3.3;   // 正規化後的世界高度（與原程序化小兵相近）
const MODEL_YAW = 0;          // 若模型正面方向不對，調整此偏移（弧度）
const FOOT_LIFT = 0.12;       // 稍微墊高，避免走路動作腳踝插入地底

let template = null;   // { object, scale, min, center, walkClip, knockClip }
let loading = null;
const waiters = [];

// 依名稱找動作片段（不分大小寫、可部分比對）
function findClip(animations, keyword) {
  const k = keyword.toLowerCase();
  return animations.find((a) => (a.name || '').toLowerCase().includes(k)) || null;
}

export function preloadSoldier() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const manager = new THREE.LoadingManager();
    // FBX 內引用的貼圖一律導向已知的 texture_0.png
    manager.setURLModifier((url) => (/\.png$/i.test(url) ? TEX_URL : url));

    const loader = new FBXLoader(manager);
    loader.load(
      FBX_URL,
      (fbx) => {
        // 貼圖色彩空間修正 + 強制不透明（部分 FBX 材質帶 transparent/opacity 造成半透明）
        fbx.traverse((o) => {
          if (!o.isMesh) return;
          const fix = (m) => {
            if (!m) return;
            if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
            m.transparent = false;
            m.opacity = 1;
            m.depthWrite = true;
            m.alphaTest = 0;
            m.side = THREE.FrontSide;
            m.needsUpdate = true;
          };
          Array.isArray(o.material) ? o.material.forEach(fix) : fix(o.material);
        });

        // 正規化：等比縮放到目標高度、置中、腳踩地
        const box = new THREE.Box3().setFromObject(fbx);
        const size = box.getSize(new THREE.Vector3());
        const scale = size.y > 0 ? SOLDIER_HEIGHT / size.y : 1;
        const center = box.getCenter(new THREE.Vector3());

        template = {
          object: fbx,
          animations: fbx.animations || [],
          scale,
          min: box.min.clone(),
          center,
          walkClip: findClip(fbx.animations || [], 'walk'),
          knockClip: findClip(fbx.animations || [], 'knock'),
        };
        if (!template.walkClip) console.warn('[soldier] 找不到 Walking 動作，現有：', (fbx.animations || []).map((a) => a.name));
        if (!template.knockClip) console.warn('[soldier] 找不到 Knock_Down 動作，現有：', (fbx.animations || []).map((a) => a.name));

        resolve(template);
        for (const w of waiters) w(build());
        waiters.length = 0;
      },
      undefined,
      (err) => { console.error('[soldier] FBX 載入失敗', err); reject(err); }
    );
  });
  return loading;
}

// 從模板複製一隻可動小兵：{ model, mixer, actions:{walk,knock} }
function build() {
  const t = template;
  const model = cloneSkeleton(t.object);
  model.scale.setScalar(t.scale);
  model.position.set(-t.center.x * t.scale, -t.min.y * t.scale + FOOT_LIFT, -t.center.z * t.scale);
  model.rotation.y = MODEL_YAW;

  // 每隻小兵各自建立材質（避免共用 → 一隻受擊反紅全體跟著紅）；
  // 改用 Lambert（無高光炫光），還原貼圖真實顏色、亮度與 Boss 一致。
  const toLambert = (m) => {
    // Meshy 匯出常用 MatCap 材質（不受光、偏亮）：改成受光的 Lambert，
    // 貼圖可能掛在 .map 或 .matcap，取其一當作固有色貼圖。
    const tex = m ? (m.map || m.matcap || m.emissiveMap || null) : null;
    if (tex) tex.colorSpace = THREE.SRGBColorSpace;
    const lm = new THREE.MeshLambertMaterial({
      map: tex,
      color: m && m.color && !tex ? m.color.clone() : new THREE.Color(0xffffff),
    });
    return lm;
  };
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = false;
    o.material = Array.isArray(o.material) ? o.material.map(toLambert) : toLambert(o.material);
  });

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  if (t.walkClip) actions.walk = mixer.clipAction(t.walkClip);
  if (t.knockClip) actions.knock = mixer.clipAction(t.knockClip);
  return { model, mixer, actions };
}

// 取得一隻小兵實例；模板已載好則同步回呼，否則載好後回呼
export function spawnSoldier(onReady) {
  if (template) { onReady(build()); return; }
  waiters.push(onReady);
  preloadSoldier();
}

// 模組載入即開始下載（越早越好）
preloadSoldier();
