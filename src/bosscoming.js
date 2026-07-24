// 鎮守 Boss 登場「BossComing」電影感開場 -----------------------------
// 當守關大將出關時，先壓黑全屏、劈入一張角色大圖（zoom + 撞擊閃光 +
// 螢幕震動 + 上下電影黑邊），停留數秒後淡出，再交還戰鬥。

const BOSS_COMING_IMG = {
  huaxiong: 'textures/bossComing/huashongBossComing.png',
  caocao: 'textures/bossComing/tsaotsaoBossComing.png',
};

// 時序（毫秒）
const T_IMPACT = 480;    // 撞擊閃光 / 震動
const T_OUT = 2600;      // 開始淡出
const T_END = 3300;      // 完全結束

export class BossComing {
  constructor(root) {
    this.active = false;
    this.el = {
      wrap: document.getElementById('boss-coming'),
      img: document.getElementById('bc-img'),
      root: root || document.getElementById('game-root'),
    };
    this._timers = [];

    // 預先載入兩張大圖，避免登場當下才抓圖造成閃爍
    for (const src of Object.values(BOSS_COMING_IMG)) {
      const im = new Image();
      im.src = src;
    }
  }

  // 播放某 Boss 的登場演出；onDone 於完全結束後回呼
  play(bossId, onDone) {
    const src = BOSS_COMING_IMG[bossId];
    if (!src) { if (onDone) onDone(); return; }

    this.clearTimers();
    this.active = true;
    this.el.img.src = src;

    const w = this.el.wrap;
    w.classList.remove('hidden', 'show', 'out');
    void w.offsetWidth;                 // 重排，讓動畫從頭播放
    w.classList.add('show');

    // 撞擊瞬間：閃光（CSS）+ 螢幕震動
    this._timers.push(setTimeout(() => {
      const r = this.el.root;
      r.classList.remove('fx-shake-strong');
      void r.offsetWidth;
      r.classList.add('fx-shake-strong');
    }, T_IMPACT));

    // 淡出
    this._timers.push(setTimeout(() => w.classList.add('out'), T_OUT));

    // 結束、交還戰鬥
    this._timers.push(setTimeout(() => {
      w.classList.add('hidden');
      w.classList.remove('show', 'out');
      this.el.root.classList.remove('fx-shake-strong');
      this.active = false;
      if (onDone) onDone();
    }, T_END));
  }

  clearTimers() {
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
  }
}
