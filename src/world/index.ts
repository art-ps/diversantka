import { parseRoom, validateWorld, type Room } from './room';
import { parseItems, parseEnemies } from './spawns';

const files = import.meta.glob('./rooms/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function loadWorld(): Map<string, Room> {
  const rooms = new Map<string, Room>();
  for (const [path, text] of Object.entries(files)) {
    const room = parseRoom(text, path);
    parseItems(room.meta.items, path);
    parseEnemies(room.meta.enemies, path);
    if (rooms.has(room.id)) throw new Error(`${path}: повтор id ${room.id}`);
    rooms.set(room.id, room);
  }
  const errors = validateWorld(rooms);
  if (errors.length) throw new Error(errors.join('\n'));
  return rooms;
}
