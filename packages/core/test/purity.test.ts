import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: new URL('../../..', import.meta.url).pathname });

/** The rules the repository's lint config reports for `code` as if it were a file in core. */
async function rulesFor(code: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath: 'packages/core/src/probe.ts' });
  return (result?.messages ?? []).map((message) => message.ruleId);
}

describe('the lint rule that keeps core pure', () => {
  it('lets core import its own files and use the language', async () => {
    expect(await rulesFor("import { emptyLibrary } from './model';\nexport const x = [emptyLibrary(), JSON.stringify(1)];\n")).toEqual(
      [],
    );
  });

  it.each([
    "import { readFileSync } from 'node:fs';\nexport const x = readFileSync;\n",
    "import { readFileSync } from 'fs';\nexport const x = readFileSync;\n",
    "import { Store } from '@h-board/store';\nexport type X = Store;\n",
  ])('refuses an import that is not its own: %s', async (code) => {
    expect(await rulesFor(code)).toContain('no-restricted-imports');
  });

  it.each(['document', 'window', 'localStorage', 'chrome', 'process', 'Buffer', '__dirname', 'global', 'setImmediate'])(
    'refuses the global %s',
    async (name) => {
      expect(await rulesFor(`export const x = ${name};\n`)).toContain('no-restricted-globals');
    },
  );
}, 30_000);
