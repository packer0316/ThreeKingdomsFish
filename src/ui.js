import { BET_LEVELS, GENERALS, MARQUEE_NAMES, MARQUEE_TARGETS, ROOMS, ROOMS_PER_PAGE, sceneById } from './config.js';

// HUD / UI 控制 ------------------------------------------------

export class UI {
  constructor(state) {
    this.state = state;
    this.betIndex = 2; // 預設 50
    this.generalIndex = 0;
    this.auto = false;
    this.humanSeat = 'mid';       // 玩家目前所在座位（bet 控制顯示於此欄）

    this.el = {
      auto: document.getElementById('auto-btn'),
      marquee: document.getElementById('marquee-text'),
      jackpot: document.getElementById('jackpot'),
      jackpotName: document.getElementById('jackpot-name'),
      jackpotAmount: document.getElementById('jackpot-amount'),
      root: document.getElementById('game-root'),
      slots: {
        left: document.querySelector('.player-slot[data-seat="left"]'),
        mid: document.querySelector('.player-slot[data-seat="mid"]'),
        right: document.querySelector('.player-slot[data-seat="right"]'),
      },
    };
    this.moneyEl = {};            // 各座位金錢數字元素（供即時更新）

    this.bindActions();
    this.startMarquee();
  }

  // 常駐按鈕（自動）綁定一次；bet 按鈕於 renderSlots 內綁定
  bindActions() {
    this.el.auto.addEventListener('click', () => {
      this.auto = !this.auto;
      this.el.auto.classList.toggle('on', this.auto);
      this.el.auto.innerHTML = '自動<br>' + (this.auto ? 'ON' : 'OFF');
    });
  }

  get bet() { return BET_LEVELS[this.betIndex]; }
  get general() { return GENERALS[this.generalIndex]; }

  // 依三座位佔用資料渲染底部三人列。
  // occ: { left, mid, right }，每項 = { isYou, name, bet, coins } 或 null
  renderSlots(occ) {
    this.moneyEl = {};
    for (const seat of ['left', 'mid', 'right']) {
      const el = this.el.slots[seat];
      const o = occ[seat];
      if (!o) { el.innerHTML = ''; el.classList.add('empty'); continue; }
      el.classList.remove('empty');
      el.classList.toggle('you', !!o.isYou);

      if (o.isYou) {
        this.humanSeat = seat;
        el.innerHTML =
          `<div class="slot-name"><span class="slot-lvl">VIP</span>你` +
            `<span class="slot-bet">bet ${fmt(o.bet)}</span></div>` +
          `<div class="slot-money-row">` +
            `<button class="round-btn" data-bet="down">−</button>` +
            `<div class="slot-money"><span class="dollar">$</span>` +
              `<span class="slot-money-value">${fmt(o.coins)}</span></div>` +
            `<button class="round-btn" data-bet="up">＋</button>` +
          `</div>`;
        el.querySelector('[data-bet="down"]').addEventListener('click', () => this.changeBet(-1));
        el.querySelector('[data-bet="up"]').addEventListener('click', () => this.changeBet(1));
      } else {
        el.innerHTML =
          `<div class="slot-name"><span class="slot-lvl">弓</span>${o.name}` +
            `<span class="slot-bet">bet ${fmt(o.bet)}</span></div>` +
          `<div class="slot-money-row">` +
            `<div class="slot-money"><span class="dollar">$</span>` +
              `<span class="slot-money-value">${fmt(o.coins)}</span></div>` +
          `</div>`;
      }
      this.moneyEl[seat] = el.querySelector('.slot-money-value');
    }
  }

  changeBet(dir) {
    this.betIndex = Math.max(0, Math.min(BET_LEVELS.length - 1, this.betIndex + dir));
    const el = this.el.slots[this.humanSeat];
    const betEl = el && el.querySelector('.slot-bet');
    if (betEl) betEl.textContent = 'bet ' + fmt(this.bet);
  }

  // 更新某座位的金錢數字（帶一次得分閃爍）
  updateMoney(seat, coins, flash = false) {
    const m = this.moneyEl[seat];
    if (!m) return;
    m.textContent = fmt(coins);
    if (flash) {
      const slot = this.el.slots[seat];
      slot.classList.remove('win-flash');
      void slot.offsetWidth;
      slot.classList.add('win-flash');
    }
  }

