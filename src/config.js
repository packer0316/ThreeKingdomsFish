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

// 敵將（大獎 Boss）
export const BOSSES = [
  { id: 'lubu',   name: '呂布', hp: 60, value: 120, speed: 0.9, scale: 1.9, faction: 0x9a2ac0 },
  { id: 'guanyu', name: '關羽', hp: 45, value: 80,  speed: 1.0, scale: 1.8, faction: 0x1f8a33 },
  { id: 'zhangfei',name:'張飛', hp: 40, value: 60,  speed: 1.1, scale: 1.75, faction: 0x30507a },
];

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
