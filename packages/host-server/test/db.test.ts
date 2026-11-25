import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrate, openDatabase } from '../src/index';

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

describe('run and all', () => {
  it('changes rows and reads every row', () => {
    const db = openDatabase(':memory:');
    db.exec('create table note (id integer primary key, body text not null)');
    expect(db.run('insert into note (body) values (?)', 'first')).toEqual({ changes: 1, lastId: 1 });
    db.run('insert into note (body) values (?)', 'second');
    expect(db.all('select body from note order by id')).toEqual([{ body: 'first' }, { body: 'second' }]);
    expect(db.run('delete from note where id > ?', 0).changes).toBe(2);
    db.close();
  });

  it('rolls a transaction back when it throws', () => {
    const db = openDatabase(':memory:');
    db.exec('create table note (body text not null)');
    expect(() =>
      db.transaction(() => {
        db.run('insert into note values (?)', 'gone');
        throw new Error('stop');
      }),
    ).toThrow('stop');
    expect(db.all('select body from note')).toEqual([]);
    expect(db.transaction(() => db.run('insert into note values (?)', 'kept').changes)).toBe(1);
    db.close();
  });
});

describe('migrate', () => {
  it('runs every step once and records the version', () => {
    const db = openDatabase(':memory:');
    const steps = ['create table a (x integer)', 'create table b (y integer)'];
    expect(migrate(db, steps)).toBe(2);
    expect(db.get('pragma user_version')).toEqual({ user_version: 2 });
    expect(migrate(db, [...steps, 'create table c (z integer)'])).toBe(3);
    expect(migrate(db, [...steps, 'create table c (z integer)'])).toBe(3);
    expect(db.all("select name from sqlite_master where type = 'table' order by name")).toEqual([
      { name: 'a' },
      { name: 'b' },
      { name: 'c' },
    ]);
    db.close();
  });

  it('leaves the version where it was when a step fails', () => {
    const db = openDatabase(':memory:');
    expect(() => migrate(db, ['create table a (x integer)', 'not sql'])).toThrow();
    expect(db.get('pragma user_version')).toEqual({ user_version: 1 });
    expect(db.all("select name from sqlite_master where type = 'table'")).toEqual([{ name: 'a' }]);
    db.close();
  });

  it('refuses a database newer than the server', () => {
    const db = openDatabase(':memory:');
    migrate(db, ['create table a (x integer)', 'create table b (y integer)']);
    expect(() => migrate(db, ['create table a (x integer)'])).toThrow(
      'the database has schema version 2, this server knows 1',
    );
    db.close();
  });

  it('makes the users and sessions tables of the server', () => {
    const db = openDatabase(':memory:');
    expect(migrate(db)).toBe(MIGRATIONS.length);
    const tables = db.all("select name from sqlite_master where type = 'table' order by name");
    expect(tables.map((row) => row['name'])).toEqual(expect.arrayContaining(['sessions', 'setup', 'users']));
    db.close();
  });
});
