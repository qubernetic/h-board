// The board page of the extension: wiring only. The store in memory, with the sample library, is a placeholder
// until the extension keeps the library in its own storage.
import { sampleLibrary } from '@h-board/core';
import { MemoryStore } from '@h-board/store';
import { mountBoard } from '@h-board/ui';

const root = document.getElementById('board');
if (root) void mountBoard(root, new MemoryStore({ initial: sampleLibrary }));
