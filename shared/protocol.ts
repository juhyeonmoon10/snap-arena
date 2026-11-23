import { Loadout } from './config';
import { PState } from './sim';

export type Mode = '1v1' | '2v2' | 'practice';
export type Phase = 'lobby' | 'freeze' | 'live' | 'roundEnd' | 'matchEnd';

export interface PlayerInfo {
  id: number; name: string; team: number; ready: boolean; connected: boolean; bot: boolean;
  loadout: Loadout; next: Loadout; kills: number; deaths: number; dmg: number; rematch: boolean;
}
export interface RoomInfo {
  code: string; mode: Mode; phase: Phase; hostId: number; you: number;
  players: PlayerInfo[]; score: [number, number]; round: number;
  result: null | { winner: number; forfeit: boolean };
  lastRound: null | { winner: number; reason: string };
}
// [id, x, y, z, yaw, pitch, hp, alive, slot, moving]
export type SnapPlayer = [number, number, number, number, number, number, number, number, number];
export interface Snap {
  t: number; ph: Phase; tl: number; pl: SnapPlayer[];
  me?: { ack: number; st: PState; hp: number; alive: boolean };
}
export type GameEvent =
  | { k: 'shot'; id: number; wid: string; o: number[]; ends: number[][] }
  | { k: 'hit'; att: number; vic: number; dmg: number; head: boolean; pos: number[]; from: number[]; kill: boolean; melee: boolean }
  | { k: 'act'; id: number; a: 'switch' | 'swing' | 'reload' | 'inspect' }
  | { k: 'respawn'; id: number };
