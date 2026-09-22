// Turning what the tools found into an answer — including when the model
// cannot be the one to write it.
//
// A tool-using turn has three ways to end: the model answers (the normal
// case); the model is asked once more, without tools, to answer from what was
// gathered; or no model can answer in time and the evidence is presented
// directly. The third used to be "return the first response", which after a
// search was the tool call itself plus any "let me look that up" preamble, so
// the person watched the app decide to search and then deliver nothing.
'use strict';

const MAX_SOURCES = 6;
const SNIPPET_CHARS = 900;
const FALLBACK_SNIPPET_CHARS = 320;

function publishedOf(result) {
  const raw = result?.publishedDate || result?.published_date || '';
  return raw ? String(raw).slice(0, 10) : '';
}

/**
 * Search results as plain data, deduplicated by URL, so they can outlive the
 * formatted text the model saw.
 * @param {{results?: Array<{title?: string, url?: string, content?: string, snippet?: string, publishedDate?: string, published_date?: string}>, query?: string}} payload
 * @returns {Array<{title: string, url: string, content: string, published: string}>}
 */
function evidenceFromSearch(payload) {
  const out = [];
  const seen = new Set();
  for (const r of payload?.results || []) {
    const url = String(r?.url || '').trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({
      title: String(r.title || url).trim(),
      url,
      content: String(r.content || r.snippet || '').replace(/\s+/g, ' ').trim(),
      published: publishedOf(r)
    });
  }
  return out;
}

/**
 * What the model sees after calling web_search.
 *
 * Numbered, dated, and marked as full page or snippet, with instructions for
 * the answer's shape: lead with the direct answer, cite each claim where it is
 * made, prefer the newest dated source when they disagree, and say so when the
 * evidence does not settle the question.
 */
function formatSearchResultsForTool(payload) {
  const results = (payload?.results || []).slice(0, MAX_SOURCES);
  const query = payload?.query || '';
  if (!results.length && payload?.status === 'unavailable') {
    return `Web search is unavailable right now — every search provider failed for "${query}". Tell the person plainly that live search did not work this time (not that the information does not exist), give what you know with a clear note that it may be out of date, and suggest asking again in a few minutes.`;
  }
  if (!results.length) {
    return `No web results found for "${query}". Do not fill the gap from memory as if it were current: say plainly that you could not find up-to-date information, give what you know with that caveat, or try one different, simpler query.`;
  }

  const body = results.map((r) => {
    const published = publishedOf(r);
    const meta = [r.url, published ? `published ${published}` : 'date unknown'].filter(Boolean).join(' · ');
    const extracted = r.firecrawl ? ' [full page text]' : ' [snippet only]';
    return `[${r.id}] ${r.title || 'untitled'}${extracted}\n${meta}\n${String(r.content || '').slice(0, SNIPPET_CHARS)}`;
  }).join('\n\n');

  return [
    `Search results for "${query}" (retrieved ${new Date().toISOString().slice(0, 10)}):`,
    '',
    body,
    '',
    'How to answer from these:',
    '- Open with the direct answer in one or two sentences, then the supporting detail. Use headings or a short list only when the answer has parts.',
    '- Cite each claim where it is made, as a markdown link: [1](url). Only cite a source for what it actually says.',
    '- When sources disagree, prefer the most recent dated one and say that they disagree.',
    '- "snippet only" is two lines of a page: if a number, date or exact wording matters, open it with fetch_page before relying on it.',
    '- If none of them answers the question, say so plainly instead of writing a confident answer the evidence does not support.',
    '- Answer in the language the person wrote in.'
  ].join('\n');
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('\n');
  return '';
}

/**
 * The conversation, re-sent without tools, with everything the tools
 * returned folded into the person's last message.
 *
 * Folded in rather than appended as role "tool" or a second user message:
 * the round being replaced may have failed precisely because this provider
 * rejects tool-role messages, and several chat templates reject two user
 * turns in a row. One user turn carrying its own context is accepted
 * everywhere.
 *
 * @param {Array<{role: string, content: any}>} baseMessages The turn as it was first sent.
 * @param {string[]} toolOutputs What each tool call returned, in order.
 * @param {{arabic: boolean}} options
 */
