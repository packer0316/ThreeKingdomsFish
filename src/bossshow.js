// Boss 開獎表演（bossShow）系統 --------------------------------------
// 玩家（中座）擊殺鎮守 Boss 後進入的獎勵表演，流程：
//   故事圖卡（每張 4 秒、交叉淡入淡出）→ 壓黑畫面 → 三選一開獎（選樹）
//   → 華麗滾分（0 → 獲獎金額，4 秒）→ 結束、玩家恢復攻擊。
// 表演期間 main.js 的遊戲迴圈以 bossShow.active 暫停一切攻擊與更新。
//
// 新 Boss 要加表演：在 SHOWS 增加一筆（key = config.js 的 boss.id）即可。

import tsao1 from './res/bossShow/tsaotsao/tsaotsao 1.png';
import tsao2 from './res/bossShow/tsaotsao/tsaotsao 2.png';
import hua1 from './res/bossShow/huaShong/huaShong 1.png';
import hua2 from './res/bossShow/huaShong/huaShong 2.png';
import hua31 from './res/bossShow/huaShong/huaShong 3-1.png';
import hua32 from './res/bossShow/huaShong/huaShong 3-2.png';

// 開獎模式二選一：
//   choice — 三選一（選樹）：winTree / otherTrees / bigMult / smallMult
//   fate   — 命運圖：機率抽一張結果圖展示數秒，直接決定倍率（outcomes）
const SHOWS = {
  // 華雄：溫酒斬華雄（命運開獎——酒尚溫則大獎）
  huaxiong: {
    title: '溫酒斬華雄',
    sub: '董卓帳前都督・華雄',
    slides: [
      { src: hua1, caption: '雲長停盞而出，不多時已提華雄之首，擲於帳前！' },
      { src: hua2, caption: '出戰前曹操親酌一杯，尚未沾唇——此刻端起，溫耶？涼耶？' },
    ],
    slideSeconds: 4,
    fate: {
      seconds: 4,
      outcomes: [
        // chance 相加應為 1；抽中哪張就以該張的倍率區間開獎
        { src: hua31, chance: 0.5, big: false, mult: [1000, 2000],
          caption: '杯已涼透——遲了半步！且領犒軍之賞。', title: '犒軍之賞' },
        { src: hua32, chance: 0.5, big: true, mult: [5000, 10000],
          caption: '杯中尚溫！雲長神威蓋世——天賜大獎！', title: '酒尚溫・神威大獎' },
      ],
    },
  },
  // 曹操：望梅止渴
  caocao: {
    title: '望梅止渴',
    sub: '漢丞相・曹操',
    slides: [
      { src: tsao1, caption: '大軍跋涉，烈日當空——將士口渴難耐，行伍漸亂……' },
      { src: tsao2, caption: '操揚鞭遙指：「前方有大梅林，梅子甘酸，可以解渴！」' },
    ],
    slideSeconds: 4,
    prompt: '梅林何在？選一棵樹，開出你的獎賞！',
    bigMult: [5000, 10000],   // 選中梅子樹：bet 倍率區間（含兩端）
    smallMult: [1000, 2000],  // 選到其他樹
    winTree: { type: 'plum', name: '梅子樹' },
    otherTrees: [
      { type: 'pine', name: '松樹' },
      { type: 'willow', name: '柳樹' },
      { type: 'dead', name: '枯樹' },
    ],
    bigTitle: '梅開大獎',
    smallTitle: '犒軍之賞',
  },
};

