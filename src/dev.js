import { KILL_CHANCE, BOSS_KILL_FACTOR } from './config.js';

// 開發者工具（除錯 / 調校用）------------------------------------------
// DEV 為全域可調參數，遊戲邏輯（如 enemies.js 的 hit()）會即時讀取。
// 功能陸續增加；目前：Boss 每擊死亡機率、一擊斃殺。

export const DEV = {
  bossKillChance: KILL_CHANCE * BOSS_KILL_FACTOR,   // Boss 每次命中的擊殺機率（0~1）
  oneHitKill: false,                                // 一擊斃殺：命中即死（含小兵與 Boss）
};

// 右上角圓形「開」按鈕 → 展開開發者面板
export class DevPanel {
  constructor(root = document.body) {
    this.el = document.createElement('div');
    this.el.id = 'dev-tools';
    this.el.innerHTML = `
      <button class="dev-fab" title="開發者工具">開</button>
      <div class="dev-panel hidden">
        <div class="dev-panel-title">開發者工具</div>
        <label class="dev-row">
          <span>Boss 死亡機率</span>
          <span class="dev-boss-val">${(DEV.bossKillChance * 100).toFixed(1)}%</span>
        </label>
        <input class="dev-boss-slider" type="range" min="0" max="100" step="0.5"
               value="${(DEV.bossKillChance * 100).toFixed(1)}">
        <label class="dev-row dev-check">
          <input class="dev-onehit" type="checkbox">
          <span>一擊斃殺</span>
        </label>
      </div>`;
    root.appendChild(this.el);

    const fab = this.el.querySelector('.dev-fab');
    const panel = this.el.querySelector('.dev-panel');
    const slider = this.el.querySelector('.dev-boss-slider');
    const bossVal = this.el.querySelector('.dev-boss-val');
    const oneHit = this.el.querySelector('.dev-onehit');

    fab.addEventListener('click', () => panel.classList.toggle('hidden'));

    slider.addEventListener('input', () => {
      DEV.bossKillChance = Number(slider.value) / 100;
      bossVal.textContent = `${Number(slider.value).toFixed(1)}%`;
    });

    oneHit.checked = DEV.oneHitKill;
    oneHit.addEventListener('change', () => { DEV.oneHitKill = oneHit.checked; });

    this._injectStyle();
  }

  _injectStyle() {
    if (document.getElementById('dev-tools-style')) return;
    const s = document.createElement('style');
    s.id = 'dev-tools-style';
    s.textContent = `
      #dev-tools { position: fixed; top: 12px; right: 12px; z-index: 9999;
        font-family: system-ui, sans-serif; }
      #dev-tools .dev-fab {
        width: 44px; height: 44px; border-radius: 50%;
        background: radial-gradient(circle at 35% 30%, #ff8a4c, #c0392b);
        color: #fff; font-size: 18px; font-weight: 900; cursor: pointer;
        border: 2px solid rgba(255,255,255,0.55);
        box-shadow: 0 3px 10px rgba(0,0,0,0.5);
      }
      #dev-tools .dev-fab:hover { filter: brightness(1.1); }
      #dev-tools .dev-panel {
        position: absolute; top: 52px; right: 0; width: 230px;
        background: rgba(18,14,10,0.94); border: 1px solid rgba(255,205,122,0.5);
        border-radius: 10px; padding: 14px; color: #ffe9bd;
        box-shadow: 0 8px 30px rgba(0,0,0,0.6);
      }
      #dev-tools .dev-panel.hidden { display: none; }
      #dev-tools .dev-panel-title {
        font-size: 15px; font-weight: 800; color: #ffd77a;
        margin-bottom: 12px; letter-spacing: 2px; text-align: center;
      }
      #dev-tools .dev-row {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 13px; margin-bottom: 6px;
      }
      #dev-tools .dev-boss-val { color: #ffd77a; font-weight: 700; }
      #dev-tools .dev-boss-slider { width: 100%; margin-bottom: 14px; accent-color: #ff8a4c; }
      #dev-tools .dev-check { cursor: pointer; gap: 8px; justify-content: flex-start; }
      #dev-tools .dev-check input { width: 16px; height: 16px; accent-color: #ff8a4c; }
    `;
    document.head.appendChild(s);
  }
}
