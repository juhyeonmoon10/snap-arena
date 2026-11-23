// SNAP ARENA 조정용 설정 파일.
// 경기 규칙, 이동, 장비 수치는 전부 여기서 바꾼다. 서버와 클라이언트가 같은 값을 쓴다.

export const TICK = 1 / 60;

export const RULES = {
  roundsToWin: 5,
  roundTime: 45, // 초
  freezeTime: 4, // 라운드 시작 전 준비 시간
  roundEndTime: 3.5,
  reconnectGraceMs: 30000,
  maxHp: 100,
  practiceRespawn: 1.5,
};

export const MOVE = {
  walk: 6.4,
  sprint: 8.8,
  jump: 8.4,
  gravity: 25,
  groundAccel: 14,
  airAccel: 3,
  adsMul: 0.6,
  radius: 0.35,
  height: 1.8,
  eye: 1.6,
  step: 0.55, // 자동으로 올라설 수 있는 턱 높이
  headSize: 0.5,
};

export type Recoil = { pattern: [number, number][]; rand: number; recover: number; kick: number };

export interface GunCfg {
  kind: 'gun';
  slot: 0 | 1;
  name: string;
  range: string; // 추천 거리
  desc: string;
  auto: boolean;
  dmg: number;
  head: number; // 머리 배율
  pellets: number;
  interval: number; // 연사 간격(초)
  mag: number;
  reload: number;
  draw: number;
  falloff: [number, number, number]; // 시작 거리, 끝 거리, 최소 배율
  spreadHip: number; // 도
  spreadAds: number;
  adsTime: number;
  adsFov: number;
  move: number; // 이동 속도 배율
  recoil: Recoil; // pattern: 발당 [위, 옆] 도
}
export interface MeleeCfg {
  kind: 'melee';
  slot: 2;
  name: string;
  range: string;
  desc: string;
  dmg: number;
  reach: number;
  interval: number;
  hitTime: number; // 휘두른 뒤 타격 판정 시점(초)
  draw: number;
  move: number;
}
export type WeaponCfg = GunCfg | MeleeCfg;

const KNIFE = { kind: 'melee' as const, slot: 2 as const, dmg: 50, reach: 2.4, interval: 0.5, hitTime: 0.14, move: 1.1, range: '근접' };

export const WEAPONS: Record<string, WeaponCfg> = {
  ar: {
    kind: 'gun', slot: 0, name: '돌격소총 PIP-30', range: '중거리', desc: '어디서나 무난한 범용 연사',
    auto: true, dmg: 24, head: 1.5, pellets: 1, interval: 0.11, mag: 30, reload: 1.9, draw: 0.45,
    falloff: [22, 45, 0.7], spreadHip: 1.6, spreadAds: 0.25, adsTime: 0.18, adsFov: 52, move: 0.96,
    recoil: { pattern: [[0.9, 0], [0.8, 0.15], [0.8, -0.2], [0.7, 0.3], [0.7, 0.3], [0.6, -0.4], [0.6, -0.4], [0.6, 0.2]], rand: 0.12, recover: 7, kick: 0.05 },
  },
  smg: {
    kind: 'gun', slot: 0, name: '기관단총 ZIP-9', range: '근거리', desc: '빠른 발과 빠른 연사, 멀면 약함',
    auto: true, dmg: 17, head: 1.4, pellets: 1, interval: 0.07, mag: 32, reload: 1.6, draw: 0.35,
    falloff: [10, 26, 0.55], spreadHip: 2.2, spreadAds: 0.9, adsTime: 0.13, adsFov: 58, move: 1.06,
    recoil: { pattern: [[0.5, 0.2], [0.5, -0.25], [0.45, 0.3], [0.45, -0.3], [0.4, 0.15]], rand: 0.22, recover: 9, kick: 0.035 },
  },
  shotgun: {
    kind: 'gun', slot: 0, name: '산탄총 POPPER', range: '초근거리', desc: '붙어서 한 방, 멀면 흩어짐',
    auto: false, dmg: 13, head: 1.2, pellets: 8, interval: 0.85, mag: 5, reload: 2.4, draw: 0.5,
    falloff: [6, 16, 0.25], spreadHip: 4.5, spreadAds: 3.4, adsTime: 0.2, adsFov: 60, move: 0.98,
    recoil: { pattern: [[4.2, 0.5]], rand: 0.5, recover: 5, kick: 0.14 },
  },
  sniper: {
    kind: 'gun', slot: 0, name: '저격소총 LONGSHOT', range: '장거리', desc: '조준해서 신중한 한 발',
    auto: false, dmg: 90, head: 1.6, pellets: 1, interval: 1.25, mag: 4, reload: 2.6, draw: 0.6,
    falloff: [999, 1000, 1], spreadHip: 5, spreadAds: 0, adsTime: 0.3, adsFov: 20, move: 0.88,
    recoil: { pattern: [[3.2, 0.3]], rand: 0.3, recover: 4, kick: 0.16 },
  },
  pistol: {
    kind: 'gun', slot: 1, name: '권총 TAP', range: '근~중거리', desc: '빨리 꺼내 빨리 쏘는 보조',
    auto: false, dmg: 22, head: 1.5, pellets: 1, interval: 0.15, mag: 12, reload: 1.3, draw: 0.25,
    falloff: [14, 30, 0.6], spreadHip: 1.2, spreadAds: 0.4, adsTime: 0.12, adsFov: 60, move: 1.02,
    recoil: { pattern: [[1.1, 0.1], [1.1, -0.15]], rand: 0.2, recover: 8, kick: 0.06 },
  },
  revolver: {
    kind: 'gun', slot: 1, name: '리볼버 BIG SIX', range: '중거리', desc: '느리지만 묵직한 단발',
    auto: false, dmg: 55, head: 2.0, pellets: 1, interval: 0.55, mag: 6, reload: 2.2, draw: 0.4,
    falloff: [18, 36, 0.65], spreadHip: 1.8, spreadAds: 0.2, adsTime: 0.16, adsFov: 56, move: 1.0,
    recoil: { pattern: [[3.4, 0.4]], rand: 0.4, recover: 5, kick: 0.12 },
  },
  knife: { ...KNIFE, name: '기본 나이프', desc: '짧게 틀어 보이는 정직한 칼', draw: 0.3 },
  karambit: { ...KNIFE, name: '카람빗', desc: '고리로 돌리는 역그립 칼', draw: 0.45 },
  balisong: { ...KNIFE, name: '발리송', desc: '두 손잡이를 펼치는 나비칼', draw: 0.55 },
};

export const SLOT_OPTIONS: string[][] = [
  ['ar', 'smg', 'shotgun', 'sniper'],
  ['pistol', 'revolver'],
  ['knife', 'karambit', 'balisong'],
];
export const SLOT_NAMES = ['주무기', '보조무기', '근접무기'];
export type Loadout = [string, string, string];
export const DEFAULT_LOADOUT: Loadout = ['ar', 'pistol', 'knife'];

export function validLoadout(l: unknown): l is Loadout {
  return Array.isArray(l) && l.length === 3 && l.every((id, i) => SLOT_OPTIONS[i].includes(id));
}

export const TEAM_NAMES = ['블루', '오렌지'];
export const TEAM_COLORS = [0x2f7bff, 0xff7a1a];
