import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * The zip of the unpacked extension, written by the build next to `dist/`. It runs in Node at build time and is
 * never part of the extension. A plain zip writer, so the build needs no tool and no package beyond Node.
 */

export interface ZipFile {
  /** The path inside the zip, with forward slashes. */
  name: string;
  data: Uint8Array;
}

// 1980-01-01 00:00, the first day a zip can say: the same files give the same bytes on every build.
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;
const UTF8_NAMES = 1 << 11;

/** The zip of the files in the order given: deflated where that is smaller, stored otherwise. */
export function zip(files: readonly ZipFile[]): Uint8Array {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const deflated = deflateRawSync(file.data, { level: 9 });
    const deflate = deflated.length < file.data.length;
    const body = deflate ? deflated : Buffer.from(file.data);
    const crc = crc32(file.data) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    local.copy(entry, 8, 6, 30);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += local.length + name.length + body.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** The file name of the zip of one version. */
export function zipName(version: string): string {
  return `h-board-${version}.zip`;
}

/** Zips every file under `dir` into `out`, in name order, and returns the names it packed. */
export function packDir(dir: string, out: string): string[] {
  const names = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, zip(names.map((name) => ({ name, data: readFileSync(join(dir, name)) }))));
  return names;
}

/** The Vite plugin that zips the written build into `h-board-<version>.zip` in the package folder. */
export function zipBuild(version: string): Plugin & { version: string } {
  let config: ResolvedConfig;
  return {
    name: 'h-board-zip',
    version,
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const out = join(config.root, zipName(version));
      const count = packDir(resolve(config.root, config.build.outDir), out).length;
      config.logger.info(`zipped ${count} file${count === 1 ? '' : 's'} into ${out}`);
    },
  };
}
