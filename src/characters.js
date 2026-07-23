import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

import lubuFbx from './res/charactor/lubu/Lubu.fbx?url';
import lubuTex from './res/charactor/lubu/Lubu.png?url';
import guanyuFbx from './res/charactor/guanyu/GuanYu_260520.fbx?url';
import guanyuTex from './res/charactor/guanyu/guanyu.jpg?url';
import greenDragonTex from './res/charactor/guanyu/greendragon.jpg?url';

// 可操控的近戰武將角色（FBX 模型 + 動作切片）------------------------
// clips: 動作名稱 → [起始影格, 結束影格]（依匯出 take 的 frame 區間切片）
// attackCycle: 揮刀時輪替的動作名稱；ultimate（若有）為每 N 刀觸發的大絕招
// singleTex: 整份模型套用單一貼圖（呂布）；textureMap: 依貼圖檔名對應 URL（關羽多材質）

export const CHARACTERS = {
  lubu: {
    id: 'lubu',
    name: '呂布',
    btn: 'textures/charactorBtn/lubu.png',
    fbx: lubuFbx,
    fps: 30,
    height: 4.5,
    yaw: 0,
    singleTex: lubuTex,
    hideNodes: /(^|[|:])chituma$/i,   // 隱藏同 FBX 內的赤兔馬
    clips: { idle: [10, 70], attack1: [234, 264], attack2: [80, 143], attack4: [534, 550], ultimate: [153, 224] },
    attackCycle: ['attack1', 'attack2', 'attack4'],
  },
  guanyu: {
    id: 'guanyu',
    name: '關羽',
    btn: 'textures/charactorBtn/guanyu.png',
    fbx: guanyuFbx,
    fps: 30,
    height: 4.5,
    yaw: 0,
    // FBX 材質引用 GuanYu.jpg（身體）與 GreenDragon.jpg（青龍偃月刀），改指向打包後的資源
    textureMap: { 'guanyu.jpg': guanyuTex, 'greendragon.jpg': greenDragonTex },
    brighten: 2.1,   // 模型偏暗 → 以 shader 提亮（光照前基礎色 + 光照後輸出色）
    clips: { idle: [66, 126], attack1: [213, 278], attack2: [284, 396], attack3: [822, 886], attack4: [892, 952] },
    attackCycle: ['attack1', 'attack2', 'attack3', 'attack4'],
  },
};

export const CHARACTER_ORDER = ['lubu', 'guanyu'];

const cache = {};

// 回傳 { object, clips }：object 為原始 FBX 群組，clips 為切好的 AnimationClip 對照表。
export function loadCharacter(def) {
  if (cache[def.id]) return cache[def.id];

  cache[def.id] = new Promise((resolve, reject) => {
    const manager = new THREE.LoadingManager();
    // 多材質模型：把 FBX 內以檔名引用的貼圖導向 Vite 打包後的實際 URL
    if (def.textureMap) {
      const byBase = {};
      for (const [k, v] of Object.entries(def.textureMap)) byBase[k.toLowerCase()] = v;
      manager.setURLModifier((url) => {
        const base = url.split(/[\\/]/).pop().toLowerCase();
        return byBase[base] || url;
      });
    }

    const loader = new FBXLoader(manager);
    loader.load(
      def.fbx,
      (fbx) => {
        // 隱藏指定節點（名稱尾端比對，FBX 可能帶 namespace）
        if (def.hideNodes) {
          fbx.traverse((o) => {
            if (def.hideNodes.test(o.name || '')) o.traverse((c) => { c.visible = false; });
          });
        }

        // 單一貼圖模式：整份模型套同一張圖（呂布）
        let singleTex = null;
        if (def.singleTex) {
          singleTex = new THREE.TextureLoader().load(def.singleTex);
          singleTex.colorSpace = THREE.SRGBColorSpace;
        }

        fbx.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          const fix = (m) => {
            if (!m) return;
            if (singleTex) {
              m.map = singleTex;
              if (m.color) m.color.set(0xffffff);
            } else if (m.map) {
              m.map.colorSpace = THREE.SRGBColorSpace;   // 多材質：修正既有貼圖色彩空間
            }
            // 以 shader 提亮偏暗的模型：
            //  1) 光照前把基礎色乘上係數（讓固有色更鮮明）
            //  2) 光照後再乘最終輸出色（不受場景光影響，保證整體變亮）
            if (def.brighten && def.brighten !== 1) {
              m.onBeforeCompile = (shader) => {
                shader.uniforms.uBrighten = { value: def.brighten };
                shader.fragmentShader = 'uniform float uBrighten;\n' + shader.fragmentShader
                  .replace(
                    '#include <map_fragment>',
                    '#include <map_fragment>\n  diffuseColor.rgb *= mix(1.0, uBrighten, 0.6);'
                  )
                  .replace(
                    '#include <dithering_fragment>',
                    '#include <dithering_fragment>\n  gl_FragColor.rgb *= uBrighten;'
                  );
              };
            }
            m.needsUpdate = true;
          };
          if (Array.isArray(o.material)) o.material.forEach(fix);
          else fix(o.material);
        });

        // 依影格區間切出各動作子片段
        const source = fbx.animations && fbx.animations[0];
        const clips = {};
        for (const [name, [a, b]] of Object.entries(def.clips)) {
          clips[name] = source
            ? THREE.AnimationUtils.subclip(source, name, a, b, def.fps)
            : null;
        }

        resolve({ object: fbx, clips });
      },
      undefined,
      reject
    );
  });

  return cache[def.id];
}
