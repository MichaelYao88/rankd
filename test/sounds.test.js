const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

test("ui sounds stay quiet until a gesture, and the mute is remembered", () => {
  assert.match(app, /window\.AudioContext \|\| window\.webkitAudioContext/);
  assert.ok(app.indexOf("this.ctx = new AC()") > app.indexOf("arm()"));
  assert.match(app, /if \(!this\.ready \|\| !this\.on\(\) \|\| !this\.ctx\) return/);
  assert.match(app, /if \(!this\.ready \|\| !this\.on\(\)\) return/);
  assert.match(app, /pointerdown[\s\S]{0,40}Snd\.arm\(\)/);
  assert.match(app, /settings\.sound !== "off"/);
  assert.match(app, /id="mSound"/);
  assert.match(app, /Snd\.tick\(\)/);
  assert.match(app, /this\.env\(907, this\.ctx\.currentTime, 0\.05, "sine", 0\.03, 479\)/);
  assert.match(app, /Snd\.lock\(\)/);
  assert.match(app, /tier === "explosive"\) Snd\.godlike\(\)/);
  assert.match(app, /tier === "big"\) Snd\.yay\(\)/);
  assert.match(app, /sounds\/yay\.ogg/);
  assert.match(app, /sounds\/godlike\.ogg/);
  assert.match(app, /res\.solved \|\| res\.won/);
  assert.match(app, /bandpass/);
  assert.match(app, /rankd\.settings\.v1/);
  for (const file of ["sounds/yay.ogg", "sounds/godlike.ogg"]) {
    const bytes = fs.statSync(path.join(__dirname, "..", file)).size;
    assert.ok(bytes > 500 && bytes < 20000, file + " " + bytes);
  }
});
