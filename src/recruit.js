// 招募系統：花費籌碼與時間，老虎機輪帶轉動後隨機招募到一名武將 ------
//
// 稀有度（由高至低）：
//   名將 SSR — 紅色
//   大將 SR  — 金色
//   良將 R   — 紫色
//   普通 H   — 白色
//
// 角色圖像來源：public/textures/characters/<名字>.jpg

export const RARITY = {
  SSR: { key: 'SSR', label: '名將', color: '#ff4d4d' },
  SR:  { key: 'SR',  label: '大將', color: '#ffd24a' },
  R:   { key: 'R',   label: '良將', color: '#c07af0' },
  H:   { key: 'H',   label: '普通', color: '#eaeef7' },
};

// 依知名度將 characters 資料夾中的武將分級
const TIERS = {
  SSR: ['呂布', '關羽', '張飛', '趙雲', '馬超', '黃忠', '諸葛亮', '曹操', '司馬懿', '周瑜'],
  SR:  ['張遼', '甘寧', '姜維', '魏延', '許褚', '夏侯惇', '龐德', '陸遜', '郭嘉', '賈詡', '董卓', '孫策', '孫權', '劉備', '徐晃'],
  R:   ['張郃', '樂進', '文醜', '顏良', '夏侯淵', '曹真', '曹休', '周泰', '魯肅', '呂蒙', '程普', '徐庶', '法正', '孫堅', '袁紹', '文鴦',
        '張昭', '張角', '李儒', '陳宮', '袁術'],
  H:   ['劉禪', '周倉', '審配', '闞澤', '諸葛恪'],
};

// 武將定位 ---------------------------------------------------------
//   類別 faction：文 / 武
//   專長 type：文 → 法 / 書；武 → 騎 / 槍 / 劍 / 弓
export const FACTION = {
  文: { label: '文', color: '#5aa0ff' },
  武: { label: '武', color: '#ff6a4a' },
};
export const TYPE = {
  法: { color: '#b98cf0' },
  書: { color: '#5ad0c0' },
  騎: { color: '#e0a83a' },
  槍: { color: '#8fd45a' },
  劍: { color: '#ff9a5a' },
  弓: { color: '#f0d060' },
};

// 每名武將的 [類別, 專長]
const TRAITS = {
  // SSR
  呂布: ['武', '騎'], 關羽: ['武', '劍'], 張飛: ['武', '槍'], 趙雲: ['武', '槍'],
  馬超: ['武', '騎'], 黃忠: ['武', '弓'], 諸葛亮: ['文', '法'], 曹操: ['文', '書'],
  司馬懿: ['文', '法'], 周瑜: ['文', '法'],
  // SR
  張遼: ['武', '騎'], 甘寧: ['武', '劍'], 姜維: ['武', '槍'], 魏延: ['武', '劍'],
  許褚: ['武', '劍'], 夏侯惇: ['武', '劍'], 龐德: ['武', '騎'], 陸遜: ['文', '法'],
  郭嘉: ['文', '法'], 賈詡: ['文', '法'], 董卓: ['武', '騎'], 孫策: ['武', '槍'],
  孫權: ['文', '書'], 劉備: ['文', '書'], 徐晃: ['武', '劍'],
  // R
  張郃: ['武', '槍'], 樂進: ['武', '劍'], 文醜: ['武', '槍'], 顏良: ['武', '槍'],
  夏侯淵: ['武', '弓'], 曹真: ['武', '騎'], 曹休: ['武', '騎'], 周泰: ['武', '劍'],
  魯肅: ['文', '書'], 呂蒙: ['武', '劍'], 程普: ['武', '槍'], 徐庶: ['文', '法'],
  法正: ['文', '法'], 孫堅: ['武', '劍'], 袁紹: ['文', '書'], 文鴦: ['武', '槍'],
  張昭: ['文', '書'], 張角: ['文', '法'], 李儒: ['文', '法'], 陳宮: ['文', '法'],
  袁術: ['文', '書'],
  // H
  劉禪: ['文', '書'], 周倉: ['武', '劍'], 審配: ['文', '書'], 闞澤: ['文', '書'],
  諸葛恪: ['文', '法'],
};

