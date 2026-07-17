import { BET_LEVELS, GENERALS, MARQUEE_NAMES, MARQUEE_TARGETS } from './config.js';

// HUD / UI 控制 ------------------------------------------------

export class UI {
  constructor(state) {
    this.state = state;
    this.betIndex = 2; // 預設 50
    this.generalIndex = 0;
    this.auto = false;

    this.el = {
      coin: document.getElementById('coin-value'),
      bet: document.getElementById('bet-value'),
      betUp: document.getElementById('bet-up'),
      betDown: document.getElementById('bet-down'),
      auto: document.getElementById('auto-btn'),
      weapon: document.getElementById('weapon-btn'),
      marquee: document.getElementById('marquee-text'),
      jackpot: document.getElementById('jackpot'),
      jackpotName: document.getElementById('jackpot-name'),
      jackpotAmount: document.getElementById('jackpot-amount'),
      root: document.getElementById('game-root'),
    };

    this.bind();
    this.refresh();
    this.startMarquee();
  }

  bind() {
    this.el.betUp.addEventListener('click', () => {
      this.betIndex = Math.min(BET_LEVELS.length - 1, this.betIndex + 1);
      this.refresh();
    });
    this.el.betDown.addEventListener('click', () => {
      this.betIndex = Math.max(0, this.betIndex - 1);
      this.refresh();
    });
    this.el.auto.addEventListener('click', () => {
      this.auto = !this.auto;
      this.el.auto.classList.toggle('on', this.auto);
      this.el.auto.innerHTML = '自動<br>' + (this.auto ? 'ON' : 'OFF');
    });
    this.el.weapon.addEventListener('click', () => {
      this.generalIndex = (this.generalIndex + 1) % GENERALS.length;
      this.el.weapon.innerHTML = '武將<br>' + GENERALS[this.generalIndex].name;
      if (this.onGeneralChange) this.onGeneralChange(GENERALS[this.generalIndex]);
    });
  }

  get bet() { return BET_LEVELS[this.betIndex]; }
  get general() { return GENERALS[this.generalIndex]; }

  refresh() {
    this.el.coin.textContent = fmt(this.state.coins);
    this.el.bet.textContent = fmt(this.bet);
  }

  // 螢幕座標浮動獎勵數字
  floatCoin(x, y, amount) {
    const d = document.createElement('div');
    d.className = 'float-coin';
    d.textContent = '+' + fmt(amount);
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    this.el.root.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }

  jackpot(name, amount, catcher = '玩家') {
    this.el.jackpotName.textContent = name;
    this.el.jackpotAmount.textContent = fmt(amount);
    this.el.jackpot.classList.remove('hidden');
    clearTimeout(this._jpTimer);
    this._jpTimer = setTimeout(() => this.el.jackpot.classList.add('hidden'), 2600);
    this.pushMarquee(`恭喜 ${catcher} 捕獲 ${name} 獲得 ${fmt(amount)} 籌碼！`);
  }

  startMarquee() {
    const build = () => {
      const parts = [];
      for (let i = 0; i < 3; i++) {
        const who = MARQUEE_NAMES[(Math.random() * MARQUEE_NAMES.length) | 0];
        const tgt = MARQUEE_TARGETS[(Math.random() * MARQUEE_TARGETS.length) | 0];
        const amt = fmt(((Math.random() * 200 + 20) | 0) * 1000);
        parts.push(`恭喜「${who}」捕獲 ${tgt} 獲得 ${amt} 籌碼！`);
      }
      this.el.marquee.textContent = '　★　' + parts.join('　★　') + '　★　';
    };
    build();
    // 每輪動畫結束後換一批訊息
    this.el.marquee.addEventListener('animationiteration', build);
  }

  pushMarquee(msg) {
    this.el.marquee.textContent = '　🔥　' + msg + '　🔥　' + this.el.marquee.textContent;
  }
}

function fmt(n) {
  return Math.floor(n).toLocaleString('en-US');
}