  // 更新玩家（你）的金錢顯示（金錢跨房持續，不重置）
  refresh() {
    this.updateMoney(this.humanSeat, this.state.coins);
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

const SEAT_LABEL = { left: '左座', mid: '中座', right: '右座' };

// 選房頁面：點左上徽章開啟，可分頁瀏覽 20 個房間、切換房間與座位。
// 選定後透過 onEnter(room, seatPos) 通知外部套用（DEMO 僅換顯示資料）。
export class RoomSelect {
  constructor() {
    this.rooms = ROOMS;
    this.perPage = ROOMS_PER_PAGE;
    this.pages = Math.max(1, Math.ceil(this.rooms.length / this.perPage));
    this.page = 0;
    this.currentRoomId = this.rooms[0].id;   // 目前所在房
    this.currentSeat = 'mid';                // 目前所在座位（玩家預設中座）
    this.onEnter = null;

    this.el = {
      modal: document.getElementById('room-modal'),
      badge: document.getElementById('room-badge'),
      list: document.getElementById('room-list'),
      close: document.getElementById('room-close'),
      prev: document.getElementById('room-prev'),
      next: document.getElementById('room-next'),
      pageLabel: document.getElementById('room-page-label'),
    };

    this.bind();
  }

  bind() {
    this.el.badge.addEventListener('click', () => this.open());
    this.el.close.addEventListener('click', () => this.close());
    // 點面板外的遮罩關閉
    this.el.modal.addEventListener('click', (e) => {
      if (e.target === this.el.modal) this.close();
    });
    this.el.prev.addEventListener('click', () => this.goPage(this.page - 1));
    this.el.next.addEventListener('click', () => this.goPage(this.page + 1));
  }

  open() {
    // 開啟時跳到目前房間所在的分頁
    const idx = this.rooms.findIndex((r) => r.id === this.currentRoomId);
    this.page = idx >= 0 ? Math.floor(idx / this.perPage) : 0;
    this.render();
    this.el.modal.classList.remove('hidden');
  }

  close() { this.el.modal.classList.add('hidden'); }

  goPage(p) {
    this.page = Math.max(0, Math.min(this.pages - 1, p));
    this.render();
  }

  render() {
    const start = this.page * this.perPage;
    const slice = this.rooms.slice(start, start + this.perPage);
    this.el.list.innerHTML = '';

    for (const room of slice) {
      const taken = room.seats.filter((s) => s.name).length;
      const row = document.createElement('div');
      row.className = 'room-row' + (room.id === this.currentRoomId ? ' current' : '');

      const dots = room.seats
        .map((s) => `<span class="dot${s.name ? ' on' : ''}"></span>`)
        .join('');

      const seats = room.seats
        .map((s) => {
          const isEmpty = !s.name;
          const isSelected = room.id === this.currentRoomId && s.pos === this.currentSeat;
          const cls = 'room-seat' + (isEmpty ? ' empty' : ' taken') + (isSelected ? ' selected' : '');
          const who = isEmpty ? '空位' : s.name;
          return `<div class="${cls}" data-room="${room.id}" data-seat="${s.pos}">` +
            `<div class="room-seat-pos">${SEAT_LABEL[s.pos]}</div>` +
            `<div class="room-seat-name">${who}</div></div>`;
        })
        .join('');

      // 該房目前輪替到的戰場場景
      const sceneName = sceneById(room.sceneId).name;
      // 依場景給徽章底色：赤壁→紅、虎牢關→綠
      const sceneMod =
        sceneName.includes('赤壁') ? ' scene-chibi' :
        sceneName.includes('虎牢') ? ' scene-hulao' : '';

      row.innerHTML =
        `<div class="room-row-name">${room.name}` +
          `<span class="room-scene${sceneMod}">⚔ ${sceneName}</span></div>` +
        `<div class="room-seats">${seats}</div>` +
        `<div class="room-occ">${dots}<span class="room-occ-count">${taken}/3</span></div>`;

      this.el.list.appendChild(row);
    }

    // 座位點擊 → 入座（僅空位可入座；已被占用的座位不可選）
    this.el.list.querySelectorAll('.room-seat').forEach((seatEl) => {
      seatEl.addEventListener('click', () => {
        if (seatEl.classList.contains('taken')) return;
        const roomId = Number(seatEl.dataset.room);
        const seatPos = seatEl.dataset.seat;
        this.enter(roomId, seatPos);
      });
    });

    this.el.pageLabel.textContent = `${this.page + 1}/${this.pages}`;
    this.el.prev.disabled = this.page === 0;
    this.el.next.disabled = this.page === this.pages - 1;
  }

  enter(roomId, seatPos) {
    const room = this.rooms.find((r) => r.id === roomId);
    if (!room) return;
    this.currentRoomId = roomId;
    this.currentSeat = seatPos;
    if (this.onEnter) this.onEnter(room, seatPos);
    this.close();
  }
}

// 鎮守 Boss 頭上顯示：名牌（稱號＋名字）與台詞泡泡 --------------------
// 由主迴圈每幀傳入 Boss 的螢幕座標；Boss 登場喊開場白、徘徊時定時喊
// 經典台詞、被斬殺時在最後位置留下死亡台詞。
export class BossPlate {
  // quotes: { entry, taunts[], death }（見 config.js SCENES.boss.quotes）
  constructor(root, bossDef) {
    this.bossDef = bossDef;
    this.boss = null;             // 目前追蹤中的 Boss（Enemy 物件）
    this.tauntT = 0;              // 下一句台詞倒數
    this.sayT = 0;                // 泡泡剩餘顯示秒數
    this.lastX = 0;
    this.lastY = 0;

    this.plate = document.createElement('div');
    this.plate.className = 'boss-plate';
    this.plate.innerHTML =
      `<span class="boss-plate-title">${bossDef.title || ''}</span>` +
      `<span class="boss-plate-name">${bossDef.name}</span>`;
    root.appendChild(this.plate);

    this.bubble = document.createElement('div');
    this.bubble.className = 'boss-bubble';
    root.appendChild(this.bubble);
  }

  // 換場景：改追蹤新的 Boss 定義，重置名牌與泡泡
  setBoss(bossDef) {
    this.bossDef = bossDef;
    this.boss = null;
    this.sayT = 0;
    this.bubble.classList.remove('show');
    this.plate.innerHTML =
      `<span class="boss-plate-title">${bossDef.title || ''}</span>` +
      `<span class="boss-plate-name">${bossDef.name}</span>`;
  }

  // 顯示一句台詞
  say(text, duration = 3.5) {
    this.bubble.textContent = text;
    this.sayT = duration;
    // 重啟彈出動畫
    this.bubble.classList.remove('show');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('show');
  }

  // Boss 被斬殺：名牌立即消失，死亡台詞停留在最後位置
  died() {
    this.boss = null;
    this.say(this.bossDef.quotes.death, 2.8);
  }

  // 每幀更新；boss 為 null 表示目前無 Boss，screen 為頭頂螢幕座標
  update(dt, boss, screen) {
    if (boss) {
      if (boss !== this.boss) {
        // 新 Boss 登場：喊開場白
        this.boss = boss;
        this.say(this.bossDef.quotes.entry, 4.2);
        this.tauntT = 7 + Math.random() * 4;
      } else {
        this.tauntT -= dt;
        if (this.tauntT <= 0) {
          const t = this.bossDef.quotes.taunts;
          this.say(t[(Math.random() * t.length) | 0], 3.5);
          this.tauntT = 7 + Math.random() * 5;
        }
      }
      this.lastX = screen.x;
      this.lastY = screen.y;
      this.plate.style.display = 'flex';
      this.plate.style.left = screen.x + 'px';
      this.plate.style.top = screen.y + 'px';
    } else {
      this.plate.style.display = 'none';
    }

    // 泡泡：跟著最後已知位置（Boss 死後死亡台詞停留原地淡出）
    this.sayT -= dt;
    if (this.sayT > 0) {
      this.bubble.style.left = this.lastX + 'px';
      this.bubble.style.top = this.lastY + 'px';
    } else {
      this.bubble.classList.remove('show');
    }
  }
}
