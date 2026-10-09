import { env } from '../config/env.js';

/**
 * Rewrites a finished post with AuthorMist (authormist/authormist-originality,
 * MIT) served by a llama.cpp server at AUTHORMIST_URL.
 *
 * AuthorMist is a Qwen2.5-3B paraphraser trained with Originality.ai's scores
 * as its reward. Prompting GPT alone never got posts past Originality in
 * testing; one AuthorMist pass over a GPT draft did, roughly two times in
 * three. Prompt format is the one from the model card.
 */
const PROMPT_PREFIX =
  'Please paraphrase the following text to make it more human-like while preserving the original meaning:\n\n';
const PROMPT_SUFFIX = '\n\nParaphrased text:';

const REQUEST_TIMEOUT_MS = 240_000;

export function isHumanizerEnabled() {
  return Boolean(env.AUTHORMIST_URL);
}

/**
 * AuthorMist garbles short sign-offs ("551 HVAC, Lodi." -> "551 for HVAC system
 * in Lodi."). Strip any short trailing sentence that names the business and
 * append the exact one.
 */
export function withExactSignOff(text, businessName, city) {
  const nameWords = String(businessName).toLowerCase().split(/\s+/).filter(Boolean);
  const needed = Math.max(1, Math.ceil(nameWords.length / 2));
  const namesBusiness = (s) => nameWords.filter((w) => s.toLowerCase().includes(w)).length >= needed;
  // Sometimes the model narrates its own task ("To rephrase in a way that
  // sounds more human... here is the paraphrased text:").
  const META = /paraphras|rephras|sounds? more human|original meaning|here is the|here's the/i;
  let sentences = String(text).trim().split(/(?<=[.!?:])\s+/).filter((s) => !META.test(s));

  // Served via llama.cpp, the model keeps going after its rewrite ("Certainly!
  // Here's another version..."). The rewrite itself ends at the first short
  // sign-off line, so anything after that is dropped.
  const firstSignOff = sentences.findIndex((s) => namesBusiness(s) && s.split(/\s+/).length <= 6);
  if (firstSignOff > 0) sentences = sentences.slice(0, firstSignOff);

  while (sentences.length > 1) {
    const last = sentences[sentences.length - 1];
    if (namesBusiness(last) && last.split(/\s+/).length <= 10) sentences.pop();
    else break;
  }
  return `${sentences.join(' ')} ${businessName}, ${city}.`;
}

/**
 * @returns {Promise<string|null>} the rewritten post, or null when the
 * humanizer is not configured or the call fails (caller keeps the draft).
 */
export async function humanizePost(text, { businessName, city }) {
  if (!isHumanizerEnabled()) return null;

  try {
    const res = await fetch(`${env.AUTHORMIST_URL}/completion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.AUTHORMIST_KEY ? { 'X-Authormist-Key': env.AUTHORMIST_KEY } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        // One paragraph in, so a blank line in the output only ever means the
        // model has moved on to commentary or a second version.
        prompt: `${PROMPT_PREFIX}${String(text).replace(/\s+/g, ' ').trim()}${PROMPT_SUFFIX}`,
        n_predict: 400,
        temperature: 0.7,
        top_p: 0.9,
        stop: ['\n\n', 'Please paraphrase', 'Certainly', 'Sure!', 'Note:', 'Is there anything'],
      }),
    });
    if (!res.ok) throw new Error(`AuthorMist HTTP ${res.status}`);
    const json = await res.json();
    const rewritten = String(json?.content ?? '').trim();
    if (rewritten.split(/\s+/).length < 30) throw new Error('AuthorMist returned too little text');
    return withExactSignOff(rewritten, businessName, city);
  } catch (e) {
    console.warn(JSON.stringify({ event: 'humanizer_failed', error: e?.message ?? String(e) }));
    return null;
  }
}