// 攤平成單一名冊：{ name, rarity, img, faction, type }
export const RECRUIT_POOL = Object.entries(TIERS).flatMap(([rarity, names]) =>
  names.map((name) => {
    const [faction, type] = TRAITS[name] || ['武', '劍'];
    return {
      name,
      rarity,
      faction,
      type,
      img: `textures/characters/${encodeURIComponent(name)}.jpg`,
    };
  })
);

const byRarity = (r) => RECRUIT_POOL.filter((c) => c.rarity === r);

// 頭像左下角兩個圈圈：文/武 + 專長
function traitBadges(c) {
  const fColor = (FACTION[c.faction] || {}).color || '#888';
  const tColor = (TYPE[c.type] || {}).color || '#888';
  return `<div class="recruit-traits">` +
    `<span class="trait-circle" style="--tc:${fColor}">${c.faction}</span>` +
    `<span class="trait-circle" style="--tc:${tColor}">${c.type}</span>` +
    `</div>`;
}

// 招募設定範圍
const COST_MIN = 1000;
const COST_MAX = 200000;
const TIME_MIN = 1;      // 小時（招募時長，越久稀有機率越高）
const TIME_MAX = 24;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const RARITY_ORDER = ['SSR', 'SR', 'R', 'H'];

// 機率格式：小數點後兩位、去掉多餘的 0（0.15 / 2.5 / 60）
function fmtPct(v) {
  return parseFloat(v.toFixed(2)).toString();
}

// 稀有度機率（現代抽卡設計：越強機率越低）。
// 基礎值（最低花費/時長）：SSR 5% / SR 15% / R 30% / H 50%
// 花費與時間越高，越往紅/金傾斜（H 下降）。權重總和恆為 100。
function rarityWeights(cost, hours) {
  const cf = clamp((cost - COST_MIN) / (COST_MAX - COST_MIN), 0, 1);
  const tf = clamp((hours - TIME_MIN) / (TIME_MAX - TIME_MIN), 0, 1);
  const boost = cf * 0.7 + tf * 0.3;      // 綜合加成係數 0~1
  return {
    SSR: 5 + boost * 3,                   // 5%  → 8%
    SR:  15 + boost * 10,                 // 15% → 25%
    R:   30 + boost * 2,                  // 30% → 32%
    H:   50 - boost * 15,                 // 50% → 35%
  };
}

// 正規化為總和 1 的機率
function rarityProbs(cost, hours) {
  const w = rarityWeights(cost, hours);
  const total = RARITY_ORDER.reduce((s, k) => s + w[k], 0);
  const p = {};
  for (const k of RARITY_ORDER) p[k] = w[k] / total;
  return p;
}

function pickRarity(cost, hours) {
  const p = rarityProbs(cost, hours);
  let roll = Math.random();
  for (const key of RARITY_ORDER) {
    roll -= p[key];
    if (roll <= 0) return key;
  }
  return 'H';
}

// 隨機抽一名武將（先決定稀有度，再從該稀有度中隨機挑一人）
function pickCharacter(cost, hours) {
  const rarity = pickRarity(cost, hours);
  const pool = byRarity(rarity);
  return pool[(Math.random() * pool.length) | 0];
}

// 一次抽兩名，且不會抽到同一支
function pickTwo(cost, timeSec) {
  const a = pickCharacter(cost, timeSec);
  let b = pickCharacter(cost, timeSec);
  let guard = 0;
  while (b.name === a.name && guard++ < 20) b = pickCharacter(cost, timeSec);
  return [a, b];
}

const CELL = 128;                 // 每格圖寬（含框）
const VIEW_CELLS = 3;             // 視窗可見格數
const STRIP_LEN = 32;             // 輪帶總格數
const TARGET_INDEX = 27;          // 中獎格落點（保留足夠滑行距離）
const SPIN_MIN = 3;               // 輪帶轉動最短秒數（與招募時長無關，僅演出）
const SPIN_MAX = 6;               // 越久的招募轉得越久，較有戲

