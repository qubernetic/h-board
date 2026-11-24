import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/index';

describe('openDatabase', () => {
  it('runs statements and reads a row with parameters', () => {
    const db = openDatabase(':memory:');
    db.exec('create table note (id integer primary key, body text not null)');
    db.exec("insert into note (body) values ('first'), ('second')");
    expect(db.get('select body from note where id = ?', 2)).toEqual({ body: 'second' });
    expect(db.get('select body from note where id = ?', 9)).toBeUndefined();
    db.close();
  });

  it('enforces foreign keys', () => {
    const db = openDatabase(':memory:');
    db.exec('create table parent (id integer primary key)');
    db.exec('create table child (parent integer not null references parent (id))');
    expect(() => db.exec('insert into child (parent) values (1)')).toThrow();
    db.close();
  });

  it('keeps the data in the file between openings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'h-board-db-'));
    try {
      const file = join(dir, 'test.sqlite');
      const first = openDatabase(file);
      first.exec('create table note (body text)');
      first.exec("insert into note values ('kept')");
      first.close();
      const second = openDatabase(file);
      expect(second.get('select body from note')).toEqual({ body: 'kept' });
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
