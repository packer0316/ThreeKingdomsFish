import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import fbxUrl from './res/charactor/lubu/Lubu.fbx?url';
import texUrl from './res/charactor/lubu/Lubu.png?url';

// 呂布 FBX 模型載入 + 動作切片 ---------------------------------------
// 依 LUBU_ANIM_DEFINE.txt 的 frame 區間，把整段 take 切成命名子動畫。
// idle 10~70 / attack1 234~264 / attack2 80~143 / attack4 534~550 / 大絕招 153~224

// FBX 匯出時的影格率（多數為 30fps；若動作快慢不對可調整此值）
const FPS = 30;

// 動作名稱 → [起始影格, 結束影格]
export const LUBU_CLIPS = {
  idle:     [10, 70],
  attack1:  [234, 264],
  attack2:  [80, 143],
  attack4:  [534, 550],
  ultimate: [153, 224],   // 大絕招
};

let cachePromise = null;

// 回傳 { object, clips }；object 為原始 FBX 群組，clips 為切好的 AnimationClip 對照表。
export function loadLubu() {
  if (cachePromise) return cachePromise;

  cachePromise = new Promise((resolve, reject) => {
    const loader = new FBXLoader();
    loader.load(
      fbxUrl,
      (fbx) => {
        // 貼上呂布身體貼圖
        const tex = new THREE.TextureLoader().load(texUrl);
        tex.colorSpace = THREE.SRGBColorSpace;

        // 赤兔馬與呂布包在同一份 FBX 中；遊戲只顯示武將本體。
        // FBX 節點有時會帶 namespace（例如 Lubu:Chituma），因此比對名稱尾端。
        const chitumaNodes = [];
        fbx.traverse((o) => {
          if (/(^|[|:])chituma$/i.test(o.name || '')) chitumaNodes.push(o);
        });
        for (const node of chitumaNodes) {
          node.traverse((o) => { o.visible = false; });
        }

        fbx.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          const applyTex = (m) => {
            if (!m) return;
            m.map = tex;
            if (m.color) m.color.set(0xffffff);
            m.needsUpdate = true;
          };
          if (Array.isArray(o.material)) o.material.forEach(applyTex);
          else applyTex(o.material);
        });

        // 依影格區間切出各動作子片段
        const source = fbx.animations && fbx.animations[0];
        const clips = {};
        for (const [name, [a, b]] of Object.entries(LUBU_CLIPS)) {
          clips[name] = source
            ? THREE.AnimationUtils.subclip(source, name, a, b, FPS)
            : null;
        }

        resolve({ object: fbx, clips });
      },
      undefined,
      reject
    );
  });

  return cachePromise;
}
