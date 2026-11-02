'use strict';
// A worked student problem (a sum, circuit, derivative, limit): the message
// gets the `problem` playbook, or asks for mathematics. The larger model
// writes these first in Normal: Groq gives it the same minute as the 20b.
// Kept apart from promptLayout.js, which it serves, so neither needs the other.
const { detectNeeds } = require('./playbooks');
const { mathAsked } = require('../agents/requestSignals');
const { ownWords } = require('../../public/domain/ownWords');

// Calculus words that mathAsked misses without an expression ("the limit of ... as x approaches 0").
const CALCULUS = /\b(?:limits?|derivatives?|integrals?|differentiate|integrate)\b|نهاي[ةه]|مشتق[ةه]|تكامل/i;
const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p && p.text) || '').join('\n') : '');

/** @param {Array<{role: string, content: any}>} messages */
function workedProblem(messages) {
  const users = (messages || []).filter((m) => m && m.role === 'user');
  const last = users[users.length - 1];
  if (!last) return false;
  const own = ownWords(textOf(last.content));
  if (mathAsked(own) || CALCULUS.test(own)) return true;
  return detectNeeds(users).playbooks.includes('problem');
}

module.exports = { workedProblem };
