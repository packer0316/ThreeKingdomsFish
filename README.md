# 三國魚機・武將爭霸（3D 網頁 DEMO）

用 **Three.js** 製作的 3D 三國主題「魚機」博奕風格 DEMO。砲台為三國武將，敵人是拿刀 / 槍 / 弓的三國小兵與敵將，戰場背景為長城、軍營與魏蜀吳旗幟。單機版，全部 3D 模型以程式程序化生成，不需外部美術資源。

## 如何執行（Vite 開發模式，支援熱更新 HMR）

### 方法 1（最簡單）
直接雙擊 **`啟動遊戲.bat`**（第一次會自動 `npm install`，之後啟動 Vite 並開瀏覽器）。

### 方法 2（終端機）
在此資料夾開終端機：
```
npm install     # 只需第一次
npm run dev      # 啟動開發伺服器 http://localhost:5173
```

**熱更新**：`npm run dev` 執行後，修改 `src/*.js` 或 `style.css` 存檔，瀏覽器會**即時反映**，不用手動重新整理。

### 打包發佈（單機釋出用）
```
npm run build    # 產生 dist/ 靜態檔
npm run preview  # 預覽打包結果
```
`dist/` 內是可直接部署的靜態網站（Three.js 已打包進去，離線也能跑）。

> 需求：電腦已安裝 **Node.js**。Three.js 由 npm 安裝、Vite 打包，不再依賴 CDN。

## 玩法
- 🖱️ **點擊 / 按住畫面** → 武將朝目標開火，每發消耗一次下注籌碼。
- ➕➖ **調整下注**：下注越高，火力越猛、獎勵越大。
- 🗡️ **刀兵 / 槍兵 / 弓兵 / 盾兵**：血量與擊殺獎勵不同。
- 👑 **敵將（呂布 / 關羽 / 張飛）**：血厚、獎勵最高，是大獎目標。
- **自動** 按鈕：自動瞄準最近敵人連續開火。
- **武將** 按鈕：切換砲台武將（關羽 / 張飛 / 趙雲）。

## 檔案結構
```
index.html          入口頁 + HUD
style.css           介面樣式
package.json        npm 相依與指令 (dev / build / preview)
vite.config.js      Vite 設定 (port 5173、自動開瀏覽器)
啟動遊戲.bat         一鍵啟動 (npm run dev)
src/
  main.js           主程式：組裝、輸入、遊戲迴圈
  config.js         參數與資料表（下注、敵人、Boss）
  scene.js          場景：攝影機視角、天空、戰場、旗幟
  models.js         程序化 3D 模型（小兵、武將砲台、箭矢、金幣）
  enemies.js        敵人生成與行為
  bullets.js        砲彈 / 箭矢與命中判定
  ui.js             HUD、跑馬燈、大獎彈窗
```

## 想調整的地方
- 敵人種類 / 血量 / 獎勵倍率：改 `src/config.js` 的 `ENEMY_TYPES`、`BOSSES`。
- 下注階梯：`BET_LEVELS`。
- 攝影機角度：`src/scene.js` 的 `camera.position` 與 `lookAt`。
- 生成節奏 / Boss 間隔：`src/enemies.js` 的 `spawnInterval`、`bossTimer`。

> 本 DEMO 純為視覺與玩法展示，不涉及真實金錢。
