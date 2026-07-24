// 背景音樂（BGM）------------------------------------------------
// 單一循環播放的背景音樂。瀏覽器禁止未經使用者互動的自動播放，
// 因此由「開始遊戲」按鈕（使用者手勢）觸發 startBgm() 才會出聲。

const BASE = import.meta.env.BASE_URL || '/';
const BGM_URL = BASE + 'mp3/bgm/bgm1.mp3';

const bgm = new Audio(encodeURI(BGM_URL));
bgm.loop = true;
bgm.volume = 0.45;
bgm.preload = 'auto';

let started = false;

// 開始播放 BGM（重複呼叫安全；分頁被瀏覽器擋下時忽略錯誤）
export function startBgm() {
  if (started) return;
  started = true;
  bgm.play().catch((err) => {
    // 首次可能仍被自動播放政策擋下：等下一次使用者互動再試一次
    console.warn('[bgm] 播放被延後：', err?.message || err);
    started = false;
    const retry = () => { startBgm(); window.removeEventListener('pointerdown', retry); };
    window.addEventListener('pointerdown', retry, { once: true });
  });
}

export function setBgmVolume(v) {
  bgm.volume = Math.max(0, Math.min(1, v));
}

export function toggleBgm() {
  if (bgm.paused) bgm.play().catch(() => {});
  else bgm.pause();
  return !bgm.paused;
}

// 音效（SFX）------------------------------------------------
// 黃忠弓箭命中小兵的音效。以小型物件池輪替，支援短時間內連續命中重疊播放。
const ARROW_HIT_URL = BASE + 'mp3/sound/arrowHit.mp3';
const ARROW_HIT_POOL_SIZE = 6;
const arrowHitPool = [];
let arrowHitNext = 0;
for (let i = 0; i < ARROW_HIT_POOL_SIZE; i++) {
  const a = new Audio(encodeURI(ARROW_HIT_URL));
  a.volume = 0.6;
  a.preload = 'auto';
  arrowHitPool.push(a);
}

export function playArrowHit() {
  const a = arrowHitPool[arrowHitNext];
  arrowHitNext = (arrowHitNext + 1) % ARROW_HIT_POOL_SIZE;
  a.currentTime = 0;
  a.play().catch(() => {});
}

// 曹操登場（BossComing）音效：整段開場只播放一次
const CAOCAO_COMING_URL = BASE + 'mp3/sound/tsaotsaoBossComing.mp3';
const caocaoComing = new Audio(encodeURI(CAOCAO_COMING_URL));
caocaoComing.volume = 0.8;
caocaoComing.preload = 'auto';

export function playCaocaoComing() {
  caocaoComing.currentTime = 0;
  caocaoComing.play().catch(() => {});
}

// 華雄登場（BossComing）音效：整段開場只播放一次
const HUAXIONG_COMING_URL = BASE + 'mp3/sound/huaShongBossComing.mp3';
const huaxiongComing = new Audio(encodeURI(HUAXIONG_COMING_URL));
huaxiongComing.volume = 0.8;
huaxiongComing.preload = 'auto';

export function playHuaxiongComing() {
  huaxiongComing.currentTime = 0;
  huaxiongComing.play().catch(() => {});
}
