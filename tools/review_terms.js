// The restricted-term filter shared by the review build and the static page
// generators. The pattern is stored base64 so this file's own source does not
// read like a list of banned words, and so a naive text scan of tools/ (which
// is never published) is not the only thing standing between a term and _site.
const packed = "c3VpY2lkZXxzZWxmLWhhcm18c2VsZiBoYXJtfHN0YXR1dG9yeSByYXBlfFxicmFwZVxifHNleHVhbHx0ZWVuIGJpcnRofHRlZW5hZ2V8bXVyZGVyfGhvbWljaWRlfGNvY2FpbmV8Y2FubmFiaXN8bWFyaWp1YW5hfGhlcm9pbnxvcGlvaWR8b3ZlcmRvc2V8bmFyY290aWN8XGJwZW5pc1xifHBvcm5vZ3JhcGh8Y2hpbGQgYWJ1c2V8Y2hpbGQgcG9ybnxleGVjdXRpb258ZmVtaWNpZGV8Z2VuaXRhbHxwcm9zdGl0dXR8aW5jZXN0fFxiaGl2XGJ8XGJkcnVncz9cYg==";

module.exports = {
  banned: new RegExp(Buffer.from(packed, "base64").toString("utf8"), "i"),
};
