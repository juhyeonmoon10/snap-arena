// 첫 맵 "토이 야드". 점대칭(180도 회전) 구조라 양 팀 동선 길이가 같다.
// x: 팀 진영 방향(-22 블루 ~ +22 오렌지), z: 북(-15, 민트 길) ~ 남(+15, 라일락 길)

export interface Box { min: [number, number, number]; max: [number, number, number]; color: number }

export const MAP = { halfX: 22, halfZ: 15, wallH: 7 };
export const ZONE = { mid: 0xffd84a, north: 0x57e0b8, south: 0xb79bff, blue: 0x8fc1ff, orange: 0xffbf8a };

const boxes: Box[] = [];
function add(x0: number, z0: number, x1: number, z1: number, h: number, color: number, y0 = 0, mirror = true) {
  boxes.push({ min: [x0, y0, z0], max: [x1, y0 + h, z1], color });
  if (mirror) boxes.push({ min: [-x1, y0, -z1], max: [-x0, y0 + h, -z0], color: mirrorColor(color) });
}
const C = { wall: 0xfff3d6, blue: 0x4f8dff, orange: 0xff8a3d, lemon: 0xffc61a, mint: 0x1fc79a, lilac: 0x8e6bf2, white: 0xffffff, red: 0xff5d73 };
function mirrorColor(c: number) {
  if (c === C.blue) return C.orange;
  if (c === C.mint) return C.lilac;
  if (c === C.lilac) return C.mint;
  return c;
}

// 외벽
add(-23, -16, 23, -15, MAP.wallH, C.wall, 0, false);
add(-23, 15, 23, 16, MAP.wallH, C.wall, 0, false);
add(-23, -15, -22, 15, MAP.wallH, C.wall, 0, false);
add(22, -15, 23, 15, MAP.wallH, C.wall, 0, false);

// 스폰 가림벽: 양 스폰이 서로 직접 보이지 않게 한다
add(-16, -5, -15, 5, 3.4, C.blue);
add(-16.6, -5, -16, -4, 1.2, C.blue); // 가림벽 끝의 낮은 블록
// 중앙로와 옆길을 나누는 긴 벽 (가운데와 스폰 쪽에 통로)
add(-11.5, -7.5, -3.2, -6.5, 3.2, C.mint);
add(-11.5, 6.5, -3.2, 7.5, 3.2, C.lilac);
// 중앙로 엄폐물
add(-7.6, -2.2, -6.6, 2.2, 2.6, C.lemon);
add(-3.6, 2.6, -2.2, 3.9, 1.15, C.white);
add(-10.5, 3.2, -9.3, 4.4, 1.15, C.white);
// 중앙 낮은 단상 + 기둥 (대칭 중심이라 미러 없음)
add(-2.2, -2.2, 2.2, 2.2, 0.5, C.lemon, 0, false);
add(-0.7, -0.7, 0.7, 0.7, 2.7, C.red, 0.5, false);
// 북쪽 길 고지대: 계단 2단 + 단상 + 난간
add(-4, -15, 4, -11.4, 1.0, C.mint);
add(-5.3, -15, -4, -11.4, 0.5, C.mint);
add(4, -15, 5.3, -11.4, 0.5, C.mint);
add(-1.6, -11.7, 1.6, -11.4, 0.9, C.white, 1.0);
// 옆길 엄폐 상자
add(-10.4, -12.4, -9.0, -11.0, 1.7, C.white);
add(-13.8, -9.6, -12.6, -8.4, 2.6, C.mint);
add(7.2, -10.2, 8.4, -9.0, 1.15, C.white);

export const BOXES: Box[] = boxes;

// 팀별 스폰 (x, z, yaw). yaw 0은 -z 방향, 블루는 +x를 본다.
export const SPAWNS: [number, number, number][][] = [
  [[-19.5, -1.6, -Math.PI / 2], [-19.5, 1.6, -Math.PI / 2]],
  [[19.5, 1.6, Math.PI / 2], [19.5, -1.6, Math.PI / 2]],
];
export const PRACTICE_DUMMIES: [number, number][] = [[-4.5, 0], [4, -9], [9, 3.8], [0, 9.5], [13, -3]];