export class Recruit {
  // state: { coins }；onResult(character) 可選：招募成功後回呼（主程式接手）
  constructor(state) {
    this.state = state;
    this.onResult = null;   // onResult(character)：招募成功後回呼
    this.onSpend = null;    // onSpend()：扣款後回呼（同步 HUD）
    this.isSummonActive = null;  // ()->bool：目前是否有援軍在場（決定是否顯示重新招募）
    this.spinning = false;

    this.el = {
      btn: document.getElementById('btn-recruit'),
      modal: document.getElementById('recruit-modal'),
      close: document.getElementById('recruit-close'),
      cost: document.getElementById('recruit-cost'),
      time: document.getElementById('recruit-time'),
      go: document.getElementById('recruit-go'),
      rego: document.getElementById('recruit-rego'),
      strips: [
        document.getElementById('recruit-strip-0'),
        document.getElementById('recruit-strip-1'),
      ],
      result: document.getElementById('recruit-result'),
      coins: document.getElementById('recruit-coins'),
      legend: document.getElementById('recruit-legend'),
      rateList: document.getElementById('recruit-rate-list'),
      fx: document.getElementById('recruit-fx'),
      fxCards: document.getElementById('rfx-cards'),
      fxBanner: document.getElementById('rfx-banner'),
      fxParticles: document.getElementById('rfx-particles'),
      root: document.getElementById('game-root'),
    };

    this.bind();
  }

  bind() {
    this.el.btn.addEventListener('click', () => this.open());
    this.el.close.addEventListener('click', () => this.close());
    this.el.modal.addEventListener('click', (e) => {
      if (e.target === this.el.modal) this.close();
    });
    this.el.go.addEventListener('click', () => this.spin());
    this.el.rego.addEventListener('click', () => this.spin());
    this.el.fx.addEventListener('click', () => this.hideFx());
    // 花費 / 時間 變動 → 即時更新顯示機率
    this.el.cost.addEventListener('input', () => this.renderRates());
    this.el.time.addEventListener('input', () => this.renderRates());
  }

  // 讀取目前輸入的花費/時間（夾在合法範圍內）
  currentParams() {
    const cost = clamp(Math.floor(Number(this.el.cost.value) || 0), COST_MIN, COST_MAX);
    const hours = clamp(Math.floor(Number(this.el.time.value) || TIME_MIN), TIME_MIN, TIME_MAX);
    return { cost, hours };
  }

  // 依目前花費/時間算出機率，渲染上方稀有度列與右側各武將機率
  renderRates() {
    const { cost, hours } = this.currentParams();
    const probs = rarityProbs(cost, hours);

    // 上方稀有度列（含總機率）
    this.el.legend.innerHTML = RARITY_ORDER.map((r) => {
      const info = RARITY[r];
      return `<span class="recruit-legend-item rarity-${r}">` +
        `<span class="legend-label"><i class="legend-dot"></i>${info.label} ${r}</span>` +
        `<b>${fmtPct(probs[r] * 100)}%</b></span>`;
    }).join('');

    // 右側：依稀有度分組，列出每名武將的個別機率（= 該稀有度總機率 / 人數）
    this.el.rateList.innerHTML = RARITY_ORDER.map((r) => {
      const pool = byRarity(r);
      const each = (probs[r] * 100) / pool.length;
      const info = RARITY[r];
      const rows = pool.map((c) =>
        `<div class="rate-row rarity-${r}">` +
          `<span class="rate-name">${c.name}</span>` +
          `<span class="rate-pct">${fmtPct(each)}%</span></div>`
      ).join('');
      return `<div class="rate-group rarity-${r}">` +
        `<div class="rate-group-head">${info.label} ${r}` +
          `<span class="rate-group-sum">共 ${fmtPct(probs[r] * 100)}%</span></div>` +
        rows +
      `</div>`;
    }).join('');
  }

