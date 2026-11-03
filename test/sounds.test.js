const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

test("ui sounds are synthesized, quiet until a gesture, and remembered in the menu", () => {
  assert.match(app, /window\.AudioContext \|\| window\.webkitAudioContext/);
  assert.doesNotMatch(app, /new Audio\(|\.(mp3|wav|ogg|m4a)\b/);
  assert.ok(app.indexOf("this.ctx = new AC()") > app.indexOf("arm()"));
  assert.match(app, /if \(!this\.ready \|\| !this\.on\(\) \|\| !this\.ctx\) return/);
  assert.match(app, /pointerdown[\s\S]{0,40}Snd\.arm\(\)/);
  assert.match(app, /settings\.sound !== "off"/);
  assert.match(app, /id="mSound"/);
  assert.match(app, /Snd\.tick\(\)/);
  assert.match(app, /Snd\.lock\(\)/);
  assert.match(app, /opts\.sound\) Snd\.success\(/);
  assert.match(app, /res\.solved \|\| res\.won/);
  assert.match(app, /bandpass/);
  assert.match(app, /rankd\.settings\.v1/);
});
