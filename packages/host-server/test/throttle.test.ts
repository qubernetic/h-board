import { describe, expect, it } from 'vitest';
import { Throttle } from '../src/throttle';

describe('Throttle', () => {
  it('lets the first failures through and then doubles the wait', () => {
    const throttle = new Throttle({ free: 2, base: 1000, max: 8000 });
    expect(throttle.wait(['name:ann'], 0)).toBe(0);
    throttle.fail(['name:ann'], 0);
    throttle.fail(['name:ann'], 0);
    expect(throttle.wait(['name:ann'], 0)).toBe(1000);
    expect(throttle.wait(['name:ann'], 400)).toBe(600);
    expect(throttle.wait(['name:ann'], 1000)).toBe(0);
    throttle.fail(['name:ann'], 1000);
    expect(throttle.wait(['name:ann'], 1000)).toBe(2000);
    throttle.fail(['name:ann'], 3000);
    expect(throttle.wait(['name:ann'], 3000)).toBe(4000);
    throttle.fail(['name:ann'], 7000);
    throttle.fail(['name:ann'], 15000);
    expect(throttle.wait(['name:ann'], 15000)).toBe(8000);
  });

  it('answers the longest wait of the keys and counts a failure on each', () => {
    const throttle = new Throttle({ free: 1, base: 1000, max: 60000 });
    throttle.fail(['name:ann', 'address:1'], 0);
    throttle.fail(['name:bob', 'address:1'], 0);
    expect(throttle.wait(['name:ann'], 0)).toBe(1000);
    expect(throttle.wait(['name:cid', 'address:1'], 0)).toBe(2000);
    expect(throttle.wait(['name:cid', 'address:2'], 0)).toBe(0);
  });

  it('forgets a key on success', () => {
    const throttle = new Throttle({ free: 0, base: 1000, max: 60000 });
    throttle.fail(['name:ann'], 0);
    throttle.clear('name:ann');
    expect(throttle.wait(['name:ann'], 0)).toBe(0);
  });

  it('forgets failures after a quiet hour and keeps its size bounded', () => {
    const throttle = new Throttle({ free: 0, base: 1000, max: 60000, limit: 2 });
    throttle.fail(['a'], 0);
    throttle.fail(['b'], 1_800_000);
    expect(throttle.wait(['a'], 3_600_000)).toBe(0);
    throttle.fail(['c'], 3_600_000);
    expect(throttle.size).toBe(2);
    expect(throttle.wait(['b'], 3_600_000)).toBe(0);
  });

  it('when full, drops keys below the free count and never one that imposes a wait', () => {
    const throttle = new Throttle({ free: 3, base: 1000, max: 60000, limit: 3 });
    for (let n = 0; n < 3; n += 1) throttle.fail(['name:ann'], 0);
    for (let n = 0; n < 10; n += 1) throttle.fail([`name:new${n}`], 0);
    expect(throttle.size).toBeLessThanOrEqual(3);
    expect(throttle.wait(['name:ann'], 0)).toBe(1000);
  });

  it('refuses a new key, the longest wait, when every key it holds imposes a wait', () => {
    const throttle = new Throttle({ free: 1, base: 1000, max: 60000, limit: 3 });
    throttle.fail(['a', 'b', 'c'], 0);
    expect(throttle.begin(['new'], 0)).toBe(60000);
    expect(throttle.begin(['new'], 1)).toBe(60000);
    expect(throttle.size).toBe(3);
  });

  it('refuses an attempt whole when one of its keys finds no room', () => {
    const throttle = new Throttle({ free: 1, base: 1000, max: 60000, limit: 2 });
    throttle.fail(['a'], 0);
    expect(throttle.begin(['b', 'new'], 0)).toBe(60000);
    expect(throttle.size).toBe(1);
    expect(throttle.wait(['a'], 0)).toBe(1000);
  });

  it('counts an attempt that has begun like a failure until it ends', () => {
    const throttle = new Throttle({ free: 2, base: 1000, max: 60000 });
    expect(throttle.begin(['name:ann', 'address:1'], 0)).toBe(0);
    expect(throttle.begin(['name:ann', 'address:2'], 0)).toBe(0);
    expect(throttle.begin(['name:ann', 'address:3'], 0)).toBe(1000);
    expect(throttle.wait(['address:3'], 0)).toBe(0);
    throttle.end(['name:ann', 'address:1'], 500, false);
    expect(throttle.wait(['name:ann'], 500)).toBe(1000);
    throttle.end(['name:ann', 'address:2'], 600, true);
    expect(throttle.wait(['name:ann'], 600)).toBe(0);
    expect(throttle.wait(['address:1'], 600)).toBe(0);
    expect(throttle.size).toBe(2);
  });

  it('keeps the wait of earlier failures when an attempt succeeds', () => {
    const throttle = new Throttle({ free: 1, base: 1000, max: 60000 });
    throttle.fail(['address:1'], 0);
    expect(throttle.begin(['address:1'], 1000)).toBe(0);
    throttle.end(['address:1'], 1000, true);
    expect(throttle.wait(['address:1'], 1000)).toBe(0);
    expect(throttle.size).toBe(1);
  });

  it('still counts the failure of an attempt whose key was cleared meanwhile', () => {
    const throttle = new Throttle({ free: 1, base: 1000, max: 60000 });
    throttle.begin(['name:ann'], 0);
    throttle.clear('name:ann');
    throttle.end(['name:ann'], 0, true);
    expect(throttle.size).toBe(0);
    throttle.begin(['name:ann'], 0);
    throttle.clear('name:ann');
    throttle.end(['name:ann'], 0, false);
    expect(throttle.wait(['name:ann'], 0)).toBe(1000);
  });

  it('has defaults: three free failures, then one second doubling up to five minutes', () => {
    const throttle = new Throttle();
    for (let n = 0; n < 3; n += 1) throttle.fail(['k'], 0);
    expect(throttle.wait(['k'], 0)).toBe(1000);
    for (let n = 0; n < 20; n += 1) throttle.fail(['k'], 0);
    expect(throttle.wait(['k'], 0)).toBe(300_000);
  });
});
