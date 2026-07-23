// 遊戲設定與資料表 ------------------------------------------------

export const START_COINS = 100000;

// 每次命中「擊殺」的機率（魚機式捕獲率）。約 5%，敵將更難擊殺。
export const KILL_CHANCE = 0.05;
export const BOSS_KILL_FACTOR = 0.35; // 敵將擊殺機率 = KILL_CHANCE × 此值

// 下注階梯
export const BET_LEVELS = [10, 20, 50, 100, 200, 500, 1000];

// 玩家可切換的武將砲台
export const GENERALS = [
  { name: '關羽', color: 0x2fae4a, robe: 0x1f7a33, blade: 0x7fe0a0 }, // 蜀・綠
  { name: '張飛', color: 0x3a4a6a, robe: 0x22304d, blade: 0x9ab0e0 },
  { name: '趙雲', color: 0xd8d8e0, robe: 0xb0b6c8, blade: 0xffffff },
];

// 左右兩側的 AI 弓箭手座位（會自動瞄準敵人拉弓放箭，各自累積籌碼）
// generalIndex 對應 GENERALS，x 為弓箭手的世界座標橫向位置
// drawTime = 拉滿弓所需秒數，recoverTime = 放箭後回復 / 搭新箭秒數
export const AI_PLAYERS = [
  { seat: 'left',  name: '常山趙子龍', generalIndex: 1, x: -14, coins: 5_284_900, betIndex: 4, drawTime: 0.55, recoverTime: 0.4 },
  { seat: 'right', name: '江東小霸王', generalIndex: 2, x: 14,  coins: 9_130_500, betIndex: 5, drawTime: 0.45, recoverTime: 0.3 },
];

// 選房用假資料：20 個房間，每房三個座位（左/中/右），各房分配不同的人。
// 每房固定留一個空位（name: null）供玩家入座，對應選房頁面的佔用感。
// seat.pos: 'left' | 'mid' | 'right'，generalIndex 對應 GENERALS。
const ROOM_NAME_POOL = [
  '常山趙子龍', '燕人張翼德', '臥龍先生', '江東小霸王',
  '虎痴許褚', '錦帆賊甘寧', '美髯公', '飛將軍',
  '錦馬超', '小李廣', '奉先無雙', '鳳雛龐統',
  '虎威將軍', '西涼錦兒', '江東周郎', '常勝將軍',
];

function buildRooms() {
  const rooms = [];
  for (let i = 0; i < 20; i++) {
    const num = 41 + i;                 // 休閒41房 ~ 休閒60房
    const emptyPos = (i + 1) % 3;       // 每房輪流留一個空位；房41(i=0)為中座，玩家預設坐中央
    const positions = ['left', 'mid', 'right'];
    const seats = positions.map((pos, s) => {
      const isEmpty = s === emptyPos;
      const nameIdx = (i * 3 + s) % ROOM_NAME_POOL.length;
      return {
        pos,
        name: isEmpty ? null : ROOM_NAME_POOL[nameIdx],
        generalIndex: (i + s) % GENERALS.length,
        coins: isEmpty ? 0 : (500_000 + ((i * 7 + s * 3) % 90) * 123_400),
        betIndex: (i + s) % BET_LEVELS.length,
      };
    });
    rooms.push({ id: num, name: `休閒${num}房`, seats });
  }
  return rooms;
}

export const ROOMS = buildRooms();
export const ROOMS_PER_PAGE = 10;

// 三個座位在戰場上的橫向世界座標（左 / 中 / 右）
export const SEAT_X = { left: -14, mid: 0, right: 14 };

// 敵人類型（小兵）
// hp 血量、value 擊殺獎勵倍率（相對下注）、weapon 武器、faction 陣營配色
export const ENEMY_TYPES = [
  {
    id: 'sword', label: '刀兵', weapon: 'sword',
    hp: 3, value: 2, speed: 1.6, scale: 1.0,
    faction: 0xb23a2a, // 紅（蜀）
  },
  {
    id: 'spear', label: '槍兵', weapon: 'spear',
    hp: 5, value: 4, speed: 1.3, scale: 1.05,
    faction: 0x2a5bb2, // 藍（魏）
  },
  {
    id: 'archer', label: '弓兵', weapon: 'bow',
    hp: 4, value: 6, speed: 1.9, scale: 0.95,
    faction: 0x2a9a5b, // 綠（吳）
  },
  {
    id: 'shield', label: '盾兵', weapon: 'sword',
    hp: 8, value: 8, speed: 1.0, scale: 1.15,
    faction: 0x8a6a2a, // 金
  },
];

// 場景（關卡）設定 ------------------------------------------------
// 每個場景一位「鎮守 Boss」：同時間場上只會有一位，在關前徘徊搦戰、
// 定時喊出經典台詞；被斬殺後隔一段時間再度出關。
// 未來新增場景時在 SCENES 加一筆，並切換 CURRENT_SCENE 即可。
export const SCENES = [
  {
    id: 'hulao',
    name: '虎牢關',
    story: '十八路諸侯會盟討董，兵臨虎牢關。守關大將華雄連斬聯軍數員上將，正在關前耀武搦戰！',
    boss: {
      id: 'huaxiong',
      name: '華雄',
      title: '董卓帳前都督',
      hp: 60, value: 100, speed: 1.1, scale: 1.85, faction: 0x8a2430,
      firstSpawn: 8,                  // 開局後幾秒首次出關
      respawnMin: 16, respawnMax: 28, // 被斬殺後重新出關的秒數區間
      quotes: {
        entry: '吾乃董卓帳前都督華雄是也！關東鼠輩，誰敢與吾決一死戰？',
        taunts: [
          '插標賣首之徒，也敢犯吾虎牢關！',
          '祖茂、俞涉、潘鳳，皆斬於吾刀下！',
          '十八路諸侯，竟無一人敢出戰乎？哈哈哈！',
          '斬汝等首級，如探囊取物耳！',
          '再遣無名下將，也是白白送死！',
        ],
        death: '不好……此人刀快……酒、酒尚溫乎……',
      },
    },
  },
];
export const CURRENT_SCENE = SCENES[0];

// 戰場範圍（世界座標）
export const FIELD = {
  minX: -22, maxX: 22,
  minZ: -20, maxZ: -1,   // 敵人活動的縱深區域（越遠 z 越小）
  turretZ: 6,            // 玩家砲台位置
};

// 假造的跑馬燈中獎訊息
export const MARQUEE_NAMES = [
  '常山趙子龍', '燕人張翼德', '臥龍先生', '江東小霸王',
  '虎痴許褚', '錦帆賊甘寧', '美髯公', '飛將軍',
];
export const MARQUEE_TARGETS = ['呂布', '關羽', '張飛', '顏良', '文醜', '華雄'];