export function hasBossShow(bossId) {
  return !!SHOWS[bossId];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randInt = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

// ---------- 程序化寫實樹木（canvas 手繪，光源固定左上）----------
// 遞迴分枝 + 樹皮色漸層 + 葉叢radial光影 + 細葉噴點；每種樹固定亂數種子，
// 每次開演長相一致。type: mystery | plum | pine | willow | dead

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerpColor(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const ch = (sh) => {
    const x = (a >> sh) & 255, y = (b >> sh) & 255;
    return Math.round(x + (y - x) * t);
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// 葉叢：左上受光的radial漸層圓
function blob(g, x, y, r, base, light, alpha = 1) {
  const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
  grad.addColorStop(0, light);
  grad.addColorStop(1, base);
  g.globalAlpha = alpha;
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, 7);
  g.fill();
  g.globalAlpha = 1;
}

// 遞迴樹枝：微彎的二次曲線，越細顏色越淺；末梢座標收進 tips
function growBranch(g, rng, x, y, angle, len, w, depth, cfg, tips) {
  const x2 = x + Math.cos(angle) * len;
  const y2 = y + Math.sin(angle) * len;
  const bow = (rng() - 0.5) * len * cfg.twist;
  const mx = (x + x2) / 2 + Math.cos(angle + Math.PI / 2) * bow;
  const my = (y + y2) / 2 + Math.sin(angle + Math.PI / 2) * bow;
  g.strokeStyle = lerpColor(cfg.barkDark, cfg.barkLight, 1 - depth / cfg.depth);
  g.lineWidth = Math.max(1, w);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(mx, my, x2, y2);
  g.stroke();

  if (depth <= 0 || w < 1.1) {
    tips.push({ x: x2, y: y2 });
    return;
  }
  const n = rng() < cfg.threeWay ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const na = angle + (i - (n - 1) / 2) * cfg.spread + (rng() - 0.5) * cfg.jitter;
    growBranch(g, rng, x2, y2, na, len * (0.68 + rng() * 0.14), w * 0.62, depth - 1, cfg, tips);
  }
}

const TREE_SEED = { mystery: 9, plum: 21, pine: 2, willow: 14, dead: 6 };

function renderTree(type) {
  const W = 360, H = 420, cx = W / 2, groundY = 392;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const rng = mulberry32(TREE_SEED[type] || 1);

  // 地面落影
  g.fillStyle = 'rgba(0,0,0,0.32)';
  g.beginPath();
  g.ellipse(cx, groundY + 6, 78, 13, 0, 0, 7);
  g.fill();

  const tips = [];
  if (type === 'pine') {
    // 松樹：筆直樹幹 + 疊層針葉塔
    g.strokeStyle = '#4a3524';
    g.lineWidth = 13;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx, groundY);
    g.lineTo(cx, 180);
    g.stroke();
    const tiers = 6;
    for (let i = tiers - 1; i >= 0; i--) {
      const t = i / (tiers - 1);                 // 0 = 頂層
      const ty = 96 + t * 200;                   // 該層頂點
      const hw = 26 + t * 76;                    // 半寬
      const th = 58 + t * 18;                    // 層高
      const grad = g.createLinearGradient(cx - hw, ty, cx + hw, ty + th);
      grad.addColorStop(0, '#41603a');
      grad.addColorStop(0.5, '#2c4527');
      grad.addColorStop(1, '#1d3019');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(cx, ty);
      g.lineTo(cx - hw, ty + th);
      g.lineTo(cx + hw, ty + th);
      g.closePath();
      g.fill();
      // 層底緣鬆散的針葉團，柔化三角形硬邊
      for (let k = 0; k < 14; k++) {
        const fx = cx - hw + (hw * 2 * k) / 13 + (rng() - 0.5) * 8;
        blob(g, fx, ty + th - 3 + (rng() - 0.5) * 7, 8 + rng() * 6, '#22381f', '#3d5a30', 0.9);
      }
    }
    blob(g, cx, 92, 12, '#22381f', '#446238');    // 樹梢
  } else {
    // 闊葉樹系：遞迴長枝
    const CFG = {
      mystery: { depth: 7, twist: 0.5, spread: 0.55, jitter: 0.5, threeWay: 0.35, barkDark: '#33241a', barkLight: '#5c4630' },
      plum:    { depth: 7, twist: 0.9, spread: 0.7,  jitter: 0.65, threeWay: 0.3,  barkDark: '#2c1e16', barkLight: '#544033' },
      willow:  { depth: 6, twist: 0.45, spread: 0.5, jitter: 0.45, threeWay: 0.3,  barkDark: '#3a2c1e', barkLight: '#615038' },
      dead:    { depth: 8, twist: 1.05, spread: 0.75, jitter: 0.8, threeWay: 0.4,  barkDark: '#3c342c', barkLight: '#6c6154' },
    }[type];
    growBranch(g, rng, cx, groundY, -Math.PI / 2 + (rng() - 0.5) * 0.12,
      type === 'dead' ? 92 : 84, 15, CFG.depth, CFG, tips);

    // 樹冠內部先鋪底層葉叢（枝梢圓叢會排成外圈，中心需要填實）
    if (type !== 'dead' && tips.length) {
      const cm = tips.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
      cm.x /= tips.length;
      cm.y /= tips.length;
      const fill = { mystery: ['#35512a', '#5d7f3a'], plum: ['#425e2d', '#6a8a45'], willow: ['#3c5a2a', '#618540'] }[type];
      const nFill = type === 'willow' ? 5 : 8;
      for (let i = 0; i < nFill; i++) {
        blob(g, cm.x + (rng() - 0.5) * 70, cm.y + (rng() - 0.5) * 46,
          20 + rng() * 12, fill[0], fill[1], 0.88);
      }
    }

    if (type === 'mystery') {
      for (const p of tips) if (rng() < 0.8) blob(g, p.x, p.y, 15 + rng() * 15, '#3d5c2e', '#6e9142', 0.92);
      for (let i = 0; i < 220; i++) {            // 細葉噴點提亮
        const p = tips[(rng() * tips.length) | 0];
        g.fillStyle = `rgba(140,172,88,${0.25 + rng() * 0.4})`;
        g.fillRect(p.x + (rng() - 0.5) * 44, p.y + (rng() - 0.5) * 40, 2.2, 2.2);
      }
    } else if (type === 'plum') {
      for (const p of tips) if (rng() < 0.75) blob(g, p.x, p.y, 12 + rng() * 12, '#4b6b33', '#7f9c52', 0.9);
      for (let i = 0; i < 140; i++) {
        const p = tips[(rng() * tips.length) | 0];
        g.fillStyle = `rgba(158,188,104,${0.25 + rng() * 0.35})`;
        g.fillRect(p.x + (rng() - 0.5) * 38, p.y + (rng() - 0.5) * 34, 2.2, 2.2);
      }
      for (let i = 0; i < 30; i++) {             // 纍纍梅子（黃綠圓果 + 高光）
        const p = tips[(rng() * tips.length) | 0];
        const fx = p.x + (rng() - 0.5) * 34, fy = p.y + (rng() - 0.5) * 30 + 6;
        const r = 4.5 + rng() * 2.5;
        const grad = g.createRadialGradient(fx - r * 0.3, fy - r * 0.35, r * 0.2, fx, fy, r);
        grad.addColorStop(0, '#e6d75e');
        grad.addColorStop(1, '#8fae3c');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(fx, fy, r, 0, 7);
        g.fill();
        g.fillStyle = 'rgba(255,255,240,0.55)';
        g.beginPath();
        g.arc(fx - r * 0.35, fy - r * 0.4, r * 0.22, 0, 7);
        g.fill();
      }
    } else if (type === 'willow') {
      for (const p of tips) if (rng() < 0.6) blob(g, p.x, p.y, 9 + rng() * 9, '#44652f', '#71954a', 0.85);
      const top = tips.filter((p) => p.y < 250);
      for (let i = 0; i < 22; i++) {             // 垂柳長條
        const p = top.length ? top[(rng() * top.length) | 0] : { x: cx, y: 200 };
        const dx = (rng() - 0.5) * 90;
        const ex = p.x + dx * 1.5, ey = p.y + 140 + rng() * 70;
        g.strokeStyle = `rgba(92,128,58,${0.65 + rng() * 0.3})`;
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.quadraticCurveTo(p.x + dx, p.y + 60, ex, ey);
        g.stroke();
        for (let k = 1; k <= 8; k++) {           // 條上細葉
          const t = k / 9;
          const lx = (1 - t) * (1 - t) * p.x + 2 * (1 - t) * t * (p.x + dx) + t * t * ex;
          const ly = (1 - t) * (1 - t) * p.y + 2 * (1 - t) * t * (p.y + 60) + t * t * ey;
          g.fillStyle = `rgba(126,160,80,${0.5 + rng() * 0.3})`;
          g.fillRect(lx + (rng() - 0.5) * 4, ly, 1.8, 4.5);
        }
      }
    }
    // dead：不長葉，光禿枝椏即完成
  }
  return cv;
}

