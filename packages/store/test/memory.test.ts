import { MemoryStore } from '../src/index';
import { storeContract } from './contract';

storeContract('MemoryStore', (options) => new MemoryStore(options));