function buildSynthesisMessages(baseMessages, toolOutputs, { arabic }) {
  const messages = Array.isArray(baseMessages) ? baseMessages.slice() : [];
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') { lastUser = i; break; }
  }
  const gathered = toolOutputs.filter(Boolean).join('\n\n---\n\n') || (arabic ? '(لم تُرجع الأدوات أي نتائج.)' : '(The tools returned nothing.)');
  const instruction = arabic
    ? 'اكتب الآن الإجابة النهائية على سؤالي أعلاه، معتمدًا على ما جُمع أعلاه للمعلومات الحديثة. ابدأ بالجواب المباشر، ثم التفاصيل، واذكر المصدر لكل معلومة كرابط [1](url). إذا لم تكفِ المعلومات للإجابة بثقة فقل ذلك بوضوح. لا تقل إنك ستبحث — البحث انتهى.'
    : 'Now write the final answer to my question above, relying on what was gathered for anything current. Lead with the direct answer, then the detail, and cite each fact as a link [1](url). If the material is not enough to answer confidently, say so plainly. Do not say you will search — the search is done.';
  const context = `\n\n---\n${arabic ? 'نتائج الأدوات التي استُخدمت للإجابة على هذا السؤال (سياق، وليست سؤالًا جديدًا):' : 'Results from the tools used for this question (context, not a new question):'}\n\n${gathered}\n\n---\n${instruction}`;

  if (lastUser === -1) {
    messages.push({ role: 'user', content: context.trim() });
    return messages;
  }
  const original = messages[lastUser];
  messages[lastUser] = Array.isArray(original.content)
    ? { ...original, content: [...original.content, { type: 'text', text: context }] }
    : { ...original, content: `${textOf(original.content)}${context}` };
  return messages;
}

function trimToSentence(text, max) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('؟ '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return `${(end > max * 0.5 ? cut.slice(0, end + 1) : cut).trim()}…`;
}

/**
 * The answer of last resort: the sources themselves, written for a person.
 *
 * Used only when every model has failed after a search that succeeded. It is
 * honest about what it is, and it is still an answer: what each source says,
 * with its link and date, so the person can read it rather than retry blind.
 *
 * @param {Array<{title: string, url: string, content: string, published: string}>} evidence
 * @param {{arabic: boolean}} options
 */
function formatEvidenceAnswer(evidence, { arabic }) {
  const sources = evidence.slice(0, MAX_SOURCES);
  const intro = arabic
    ? 'تعذّر عليّ صياغة إجابة كاملة الآن لأن خدمة الذكاء الاصطناعي لم تستجب في الوقت المحدد، لكن البحث نجح، وهذا ما تقوله المصادر:'
    : 'I could not write a full answer just now because the AI service did not respond in time, but the search worked. Here is what the sources say:';
  const items = sources.map((s, i) => {
    const date = s.published ? (arabic ? ` — نُشر ${s.published}` : ` — published ${s.published}`) : '';
    const snippet = trimToSentence(s.content, FALLBACK_SNIPPET_CHARS);
    return `${i + 1}. **[${s.title.replace(/[[\]]/g, '')}](${s.url})**${date}${snippet ? `\n   ${snippet}` : ''}`;
  });
  const outro = arabic
    ? 'أعد إرسال السؤال بعد لحظات إذا أردت إجابة مصاغة من هذه المصادر.'
    : 'Send the question again in a moment for an answer written from these sources.';
  return `${intro}\n\n${items.join('\n\n')}\n\n${outro}`;
}

module.exports = {
  evidenceFromSearch,
  formatSearchResultsForTool,
  buildSynthesisMessages,
  formatEvidenceAnswer
};
