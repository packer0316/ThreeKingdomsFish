import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

// 黃忠弓將專用 FBX 模型（public/models/HuangZhong/）--------------------
// 其他玩家與中座玩家的弓將皆改用此模型。
// 動作：Walking（平常 LOOP）、Archery_Shot_3（放箭時播一次）。
// 貼圖內嵌於 FBX，FBXLoader 自動解出。

const BASE = import.meta.env.BASE_URL || '/';
const FBX_URL = BASE + 'models/HuangZhong/Meshy_AI_Huang_Zhong_TPose_biped_Meshy_AI_Meshy_Merged_Animations.fbx';

const TARGET_HEIGHT = 4.5;   // 正規化後的世界高度（同近戰武將）
const MODEL_YAW = 0;         // 正面方向修正：若模型背對戰場，改為 Math.PI
const BRIGHTEN = 0.5;        // 自發光提亮，昏暗場景仍清楚

let template = null;
let loading = null;
const waiters = [];

function findClip(anims, keyword) {
  const k = keyword.toLowerCase();
  return anims.find((a) => (a.name || '').toLowerCase().includes(k)) || null;
}

export function preloadHuangzhong() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const loader = new FBXLoader();
    loader.load(
      FBX_URL,
      (fbx) => {
        const anims = fbx.animations || [];
        const box = new THREE.Box3().setFromObject(fbx);
        const size = box.getSize(new THREE.Vector3());
        const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
        template = {
          object: fbx,
          scale,
          min: box.min.clone(),
          center: box.getCenter(new THREE.Vector3()),
          walkClip: findClip(anims, 'walking'),
          shotClip: findClip(anims, 'archery_shot_3') || findClip(anims, 'shot'),
        };
        if (!template.walkClip || !template.shotClip) {
          console.warn('[huangzhong] 動作名稱：', anims.map((a) => a.name));
        }
        resolve(template);
        for (const w of waiters) w(build());
        waiters.length = 0;
      },
      undefined,
      (err) => { console.error('[huangzhong] FBX 載入失敗', err); reject(err); }
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
  if (t.shotClip) actions.shot = mixer.clipAction(t.shotClip);
  return { model, mixer, actions };
}

export function spawnHuangzhong(onReady) {
  if (template) { queueMicrotask(() => onReady(build())); return; }
  waiters.push(onReady);
  preloadHuangzhong();
}

preloadHuangzhong();
