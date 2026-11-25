import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { packDir, zip, zipBuild, zipName } from '../src/pack';

interface Entry {
  name: string;
  method: number;
  time: number;
  date: number;
  data: Buffer;
}

// Reads a zip the way an unzip tool does: from the end record through the central directory to each local header.
function unzip(bytes: Uint8Array): Entry[] {
  const buf = Buffer.from(bytes);
  const end = buf.length - 22;
  expect(buf.readUInt32LE(end)).toBe(0x06054b50);
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  expect(at + buf.readUInt32LE(end + 12)).toBe(end);
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(at)).toBe(0x02014b50);
    const method = buf.readUInt16LE(at + 10);
    const time = buf.readUInt16LE(at + 12);
    const date = buf.readUInt16LE(at + 14);
    const crc = buf.readUInt32LE(at + 16);
    const packed = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLength = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLength);
    expect(buf.readUInt32LE(local)).toBe(0x04034b50);
    expect(buf.readUInt32LE(local + 14)).toBe(crc);
    expect(buf.toString('utf8', local + 30, local + 30 + nameLength)).toBe(name);
    const start = local + 30 + nameLength + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + packed);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    expect(data.length).toBe(size);
    expect(crc32(data) >>> 0).toBe(crc);
    entries.push({ name, method, time, date, data });
    at += 46 + nameLength + extra;
  }
  return entries;
}

const text = (value: string) => new TextEncoder().encode(value);

it('writes a zip an unzip tool reads back, file by file', () => {
  const entries = unzip(
    zip([
      { name: 'manifest.json', data: text('{"manifest_version":3}') },
      { name: 'assets/board.js', data: text('console.log(1);\n'.repeat(200)) },
    ]),
  );
  expect(entries.map((entry) => [entry.name, entry.data.toString('utf8').length])).toEqual([
    ['manifest.json', 22],
    ['assets/board.js', 3200],
  ]);
  expect(entries[1]?.data.toString('utf8')).toBe('console.log(1);\n'.repeat(200));
});

it('deflates what shrinks and stores what does not', () => {
  const noise = Uint8Array.from({ length: 64 }, (_, i) => (i * 167 + 13) % 256);
  const [repeated, random, empty] = unzip(
    zip([
      { name: 'a.txt', data: text('a'.repeat(1000)) },
      { name: 'b.png', data: noise },
      { name: 'c.txt', data: new Uint8Array(0) },
    ]),
  );
  expect(repeated?.method).toBe(8);
  expect(random?.method).toBe(0);
  expect(random?.data).toEqual(Buffer.from(noise));
  expect(empty?.method).toBe(0);
  expect(empty?.data.length).toBe(0);
});

it('gives the same bytes for the same files, with the date fixed at 1980-01-01', () => {
  const files = [{ name: 'x.txt', data: text('same') }];
  expect(Buffer.from(zip(files)).equals(Buffer.from(zip(files)))).toBe(true);
  expect(unzip(zip(files))[0]).toMatchObject({ time: 0, date: (0 << 9) | (1 << 5) | 1 });
});

it('names the zip after the version', () => {
  expect(zipName('0.1.0-beta.1')).toBe('h-board-0.1.0-beta.1.zip');
});

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'h-board-pack-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

it('packs a folder with its subfolders, in name order, with forward slashes', () => {
  mkdirSync(join(dir, 'dist/icons'), { recursive: true });
  writeFileSync(join(dir, 'dist/manifest.json'), '{}');
  writeFileSync(join(dir, 'dist/icons/16.png'), 'png');
  writeFileSync(join(dir, 'dist/background.js'), 'js');
  const out = join(dir, 'out/h-board.zip');
  expect(packDir(join(dir, 'dist'), out)).toEqual(['background.js', 'icons/16.png', 'manifest.json']);
  const entries = unzip(readFileSync(out));
  expect(entries.map((entry) => [entry.name, entry.data.toString('utf8')])).toEqual([
    ['background.js', 'js'],
    ['icons/16.png', 'png'],
    ['manifest.json', '{}'],
  ]);
});

it('zips the build output next to it once the build is written, and says where', () => {
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist/manifest.json'), '{}');
  const said: string[] = [];
  const plugin = zipBuild('0.1.0-beta.1');
  expect(plugin.apply).toBe('build');
  const configResolved = plugin.configResolved as (config: unknown) => void;
  const closeBundle = plugin.closeBundle as () => void;
  configResolved({ root: dir, build: { outDir: 'dist' }, logger: { info: (line: string) => said.push(line) } });
  closeBundle();
  expect(unzip(readFileSync(join(dir, 'h-board-0.1.0-beta.1.zip'))).map((entry) => entry.name)).toEqual(['manifest.json']);
  writeFileSync(join(dir, 'dist/background.js'), 'js');
  closeBundle();
  expect(said).toEqual([
    `zipped 1 file into ${join(dir, 'h-board-0.1.0-beta.1.zip')}`,
    `zipped 2 files into ${join(dir, 'h-board-0.1.0-beta.1.zip')}`,
  ]);
});
