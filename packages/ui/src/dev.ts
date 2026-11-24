// The page of `npm run dev`: the board on a store in memory. Wiring only.
import { MemoryStore } from '@h-board/store';
import { mountBoard } from './mount';

const root = document.getElementById('board');
if (root) void mountBoard(root, new MemoryStore());
