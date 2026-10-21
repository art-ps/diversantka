import { expect, it } from 'vitest';
import { DT, GEN, MISSION } from '../src/config';
import { startMission, stepGame } from '../src/game';
import { IDLE } from '../src/input/intent';
import { decodeIntent, packRecord, ReplayVersionError, unpackReplay } from '../src/sim/record';

const bytes = (s: string) => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0));
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

it('версия 3: заголовок — версия, номер varint, у N ≥ 3 — версия генератора; туда и обратно', async () => {
  const rec = [1, 2, 3, 3, 3];
  expect([...bytes(await packRecord(rec, 1)).subarray(0, 2)]).toEqual([3, 1]);
  expect([...bytes(await packRecord(rec, 2)).subarray(0, 2)]).toEqual([3, 2]);
  expect([...bytes(await packRecord(rec, 3)).subarray(0, 3)]).toEqual([3, 3, GEN.version]);
  expect([...bytes(await packRecord(rec, 200)).subarray(0, 4)]).toEqual([3, 0xc8, 0x01, GEN.version]);
  for (const n of [1, 2, 3, 4, 200]) expect(await unpackReplay(await packRecord(rec, n))).toEqual({ rec, mission: n });
});

it('другая версия генератора — ReplayVersionError; номер 0 и оборванный varint — ошибка', async () => {
  const p = bytes(await packRecord([1, 2, 3], 5));
  p[2] = (GEN.version + 1) & 0xff;
  await expect(unpackReplay(b64(p))).rejects.toBeInstanceOf(ReplayVersionError);
  await expect(unpackReplay(b64(Uint8Array.from([3, 0, 1, 2])))).rejects.toThrow();
  await expect(unpackReplay(b64(Uint8Array.from([3, 0x80])))).rejects.toThrow();
  await expect(unpackReplay(b64(Uint8Array.from([4, 1])))).rejects.toThrow('unknown version');
  // враждебная ссылка: номер миссии выше миллиона не принимаем (иначе игра полезла бы генерировать уровень 2^28)
  await expect(unpackReplay(b64(Uint8Array.from([3, 0xc1, 0x84, 0x3d, GEN.version, 0])))).rejects.toThrow('unknown mission'); // 1_000_001
});

it('реплей уровня 3 воспроизводит игру шаг в шаг', async () => {
  const g = startMission(3);
  const moves = [0, 1, 1, 1, -1, 0, 1];
  for (let i = 0; i < Math.round(MISSION.arriveTime / DT) + 120; i++) stepGame(g, { ...IDLE, moveX: moves[i % moves.length] }, DT);
  const { rec, mission } = await unpackReplay(await packRecord(g.rec, g.missionId));
  expect(mission).toBe(3);
  const r = startMission(mission);
  for (const code of rec) stepGame(r, decodeIntent(code), DT);
  expect(r.roomId).toBe(g.roomId);
  expect(r.nina.body).toEqual(g.nina.body);
  expect(r.mission.timeLeft).toBe(g.mission.timeLeft);
});
