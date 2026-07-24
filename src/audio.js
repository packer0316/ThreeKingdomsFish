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