  open() {
    this.el.btn.classList.add('active');
    this.refreshCoins();
    this.renderRates();
    this.updateRego();
    this.resetStrip();
    this.el.result.className = 'recruit-result';
    this.el.result.innerHTML = '';
    this.el.modal.classList.remove('hidden');
  }

  close() {
    if (this.spinning) return;      // 轉動中不可關閉
    this.el.btn.classList.remove('active');
    this.el.modal.classList.add('hidden');
  }

  refreshCoins() {
    this.el.coins.textContent = Math.floor(this.state.coins).toLocaleString('en-US');
  }

  // 有援軍在場 → 顯示「重新招募」；否則只顯示「開始招募」
  updateRego() {
    const active = !!(this.isSummonActive && this.isSummonActive());
    this.el.rego.classList.toggle('hidden', !active);
  }

  // 初始輪帶：兩排都填滿隨機頭像（尚未轉動）
  resetStrip() {
    for (const strip of this.el.strips) {
      strip.style.transition = 'none';
      strip.style.transform = 'translateX(0)';
      strip.innerHTML = '';
      for (let i = 0; i < VIEW_CELLS + 1; i++) {
        strip.appendChild(this.buildCell(RECRUIT_POOL[(Math.random() * RECRUIT_POOL.length) | 0]));
      }
    }
  }

  buildCell(c) {
    const cell = document.createElement('div');
    cell.className = `recruit-cell rarity-${c.rarity}`;
    cell.innerHTML =
      `<img src="${c.img}" alt="${c.name}" draggable="false" />` +
      traitBadges(c) +
      `<span class="recruit-cell-name">${c.name}</span>`;
    return cell;
  }

  spin() {
    if (this.spinning) return;
    const cost = clamp(Math.floor(Number(this.el.cost.value) || 0), COST_MIN, COST_MAX);
    const hours = clamp(Math.floor(Number(this.el.time.value) || TIME_MIN), TIME_MIN, TIME_MAX);
    this.el.cost.value = cost;
    this.el.time.value = hours;

    if (this.state.coins < cost) {
      this.el.result.className = 'recruit-result warn';
      this.el.result.textContent = '籌碼不足，無法招募！';
      return;
    }

    // 扣款
    this.state.coins -= cost;
    this.refreshCoins();
    if (this.onSpend) this.onSpend();      // 通知主程式同步底部 HUD 金錢

    this.spinning = true;
    this.el.go.disabled = true;
    this.el.rego.disabled = true;
    this.el.result.className = 'recruit-result';
    this.el.result.textContent = '招募中…';

    // 一次抽兩名（不重複），分別放到上下兩排輪帶
    const chosen = pickTwo(cost, hours);
    const tf = clamp((hours - TIME_MIN) / (TIME_MAX - TIME_MIN), 0, 1);
    const spinSec = SPIN_MIN + tf * (SPIN_MAX - SPIN_MIN);

    const viewWidth = VIEW_CELLS * CELL;
    const endX = viewWidth / 2 - (TARGET_INDEX * CELL + CELL / 2);

    let pending = this.el.strips.length;
    this.el.strips.forEach((strip, row) => {
      strip.style.transition = 'none';
      strip.style.transform = 'translateX(0)';
      strip.innerHTML = '';
      for (let i = 0; i < STRIP_LEN; i++) {
        const c = i === TARGET_INDEX ? chosen[row]
          : RECRUIT_POOL[(Math.random() * RECRUIT_POOL.length) | 0];
        strip.appendChild(this.buildCell(c));
      }
      // 下排稍慢一點停，兩排錯開更有節奏
      const dur = spinSec + row * 0.6;
      void strip.offsetWidth;
      strip.style.transition = `transform ${dur}s cubic-bezier(.12,.72,.15,1)`;
      strip.style.transform = `translateX(${endX}px)`;

      const done = () => {
        strip.removeEventListener('transitionend', done);
        if (--pending === 0) this.finish(chosen, hours);
      };
      strip.addEventListener('transitionend', done);
    });
  }

