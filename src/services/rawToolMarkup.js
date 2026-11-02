// A model that cannot call a tool through the API sometimes writes the call
// as text: <tool_call>{...}</tool_call>, <function=name>...</function>,
// <|python_tag|>. That text is not an answer. It is cut out here, so a reply
// made only of it is empty, and an empty reply is a failure that the chain
// retries on the next key or provider (RoutingEngine.runChain).
'use strict';

// open tag -> the tag that closes it ('' = runs to the end of the reply).
const RAW_TOOL_TAGS = {
  '<tool_call>': '</tool_call>',
  '<function_call>': '</function_call>',
  '<tool_code>': '</tool_code>',
  '<function=': '</function>',
  '<|python_tag|>': ''
};
const RAW_OPEN_TAGS = Object.keys(RAW_TOOL_TAGS);

/** First raw tool-call opening tag in `text`: { index, open, close } or null. */
function findRawToolOpen(text) {
  let best = null;
  for (const open of RAW_OPEN_TAGS) {
    const index = text.indexOf(open);
    if (index !== -1 && (!best || index < best.index)) best = { index, open, close: RAW_TOOL_TAGS[open] };
  }
  return best;
}

/** Removes every raw tool-call block, finished or cut off, from a whole reply. */
function stripRawToolMarkup(text) {
  let out = String(text || '');
  for (let hit = findRawToolOpen(out); hit; hit = findRawToolOpen(out)) {
    const end = hit.close ? out.indexOf(hit.close, hit.index + hit.open.length) : -1;
    out = out.slice(0, hit.index) + (end === -1 ? '' : out.slice(end + hit.close.length));
  }
  return out;
}

module.exports = { RAW_OPEN_TAGS, findRawToolOpen, stripRawToolMarkup };
