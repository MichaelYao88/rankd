const test = require("node:test");
const assert = require("node:assert/strict");
const seed = require("../community-seed.js");

// A solved game of `tries` locks, every miss at `badness`, and the winning lock perfect.
function solved(tries, badness) {
  const ds = Array.from({ length: tries }, (_, i) => (i === tries - 1 ? 0 : badness));
  return seed.combineAccuracy(ds, true);
}

test("one try is a perfect 100", () => {
  assert.equal(seed.combineAccuracy([0], true), 100);
  assert.equal(solved(1, 0), 100);
});

test("try bands match the published examples", () => {
  assert.equal(solved(2, 0.2), 91);
  assert.equal(solved(2, 0.5), 85);
  assert.equal(solved(2, 0.9), 77);
  assert.equal(solved(2, 1), 75);

  assert.equal(solved(3, 0.2), 69);
  assert.equal(solved(3, 0.5), 62);
  assert.equal(solved(3, 0.9), 52);
  assert.equal(solved(3, 1), 50);

  assert.equal(solved(4, 0.2), 44);
  assert.equal(solved(4, 0.5), 37);
  assert.equal(solved(4, 0.9), 27);
  assert.equal(solved(4, 1), 25);

  assert.equal(solved(5, 0.2), 19);
  assert.equal(solved(5, 0.5), 13);
  assert.equal(solved(5, 0.9), 3);
  assert.equal(solved(5, 1), 0);

  assert.equal(solved(6, 0.2), 7);
  assert.equal(solved(6, 0.9), 2);
  assert.equal(solved(6, 1), 0);
});

test("a close miss scores above a far miss inside the same try count", () => {
  for (const tries of [2, 3, 4, 5, 6]) {
    assert.ok(solved(tries, 0.2) > solved(tries, 0.9), "tries " + tries);
  }
});

test("fewer tries never scores below more tries at the same miss quality", () => {
  for (const badness of [0, 0.2, 0.5, 0.8, 0.95, 1]) {
    let prev = 101;
    for (let tries = 1; tries <= 6; tries++) {
      const score = solved(tries, badness);
      assert.ok(score <= prev, `b=${badness} tries=${tries} ${score} > ${prev}`);
      prev = score;
    }
  }
});

test("bands 1 through 4 do not overlap", () => {
  const worst = [null, solved(1, 1), solved(2, 1), solved(3, 1), solved(4, 1)];
  const best = [null, solved(1, 0), solved(2, 0), solved(3, 0), solved(4, 0), solved(5, 0)];
  for (let tries = 1; tries <= 4; tries++) {
    assert.ok(worst[tries] >= best[tries + 1], `band ${tries}`);
  }
});

test("an unfinished game is 0 and sits under every positive finish", () => {
  const dnf = seed.combineAccuracy([0.2, 0.4, 0.9], false);
  assert.equal(dnf, 0);
  assert.equal(seed.combineAccuracy([1, 1, 1, 1], false), 0);
  for (const tries of [1, 2, 3, 4]) {
    for (const badness of [0, 0.2, 0.5, 0.9, 1]) {
      assert.ok(dnf < solved(tries, badness));
    }
  }
  assert.ok(dnf <= solved(5, 1));
  assert.ok(dnf < solved(5, 0.2));
  assert.ok(dnf <= solved(6, 1));
  assert.ok(dnf < solved(6, 0.2));
});

test("top 5 counts misses, and five hits is a perfect", () => {
  assert.equal(seed.combineAccuracy([0, 0, 0, 0, 0], true, "top5"), 100);
  assert.equal(seed.combineAccuracy([0, 0, 0, 0, 0.2], true, "top5"), 91);
  assert.equal(seed.combineAccuracy([0, 0, 0, 0.9, 0.8], true, "top5"), 54);
  assert.equal(seed.combineAccuracy([0.4, 0.6, 0.2], false, "top5"), 0);
});

test("a finished 0 still ranks above a DNF", () => {
  const block = seed.standingBlock("accuracy-rank", 400, "rank", 5);
  const finish = seed.betterThan(block, 5, 0, true);
  const giveUp = seed.betterThan(block, 5, 0, false);
  assert.ok(finish > giveUp, `${finish} vs ${giveUp}`);
});