// 同型樹共用 dataURL（一個 canvas 元素不能同時掛在多張卡上）
const _treeUrls = new Map();
function treeImg(type) {
  let url = _treeUrls.get(type);
  if (!url) {
    url = renderTree(type).toDataURL();
    _treeUrls.set(type, url);
  }
  const img = new Image();
  img.src = url;
  img.className = 'bs-tree-img';
  img.draggable = false;
  return img;
}

export class BossShow {
  constructor(root) {
    this.active = false;

    // 預載表演圖片，開演時不會閃白
    for (const show of Object.values(SHOWS)) {
      for (const s of show.slides) new Image().src = s.src;
      if (show.fate) for (const o of show.fate.outcomes) new Image().src = o.src;
    }

    this.el = document.createElement('div');
    this.el.id = 'bossshow';
    this.el.classList.add('hidden');
    this.el.innerHTML =
      `<div class="bs-veil"></div>` +
      `<div class="bs-head">` +
        `<div class="bs-head-sub"></div>` +
        `<div class="bs-head-title"></div>` +
      `</div>` +
      `<div class="bs-slide"><img class="bs-img" alt="" draggable="false"><div class="bs-caption"></div></div>` +
      `<button class="bs-skip">跳過 ▸</button>` +
      `<div class="bs-choice hidden">` +
        `<div class="bs-prompt"></div>` +
        `<div class="bs-trees"></div>` +
      `</div>` +
      `<div class="bs-prize hidden">` +
        `<div class="bs-rays"></div>` +
        `<div class="bs-prize-title"></div>` +
        `<div class="bs-mult"></div>` +
        `<div class="bs-amount">0</div>` +
        `<div class="bs-prize-sub">籌碼入袋！</div>` +
      `</div>`;
    root.appendChild(this.el);

    this.q = (sel) => this.el.querySelector(sel);
    this.q('.bs-skip').addEventListener('click', () => { this._skip = true; });
  }

