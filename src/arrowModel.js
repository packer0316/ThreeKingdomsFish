import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { makeProjectile as makeProjectileProc } from './models.js';

// 箭矢 FBX 模型（public/models/arrow/）--------------------------------
// 黃忠與其他玩家射出的箭皆改用此模型。貼圖內嵌於 FBX，FBXLoader 自動解出。
// 飛行方向對齊：BulletManager 以 mesh.lookAt(方向) 定向，three.js 物件的
// 「前方」為 -Z，故模型最長軸需對齊到 -Z、箭頭朝 -Z。

const BASE = import.meta.env.BASE_URL || '/';
const FBX_URL = BASE + 'models/arrow/Meshy_AI_Simple_Arrow_0724130644_texture.fbx';

const TARGET_LEN = 1.8 * 2.5;  // 正規化後的箭身長度（世界單位）——放大 2.5 倍
const TIP_TOWARD_NEG_Z = true; // 若箭頭朝反方向，改成 false
const BRIGHTEN = 0.6;          // 自發光提亮，讓箭在昏暗場景仍清楚

let template = null;   // { object, scale, offset:Vector3, align:Euler }

function preloadArrow() {
  const loader = new FBXLoader();
  loader.load(
    FBX_URL,
    (fbx) => {
      const box = new THREE.Box3().setFromObject(fbx);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      // 最長軸即箭身方向；求出把該軸轉到 Z 軸所需的旋轉
      const axis = size.x >= size.y && size.x >= size.z ? 'x'
        : (size.y >= size.z ? 'y' : 'z');
      const longest = size[axis] || 1;
      const scale = TARGET_LEN / longest;

      const align = new THREE.Euler();
      if (axis === 'x') align.y = Math.PI / 2;   // X → Z
      else if (axis === 'y') align.x = -Math.PI / 2; // Y → Z
      // axis === 'z'：已對齊
      if (!TIP_TOWARD_NEG_Z) align.y += Math.PI;   // 反轉箭頭朝向

      // 貼圖自發光提亮（同其他 FBX 模型）
      fbx.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        const conv = (m) => {
          const tex = m ? (m.map || m.emissiveMap || null) : null;
          if (tex) tex.colorSpace = THREE.SRGBColorSpace;
          return new THREE.MeshLambertMaterial({
            map: tex,
            color: tex ? 0xffffff : new THREE.Color(0xcaa25a),
            emissive: 0xffffff,
            emissiveMap: tex,
            emissiveIntensity: BRIGHTEN,
          });
        };
        o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
      });

      template = { object: fbx, scale, center, align };
    },
    undefined,
    (err) => console.error('[arrow] FBX 載入失敗', err)
  );
}

// 取代原本程序化箭矢：回傳一個群組，內含定向、置中、縮放後的 FBX 箭矢。
// 模型尚未載入時退回程序化箭。
export function makeProjectile(color = 0xffe27a) {
  if (!template) return makeProjectileProc(color);

  const g = new THREE.Group();
  const arrow = cloneSkeleton(template.object);
  arrow.scale.setScalar(template.scale);
  // 先套對齊旋轉，再把幾何中心移到原點（於群組內以定向後座標歸零）
  arrow.rotation.copy(template.align);
  arrow.position.set(0, 0, 0);
  const inner = new THREE.Group();
  inner.add(arrow);
  // 置中：以世界包圍盒中心回退
  const b = new THREE.Box3().setFromObject(inner);
  const c = b.getCenter(new THREE.Vector3());
  arrow.position.sub(c);
  g.add(inner);
  return g;
}

preloadArrow();
