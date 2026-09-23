/**
 * Reading a streamed answer: the wire format, and the reasoning/answer split.
 *
 * Both were inline in sendMessage, and both are where the subtle bugs live.
 * The glued-text defect that shipped to production — every word in every answer
 * run into the next — was in this area, and could only be reproduced by running
 * a real stream in a real browser. Pure functions can be tested exhaustively:
 * frames split mid-field, data arriving one byte at a time, malformed JSON, a
 * think-tag opening in one chunk and closing three chunks later.
 *
 * Nothing here touches the DOM. The parser returns events; the think-tag
 * splitter returns an ordered list of actions. The caller performs them, which
 * is what keeps the ordering exact.
 */
(function (global) {
  'use strict';

  /**
   * Server-sent events, tolerant of arbitrary chunk boundaries.
   *
   * The network decides where a chunk ends, not the protocol. A frame can
   * arrive split down the middle of `data:`, so everything after the last
   * blank-line separator is held until the rest turns up.
   *
   * @returns {{push: (text: string) => Array<{event: string, data: any}>, buffered: () => string}}
   */
  function createSseParser() {
    let buffer = '';

    function push(text) {
      buffer += String(text || '');
      const parts = buffer.split('\n\n');
      // The tail is either an incomplete frame or an empty string; either way
      // it waits for more bytes rather than being parsed now.
      buffer = parts.pop();

      const events = [];
      for (const part of parts) {
        let event = 'message';
        let data = '';
        for (const line of part.split('\n')) {
          if (line.startsWith('event:')) {
            event = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            // Multi-line data fields concatenate, as the SSE spec allows.
            data += line.slice(5).trim();
          }
        }
        if (!data) continue;
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (_) {
          // A frame we cannot read is skipped, not fatal: one bad frame must
          // not end an answer that is otherwise arriving fine.
          continue;
        }
        events.push({ event, data: parsed });
      }
      return events;
    }

    return { push, buffered: () => buffer };
  }

  /**
   * Reads a streamed response to its end, handing each event to onEvent.
   *
   * Resolves { stalled: true } when no bytes at all arrive for idleMs. The
   * server sends a keep-alive comment every 10 seconds while it works, so
   * that much silence is a dead connection, not a slow answer. Before this
   * the only limit was a 180-second timer that was cleared the moment the
   * response headers arrived — and the server sends those immediately — so a
   * stream that stopped mid-way left "searching…" on screen for good.
   *
   * An exception from onEvent (an `error` event, say) cancels the stream and
   * propagates.
   *
   * @param {ReadableStream<Uint8Array>} body
   * @param {{onEvent: (e: {event: string, data: any}) => void, idleMs: number}} options
   * @returns {Promise<{stalled: boolean}>}
   */
  async function readEventStream(body, { onEvent, idleMs }) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const sse = createSseParser();
    let stalled = false;
    let timer = null;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { stalled = true; reader.cancel().catch(() => {}); }, idleMs);
    };
    arm();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        arm();
        for (const event of sse.push(decoder.decode(value, { stream: true }))) onEvent(event);
      }
    } catch (error) {
      reader.cancel().catch(() => {});
      throw error;
    } finally {
      clearTimeout(timer);
    }
    return { stalled };
  }

  /**
   * Splits a streamed chunk between the reasoning channel and the answer.
   *
   * Some providers inline their thinking in the answer stream wrapped in
   * `<think>` tags instead of using a separate channel, and the tags can open
   * and close anywhere — including in different chunks from the text around
   * them. Returning ordered actions rather than performing them keeps the
   * sequence faithful: text before a tag must be delivered before the tag
   * takes effect.
   *
   * @param {string} text The chunk as received.
   * @param {boolean} insideThink Whether a previous chunk opened a think block.
   * @returns {{insideThink: boolean, actions: Array<{type: string, text?: string}>}}
   */
  function routeStreamChunk(text, insideThink) {
    const chunk = String(text || '');
    const actions = [];
    let inside = Boolean(insideThink);

    // The chunk is scanned rather than checked once, because a provider may
    // send a whole think block — open tag, thought and close tag — inside a
    // single chunk. The previous logic tested for `<think>` and then split on
    // it, so everything after the opening tag became reasoning: the closing
    // tag, the answer, and every chunk after it, since the state never
    // reopened. For any provider that does not stream its reasoning token by
    // token, that meant the reasoning card held the answer and the answer
    // itself was empty.
    let rest = chunk;
    let guardEmitted = false;

    while (rest) {
      if (!inside) {
        const at = rest.indexOf(OPEN_TAG);
        const plain = at === -1 ? rest : rest.slice(0, at);

        // A reasoning card still open is closed before answer text lands, so
        // the divider sits above the answer rather than below it.
        if (!guardEmitted) {
          actions.push({ type: 'endThinkingIfActive' });
          guardEmitted = true;
        }
        if (plain) actions.push({ type: 'content', text: plain });
        if (at === -1) break;

        actions.push({ type: 'beginThinking' });
        inside = true;
        rest = rest.slice(at + OPEN_TAG.length);
        continue;
      }

      const at = rest.indexOf(CLOSE_TAG);
      const thought = at === -1 ? rest : rest.slice(0, at);
      if (thought) actions.push({ type: 'reasoning', text: thought });
      if (at === -1) break;

      actions.push({ type: 'endThinking' });
      inside = false;
      rest = rest.slice(at + CLOSE_TAG.length);
    }

    // An empty chunk arriving outside a think block still closes a card that
    // is open, matching what a plain-text chunk does.
    if (!chunk && !inside) actions.push({ type: 'endThinkingIfActive' });

    return { insideThink: inside, actions };
  }

  const OPEN_TAG = '<think>';
  const CLOSE_TAG = '</think>';

  /**
   * The sources behind an answer, from the done event's toolsUsed: each
   * search the model ran carries what it found. Two searches often find the
   * same page, so the list is deduplicated and numbered in the order shown.
   * Only http(s) links survive — this list becomes links on the page.
   *
   * @param {Array<{sources?: Array<{title?: string, url?: string, kind?: string}>}>} toolsUsed
   * @param {number} [max]
   * @returns {Array<{id: number, title: string, url: string, kind: string}>}
   */
  function sourcesFromToolsUsed(toolsUsed, max = 8) {
    const out = [];
    const seen = new Set();
    for (const entry of Array.isArray(toolsUsed) ? toolsUsed : []) {
      for (const source of (entry && Array.isArray(entry.sources)) ? entry.sources : []) {
        const url = String((source && source.url) || '').trim();
        if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
        seen.add(url);
        out.push({ id: out.length + 1, title: String(source.title || ''), url, kind: String(source.kind || 'web') });
        if (out.length >= max) return out;
      }
    }
    return out;
  }

  const api = { createSseParser, routeStreamChunk, readEventStream, sourcesFromToolsUsed };

  global.QjoDomain = global.QjoDomain || {};
  global.QjoDomain.createSseParser = createSseParser;
  global.QjoDomain.routeStreamChunk = routeStreamChunk;
  global.QjoDomain.readEventStream = readEventStream;
  global.QjoDomain.sourcesFromToolsUsed = sourcesFromToolsUsed;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
