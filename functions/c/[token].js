// Shareable challenge preview: /c/<token>
//
// Link unfurlers do not run app.js, so the sender's score has to be server-rendered.
// This function decodes the same token the app puts in &c=, returns a small HTML card
// with og:/twitter: tags, and redirects humans into the game. Invalid tokens go home.
//
// Deploy with the site: Cloudflare Pages picks up functions/ automatically. The build
// writes _routes.json so only /c/* invokes the runtime.
import "../../challenge.js";
import "../../challenge-preview.js";

const SITE = "https://ranki.gg";

export function onRequestGet(context) {
  const token = String((context.params && context.params.token) || "");
  const challenge = globalThis.RankdChallenge;
  const preview = globalThis.RankdChallengePreview;
  const decoded = challenge && challenge.decode(token);
  if (!decoded || !preview) {
    return new Response(null, {
      status: 302,
      headers: { Location: SITE + "/", "Cache-Control": "no-store" },
    });
  }
  return new Response(preview.page(token, decoded, SITE), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Ranki-Preview": "1",
    },
  });
}
