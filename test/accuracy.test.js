const test = require("node:test");
const assert = require("node:assert/strict");
const seed = require("../community-seed.js");

const TIP = "100 for a first-try solve. Each extra try drops you to a lower band (80s, 60s, 40s, 20s), and within a band you lose 1 point for every spot a country was off in your wrong guesses.";

// A solved game of `tries` locks. The winning lock is perfect. Earlier wrong
// guesses add up to `distance` spots off.
function solved(tries, distance) {
  const ds = Array.from({ length: tries }, () => 0);
  if (tries > 1) ds[0] = distance;
  return seed.combineAccuracy(ds, true);
}

test("a perfect first try is 100", () => {
  assert.equal(seed.combineAccuracy([0], true), 100);
  assert.equal(solved(1, 0), 100);
  assert.equal(solved(1, 12), 100);
});

test("second try loses one point per spot and clamps at 80", () => {
  assert.equal(solved(2, 2), 97);
  assert.equal(seed.combineAccuracy([2, 0], true), 97);
  assert.equal(solved(2, 30), 80);
  assert.equal(seed.combineAccuracy([30, 0], true), 80);
  assert.equal(solved(2, 19), 80);
  assert.equal(solved(2, 0), 99);
});

test("third try with zero distance on the wrong guesses is 79", () => {
  assert.equal(solved(3, 0), 79);
  assert.equal(seed.combineAccuracy([0, 0, 0], true), 79);
  assert.equal(solved(4, 0), 59);
  assert.equal(solved(5, 0), 39);
  assert.equal(solved(6, 0), 19);
  assert.equal(solved(7, 0), 1);
});

test("scores are integers and fewer tries never score lower", () => {
  for (const distance of [0, 2, 10, 19, 30, 80]) {
    let prev = 101;
    for (let tries = 1; tries <= 8; tries++) {
      const score = solved(tries, distance);
      assert.equal(score, Math.round(score));
      assert.ok(score >= 1 && score <= 100, String(score));
      assert.ok(score <= prev, `d=${distance} tries=${tries} ${score} > ${prev}`);
      prev = score;
    }
  }
  for (let tries = 1; tries <= 6; tries++) {
    assert.ok(solved(tries, 500) >= solved(tries + 1, 0), `band ${tries}`);
  }
});

test("an unfinished game scores under 20 and under every short solve", () => {
  const samples = [
    seed.combineAccuracy([2], false),
    seed.combineAccuracy([30], false),
    seed.combineAccuracy([0, 0, 0, 0, 4], false),
    seed.combineAccuracy([1, 1, 1, 1], false),
    seed.combineAccuracy([], false),
    seed.combineAccuracy([4, 8, 12], false, "top5"),
  ];
  for (const dnf of samples) {
    assert.equal(dnf, Math.round(dnf));
    assert.ok(dnf < 20, "DNF " + dnf);
    assert.ok(dnf >= 1, "DNF " + dnf);
  }
  for (let tries = 1; tries <= 5; tries++) {
    const finish = solved(tries, 500);
    assert.ok(finish >= 20, "solve " + tries + " " + finish);
    for (const dnf of samples) assert.ok(dnf < finish, `${dnf} vs ${finish}`);
  }
  assert.equal(seed.combineAccuracy([0], false), 19);
  assert.equal(seed.combineAccuracy([18], false), 1);
  assert.equal(seed.combineAccuracy([40], false), 1);
});

test("top 5 uses the same bands, counting misses", () => {
  assert.equal(seed.combineAccuracy([0, 0, 0, 0, 0], true, "top5"), 100);
  assert.equal(seed.combineAccuracy([0, 0, 0, 0, 2], true, "top5"), 97);
  assert.equal(seed.combineAccuracy([30], true, "top5"), 80);
  assert.equal(seed.combineAccuracy([0, 0, 4, 0, 6], true, "top5"), 69);
  const dnf = seed.combineAccuracy([0.4, 0.6, 0.2], false, "top5");
  assert.ok(dnf < 20);
  let prev = 101;
  for (let misses = 0; misses <= 8; misses++) {
    const ds = Array.from({ length: misses }, () => 2);
    const score = seed.combineAccuracy(ds, true, "top5");
    assert.ok(score <= prev, `misses ${misses} ${score} > ${prev}`);
    prev = score;
  }
});

test("the tooltip explains the bands and does not mention a DNF penalty", () => {
  assert.equal(seed.ACCURACY_TIP, TIP);
  assert.equal(/unfinished|penalty|give up|dnf/i.test(seed.ACCURACY_TIP), false);
});

test("better than and the podium still rank tries, then accuracy, with DNF last", () => {
  const block = seed.standingBlock("accuracy-rank", 400, "rank", 5);
  const perfect = seed.betterThan(block, 1, 100, true);
  const second = seed.betterThan(block, 2, 97, true);
  const third = seed.betterThan(block, 3, 79, true);
  const finish = seed.betterThan(block, 5, 20, true);
  const giveUp = seed.betterThan(block, 5, 19, false);
  assert.ok(perfect > second, `${perfect} vs ${second}`);
  assert.ok(second > third, `${second} vs ${third}`);
  assert.ok(third > finish, `${third} vs ${finish}`);
  assert.ok(finish > giveUp, `${finish} vs ${giveUp}`);
  const sameTriesClose = seed.betterThan(block, 2, 97, true);
  const sameTriesFar = seed.betterThan(block, 2, 80, true);
  assert.ok(sameTriesClose >= sameTriesFar, `${sameTriesClose} vs ${sameTriesFar}`);
});
