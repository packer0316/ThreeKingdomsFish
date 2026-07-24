import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

// 曹操 Boss 專用 FBX 模型（public/models/tsaotsao/）--------------------
// 動作：Idle_03（進場原地站姿）、Walking（走路）、
//       Right_Hand_Sword_Slash（受擊時偶爾揮刀）、falling_down（被擊倒倒地）。
// 貼圖內嵌於 FBX（Video/Content），FBXLoader 會自動解出，不需外部 PNG。

const BASE = import.meta.env.BASE_URL || '/';
const FBX_URL = BASE + 'models/tsaotsao/tsaotsaoFBX.fbx';

const BASE_HEIGHT = 3.3;   // 正規化基準高度（同一般武將）
const SCALE_MULT = 3;      // 放大 3 倍
const MODEL_YAW = 0;       // 正面方向修正（弧度）
const BRIGHTEN = 0.45;     // 自發光提亮強度（0 = 純受光，越高越亮）

let template = null;
let loading = null;
const waiters = [];

function findClip(anims, keyword) {
  const k = keyword.toLowerCase();
  return anims.find((a) => (a.name || '').toLowerCase().includes(k)) || null;
}

export function preloadCaocao() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const loader = new FBXLoader();
    loader.load(
      FBX_URL,
      (fbx) => {
        const anims = fbx.animations || [];
        const box = new THREE.Box3().setFromObject(fbx);
        const size = box.getSize(new THREE.Vector3());
        const scale = (size.y > 0 ? BASE_HEIGHT / size.y : 1) * SCALE_MULT;
        template = {
          object: fbx,
          scale,
          min: box.min.clone(),
          center: box.getCenter(new THREE.Vector3()),
          walkClip: findClip(anims, 'walking'),
          idleClip: findClip(anims, 'idle_03') || findClip(anims, 'idle'),
          slashClip: findClip(anims, 'right_hand_sword_slash') || findClip(anims, 'slash'),
          deathClip: findClip(anims, 'falling_down') || findClip(anims, 'fall'),
        };
        if (!template.walkClip || !template.idleClip || !template.deathClip) {
          console.warn('[caocao] 動作名稱：', anims.map((a) => a.name));
        }
        resolve(template);
        for (const w of waiters) w(build());
        waiters.length = 0;
      },
      undefined,
      (err) => { console.error('[caocao] FBX 載入失敗', err); reject(err); }
    );
  });
  return loading;
}

function build() {
  const t = template;
  const model = cloneSkeleton(t.object);
  model.scale.setScalar(t.scale);
  model.position.set(-t.center.x * t.scale, -t.min.y * t.scale, -t.center.z * t.scale);
  model.rotation.y = MODEL_YAW;

  const toLambert = (m) => {
    const tex = m ? (m.map || m.matcap || m.emissiveMap || null) : null;
    if (tex) tex.colorSpace = THREE.SRGBColorSpace;
    // 以貼圖自發光提亮：陰影面不再死黑，整體亮度不受場景光壓暗
    return new THREE.MeshLambertMaterial({
      map: tex,
      color: tex ? 0xffffff : new THREE.Color(0xcccccc),
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: BRIGHTEN,
    });
  };
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = false;
    o.frustumCulled = false;
    o.material = Array.isArray(o.material) ? o.material.map(toLambert) : toLambert(o.material);
  });

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  if (t.walkClip) actions.walk = mixer.clipAction(t.walkClip);
  if (t.idleClip) actions.shout = mixer.clipAction(t.idleClip);   // 進場原地站姿（沿用 BossEnemy 的 shout 進場流程）
  if (t.slashClip) actions.judgment = mixer.clipAction(t.slashClip); // 受擊揮刀（沿用一次性演出流程）
  if (t.deathClip) actions.death = mixer.clipAction(t.deathClip);
  return { model, mixer, actions };
}

export function spawnCaocao(onReady) {
  // 一律延後到微任務：模板已快取時若同步回呼，會在 BossEnemy 建構子
  // super() 期間執行，隨後建構子本體把進場狀態蓋掉 → Boss 永遠卡在原地。
  if (template) { queueMicrotask(() => onReady(build())); return; }
  waiters.push(onReady);
  preloadCaocao();
}

preloadCaocao();