  // 開演。bet = 玩家目前下注；結束時呼叫 onFinish(prize, mult, isBig)。
  async play(bossId, bet, onFinish) {
    const show = SHOWS[bossId];
    if (!show || this.active) return;
    this.active = true;
    this._skip = false;

    const veil = this.q('.bs-veil');
    const slide = this.q('.bs-slide');
    const img = this.q('.bs-img');
    const caption = this.q('.bs-caption');
    const skip = this.q('.bs-skip');
    const choice = this.q('.bs-choice');
    const prizeEl = this.q('.bs-prize');

    // 重置各階段狀態
    this.q('.bs-head-title').textContent = show.title;
    this.q('.bs-head-sub').textContent = show.sub;
    veil.classList.remove('black');
    slide.classList.remove('show');
    choice.classList.add('hidden');
    prizeEl.classList.add('hidden');
    prizeEl.classList.remove('celebrate', 'big');
    skip.classList.remove('hidden');
    this.el.classList.remove('hidden');
    void this.el.offsetWidth;             // 觸發 overlay 淡入
    this.el.classList.add('show');

    // ---- 故事圖卡：逐張淡入 → 停留 slideSeconds 秒 → 淡出 ----
    for (const s of show.slides) {
      if (this._skip) break;
      img.src = s.src;
      caption.textContent = s.caption;
      slide.classList.add('show');
      await this._wait(show.slideSeconds * 1000 + 800);   // 含 0.8s 淡入
      if (this._skip) break;
      slide.classList.remove('show');                     // 淡出 0.8s
      await this._wait(800);
    }

    this._skip = false;               // 跳過只作用於故事段
    skip.classList.add('hidden');

    let isBig, mult, prizeTitle;
    if (show.fate) {
      // ---- 命運開獎：依機率抽一張結果圖，如圖卡展示數秒 ----
      slide.classList.remove('show');
      await sleep(850);                          // 等前一張圖卡完全退場
      let roll = Math.random();
      let outcome = show.fate.outcomes[show.fate.outcomes.length - 1];
      for (const o of show.fate.outcomes) {
        if (roll < o.chance) { outcome = o; break; }
        roll -= o.chance;
      }
      img.src = outcome.src;
      caption.textContent = outcome.caption;
      slide.classList.add('show');
      await sleep(show.fate.seconds * 1000 + 800);
      slide.classList.remove('show');
      veil.classList.add('black');               // 壓黑進滾分
      await sleep(900);
      isBig = outcome.big;
      mult = randInt(outcome.mult);
      prizeTitle = outcome.title;
    } else {
      // ---- 壓黑畫面 → 三選一開獎：一棵梅子樹藏在其中 ----
      slide.classList.remove('show');
      veil.classList.add('black');
      await sleep(900);

      const plumIndex = (Math.random() * 3) | 0;
      const others = [...show.otherTrees].sort(() => Math.random() - 0.5).slice(0, 2);
      this.q('.bs-prompt').textContent = show.prompt;
      const treesEl = this.q('.bs-trees');
      treesEl.innerHTML = '';

      const pickedIndex = await new Promise((resolve) => {
        let done = false;
        for (let i = 0; i < 3; i++) {
          const card = document.createElement('div');
          card.className = 'bs-tree';
          card.style.animationDelay = `${i * 0.12}s`;
          card.innerHTML =
            `<div class="bs-tree-fig"></div>` +
            `<div class="bs-tree-label">？</div>`;
          card.querySelector('.bs-tree-fig').appendChild(treeImg('mystery'));
          card.addEventListener('click', () => {
            if (done) return;
            done = true;
            resolve(i);
          });
          treesEl.appendChild(card);
        }
        choice.classList.remove('hidden');
      });

      // 開牌：全部翻開，選中的加框、梅子樹發光
      isBig = pickedIndex === plumIndex;
      const cards = [...treesEl.children];
      let otherIdx = 0;
      cards.forEach((card, i) => {
        const tree = i === plumIndex ? show.winTree : others[otherIdx++];
        card.classList.add('revealed');
        if (i === pickedIndex) card.classList.add('picked');
        if (i === plumIndex) card.classList.add('plum');
        card.querySelector('.bs-tree-fig').replaceChildren(treeImg(tree.type));
        card.querySelector('.bs-tree-label').textContent = tree.name;
      });
      await sleep(1600);
      choice.classList.add('hidden');
      mult = randInt(isBig ? show.bigMult : show.smallMult);
      prizeTitle = isBig ? show.bigTitle : show.smallTitle;
    }

    // ---- 華麗滾分：0 → 獲獎金額（4 秒），點擊可直接滾滿 ----
    const prize = mult * bet;
    this.q('.bs-prize-title').textContent = prizeTitle;
    this.q('.bs-mult').textContent = `× ${fmt(mult)} 倍`;
    const amountEl = this.q('.bs-amount');
    amountEl.textContent = '0';
    prizeEl.classList.remove('hidden');
    prizeEl.classList.toggle('big', isBig);

    await this._rollAmount(amountEl, prize, 4000);
    prizeEl.classList.add('celebrate');       // 滾滿：金額爆擊 + 沖擊波 + 光芒加速
    this._burstCoins(isBig ? 46 : 28);        // 金幣噴發
    this._screenShake(isBig);                 // 螢幕震一下
    await this._holdOrClick(2200);            // 停留展示（點擊提早收場）

    // ---- 收場：淡出、恢復戰鬥 ----
    this.el.classList.remove('show');
    await sleep(500);
    this.el.classList.add('hidden');
    this.active = false;
    if (onFinish) onFinish(prize, mult, isBig);
  }

