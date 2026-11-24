// The board page of the extension: wiring only. The store in memory is a placeholder until the
// extension's own store exists.
import { MemoryStore } from '@h-board/store';
import { mountBoard } from '@h-board/ui';

const root = document.getElementById('board');
if (root) void mountBoard(root, new MemoryStore());
