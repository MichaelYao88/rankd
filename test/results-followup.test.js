const test = require("node:test");
const assert = require("node:assert/strict");
const seed = require("../community-seed.js");

test("seeded first-guess average uses every row count", () => {
  for (const width of [3, 4, 5, 6, 7]) {
    const block = seed.standingBlock("row-" + width, 900, "rank", width);
    assert.equal(block.firstOf, width);
    const ratio = block.avgFirst / width;
    assert.ok(ratio >= 0.25 && ratio <= 0.7, `width ${width} avg ${block.avgFirst}`);
  }
  assert.equal(seed.standingBlock("pew-meaning-religion", 900, "tier", 6).firstOf, 6);
  assert.equal(seed.standingBlock("inheritance-tax", 900, "tier", 6).firstOf, 6);
  assert.equal(seed.standingBlock("match-foreign-relations", 900, "match", 4).firstOf, 4);
  assert.equal(seed.standingBlock("match-pew-meaning", 900, "match", 5).firstOf, 5);
  assert.equal(seed.standingBlock("match-age-of-consent", 900, "match", 6).firstOf, 6);
  const top = seed.standingBlock("top5-demo", 900, "top5", 120);
  assert.equal(top.firstOf, 5);
  assert.ok(top.avgFirst >= 1.2 && top.avgFirst <= 3.5, String(top.avgFirst));
});

test("a short stored average stretches onto the puzzle's rows", () => {
  const scaled = seed.scaleAvgFirst(1.66, 4, 6);
  assert.deepEqual(scaled, { avg: 2.5, firstOf: 6 });
  assert.deepEqual(seed.scaleAvgFirst(2.4, 6, 6), { avg: 2.4, firstOf: 6 });
  assert.equal(seed.scaleAvgFirst(3.2, 5, 3).firstOf, 3);
  assert.ok(seed.scaleAvgFirst(3.2, 5, 3).avg <= 3);
});

test("the player pedestal and better-than agree", () => {
  for (const y of [0, 24, 50, 76, 97, 99]) {
    assert.equal(seed.pedestalTopPercent(y) + y, 100);
  }
  assert.equal(seed.pedestalTopPercent(99), 1);
  assert.equal(seed.pedestalTopPercent(76), 24);
  const block = seed.standingBlock("work-hours", 900, "rank", 6);
  assert.equal(block.firstOf, 6);
  assert.equal(seed.betterThan(block, 1, 100, true), 99);
  assert.equal(seed.pedestalTopPercent(seed.betterThan(block, 1, 100, true)), 1);
});