  // 滾動分數：requestAnimationFrame 由 0 加到 target，easeOut 收尾；
  // 期間點擊畫面直接滾滿。
  _rollAmount(el, target, durationMs) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      let raf = 0;
      const finish = () => {
        this.el.removeEventListener('pointerdown', finish);
        cancelAnimationFrame(raf);
        el.textContent = fmt(target);
        resolve();
      };
      this.el.addEventListener('pointerdown', finish);
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / durationMs);
        const eased = 1 - Math.pow(1 - t, 2.2);
        el.textContent = fmt(target * eased);
        if (t >= 1) return finish();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  }

  // 金幣噴發：由中心噴出後落下（純 CSS 動畫，動畫結束即移除）
  _burstCoins(n) {
    const prize = this.q('.bs-prize');
    if (!prize) return;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'bs-coin';
      c.style.left = '50%';
      c.style.top = '56%';
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15; // 上半噴射
      const dist = 160 + Math.random() * 420;
      c.style.setProperty('--tx', `${Math.cos(ang) * dist}px`);
      c.style.setProperty('--ty', `${-Math.abs(Math.sin(ang)) * dist - 60}px`);
      c.style.setProperty('--rot', `${(Math.random() * 720 - 360)}deg`);
      c.style.setProperty('--dur', `${1.1 + Math.random()}s`);
      c.style.animationDelay = `${Math.random() * 0.25}s`;
      prize.appendChild(c);
      setTimeout(() => c.remove(), 2600);
    }
  }

  // 螢幕震動（重用 game-root 的 fx-shake）
  _screenShake(strong) {
    const root = document.getElementById('game-root');
    if (!root) return;
    const cls = strong ? 'fx-shake-strong' : 'fx-shake';
    root.classList.remove(cls);
    void root.offsetWidth;
    root.classList.add(cls);
    setTimeout(() => root.classList.remove(cls), 900);
  }

  // 可被「跳過」提前結束的等待（每 100ms 檢查一次）
  async _wait(ms) {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      if (this._skip) return;
      await sleep(Math.min(100, end - performance.now()));
    }
  }

  // 停留 ms 毫秒，期間點擊畫面可提早結束
  _holdOrClick(ms) {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.el.removeEventListener('pointerdown', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.el.addEventListener('pointerdown', done);
    });
  }
}