  finish(list, hours) {
    this.spinning = false;
    this.el.go.disabled = false;
    this.el.rego.disabled = false;
    this.el.result.className = 'recruit-result reveal';
    this.el.result.innerHTML = list
      .map((c) => {
        const r = RARITY[c.rarity];
        return `<span class="recruit-result-item rarity-${c.rarity}">` +
          `<span class="recruit-result-tier">${r.label}</span>` +
          `<span class="recruit-result-name">${c.name}</span></span>`;
      })
      .join('');
    if (this.onResult) this.onResult(list, hours);
    this.updateRego();       // 招募後已有援軍在場 → 顯示「重新招募」

    // 招到非白色武將 → 依最高稀有度播放登場特效（越強越誇張）
    this.celebrate(list);
  }

  // 依兩隻中最高的稀有度演出；全為普通(H)則不演
  celebrate(list) {
    const RANK = { H: 0, R: 1, SR: 2, SSR: 3 };
    const top = list.reduce((a, c) => (RANK[c.rarity] > RANK[a.rarity] ? c : a), list[0]);
    if (RANK[top.rarity] === 0) return;    // 都是普通，無特效

    const BANNER = { R: '良 將 入 伍', SR: '★ 大 將 降 臨 ★', SSR: '☆★ 名 將 降 臨 ★☆' };
    const PARTICLES = { R: 16, SR: 30, SSR: 48 };

    const fx = this.el.fx;
    fx.className = `tier-${top.rarity}`;    // 清掉 hidden/show，設定等級
    this.el.fxBanner.textContent = BANNER[top.rarity];

    // 中獎頭像卡
    this.el.fxCards.innerHTML = list
      .map((c) =>
        `<div class="rfx-card rarity-${c.rarity}">` +
          `<div class="rfx-card-img">` +
            `<img src="${c.img}" alt="${c.name}" draggable="false" />` +
            traitBadges(c) +
          `</div>` +
          `<div class="rfx-card-foot">` +
            `<span class="rfx-card-tier">${RARITY[c.rarity].label} ${c.rarity}</span>` +
            `<span class="rfx-card-name">${c.name}</span>` +
          `</div></div>`)
      .join('');

    this.spawnParticles(PARTICLES[top.rarity], top.rarity);

    void fx.offsetWidth;
    fx.classList.add('show');

    // 5 秒後自動關閉（連同兩名武將頭貼一起收起）
    clearTimeout(this._fxTimer);
    this._fxTimer = setTimeout(() => this.hideFx(), 5000);

    // 螢幕震動：金震一下、紅震得更兇
    const root = this.el.root;
    root.classList.remove('fx-shake', 'fx-shake-strong');
    void root.offsetWidth;
    if (top.rarity === 'SSR') root.classList.add('fx-shake-strong');
    else if (top.rarity === 'SR') root.classList.add('fx-shake');
  }

  // 由中心朝四面八方噴發的彩色粒子
  spawnParticles(n, rarity) {
    const box = this.el.fxParticles;
    box.innerHTML = '';
    const colors = rarity === 'SSR'
      ? ['#ff4d4d', '#ffd24a', '#fff3c8']
      : rarity === 'SR'
        ? ['#ffd24a', '#fff3c8', '#ffec9e']
        : ['#c07af0', '#e6c4ff', '#fff'];
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 180 + Math.random() * 320;
      const p = document.createElement('div');
      p.className = 'rfx-p';
      p.style.setProperty('--tx', `${Math.cos(ang) * dist}px`);
      p.style.setProperty('--ty', `${Math.sin(ang) * dist}px`);
      p.style.setProperty('--pc', colors[(Math.random() * colors.length) | 0]);
      p.style.setProperty('--dur', `${0.9 + Math.random() * 0.8}s`);
      p.style.setProperty('--delay', `${Math.random() * 0.25}s`);
      const s = 6 + Math.random() * 12;
      p.style.width = p.style.height = `${s}px`;
      box.appendChild(p);
    }
  }

  hideFx() {
    clearTimeout(this._fxTimer);
    this.el.fx.classList.remove('show');
    this.el.fx.classList.add('hidden');
    this.el.root.classList.remove('fx-shake', 'fx-shake-strong');
  }
}
