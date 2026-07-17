import * as THREE from 'three';
import { FIELD } from './config.js';

// 建立渲染器、場景、攝影機、燈光、戰場地面與三國背景 --------------

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9ab0c8, 34, 62);
  scene.background = makeSkyTexture();

  // 攝影機：俯視戰場的斜角（模仿魚機視角）
  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 17, 20);
  camera.lookAt(0, 0, -6);

  // 燈光
  const ambient = new THREE.AmbientLight(0xfff2d8, 0.75);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffe6b0, 1.15);
  sun.position.set(-14, 24, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  scene.add(sun);

  const rim = new THREE.DirectionalLight(0x88aaff, 0.35);
  rim.position.set(10, 10, -20);
  scene.add(rim);

  buildGround(scene);
  buildBackdrop(scene);
  buildBanners(scene);

  return { renderer, scene, camera };
}

// ---------- 天空背景（畫布貼圖）----------
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');

  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#cfe3f5');
  sky.addColorStop(0.55, '#eae0c8');
  sky.addColorStop(1, '#d8c39a');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);

  // 遠山
  drawMountains(g, 300, '#8fa0b0', 60);
  drawMountains(g, 340, '#748699', 90);

  // 長城剪影
  g.fillStyle = '#5a6472';
  const baseY = 350;
  g.fillRect(0, baseY, 1024, 30);
  for (let x = 0; x < 1024; x += 90) {
    // 城牆垛口
    for (let i = 0; i < 6; i++) {
      g.fillRect(x + i * 15, baseY - 8, 8, 8);
    }
    // 烽火台
    if ((x / 90) % 3 === 0) {
      g.fillRect(x + 20, baseY - 40, 46, 40);
      g.fillRect(x + 14, baseY - 46, 58, 8);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawMountains(g, baseY, color, height) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, baseY);
  let x = 0;
  while (x < 1024) {
    const w = 120 + (x % 3) * 40;
    const h = height * (0.6 + ((x * 13) % 40) / 100);
    g.lineTo(x + w / 2, baseY - h);
    g.lineTo(x + w, baseY);
    x += w;
  }
  g.lineTo(1024, baseY);
  g.lineTo(1024, 512);
  g.lineTo(0, 512);
  g.closePath();
  g.fill();
}

// ---------- 戰場地面 ----------
function buildGround(scene) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');

  // 泥土 / 枯草戰場底色
  g.fillStyle = '#7d6a3f';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) {
    const x = (i * 97) % 512;
    const y = (i * 211) % 512;
    const shade = 40 + ((i * 53) % 60);
    g.fillStyle = `rgba(${shade + 60},${shade + 50},${shade},0.25)`;
    g.fillRect(x, y, 2, 2);
  }
  // 草綠斑塊
  for (let i = 0; i < 60; i++) {
    const x = (i * 137) % 512;
    const y = (i * 251) % 512;
    g.fillStyle = 'rgba(90,120,50,0.35)';
    g.beginPath();
    g.arc(x, y, 12 + (i % 5) * 4, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);

  const geo = new THREE.PlaneGeometry(120, 120);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -6;
  ground.receiveShadow = true;
  scene.add(ground);

  // 中央土道
  const roadGeo = new THREE.PlaneGeometry(10, 120);
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x6b5730, roughness: 1 });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, -6);
  road.receiveShadow = true;
  scene.add(road);
}

// ---------- 遠處立體背景（帳篷、鼓、木柵）----------
function buildBackdrop(scene) {
  // 軍營帳篷（遠端左右）
  const tentPositions = [-16, -8, 8, 16];
  for (const x of tentPositions) {
    const tent = makeTent();
    tent.position.set(x, 0, FIELD.minZ - 3);
    scene.add(tent);
  }

  // 兩側木柵欄
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 8; i++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.3, 2.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x5a3f22, roughness: 1 })
      );
      post.position.set(side * 24, 1.1, FIELD.minZ + i * 2.6);
      post.castShadow = true;
      scene.add(post);
    }
  }
}

function makeTent() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0, 2.4, 3.2, 4),
    new THREE.MeshStandardMaterial({ color: 0x7a2a2a, roughness: .9 })
  );
  body.position.y = 1.6;
  body.rotation.y = Math.PI / 4;
  body.castShadow = true;
  g.add(body);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a2a12 })
  );
  pole.position.y = 3.7;
  g.add(pole);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.6),
    new THREE.MeshStandardMaterial({ color: 0xffd24a, side: THREE.DoubleSide })
  );
  flag.position.set(0.45, 3.9, 0);
  g.add(flag);
  return g;
}

// ---------- 三國旗幟（魏蜀吳）----------
function buildBanners(scene) {
  const flags = [
    { char: '魏', color: '#2a5bb2', x: -18 },
    { char: '蜀', color: '#b23a2a', x: -6 },
    { char: '吳', color: '#2a9a5b', x: 6 },
    { char: '漢', color: '#8a6a2a', x: 18 },
  ];
  for (const f of flags) {
    const banner = makeBanner(f.char, f.color);
    banner.position.set(f.x, 0, FIELD.minZ - 1);
    scene.add(banner);
  }
}

function makeBanner(char, color) {
  const g = new THREE.Group();

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a2a12, roughness: 1 })
  );
  pole.position.y = 4;
  pole.castShadow = true;
  g.add(pole);

  // 旗面貼圖
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 256);
  ctx.strokeStyle = '#ffe27a';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 116, 244);
  ctx.fillStyle = '#ffe9b0';
  ctx.font = 'bold 120px "Microsoft JhengHei", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, 64, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 4.4),
    new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: .9 })
  );
  flag.position.set(1.4, 5.4, 0);
  g.add(flag);
  return g;
}
