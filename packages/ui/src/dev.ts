// The page of `npm run dev`: the board on a store in memory that starts with the sample library. Wiring only.
import { sampleLibrary } from '@h-board/core';
import { MemoryStore } from '@h-board/store';
import { mountBoard } from './mount';

const root = document.getElementById('board');
if (root) void mountBoard(root, new MemoryStore({ initial: sampleLibrary }));
