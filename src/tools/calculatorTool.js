const CALCULATOR_TOOL = {
  type: 'function',
  function: {
    name: 'calculate',
    description: 'Perform deterministic mathematical calculations. Use for arithmetic, algebraic simplification, numeric expressions, statistics, percentages, powers, roots, trigonometry, logarithms, matrices, and unit-style calculations when an exact expression is available.',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'A mathjs-compatible expression, e.g. "sqrt(144) + 15% * 200", "mean([1,2,3])", "2^10", "sin(pi/2)".'
        }
      },
      required: ['expression']
    }
  }
};

function createSafeCalculate(math, evaluateFn) {
  // The caller may hand us the ORIGINAL math.evaluate captured before it was
  // overridden by a security import(). Without this, server.js's
  // `math.import({ evaluate: () => { throw ... } }, { override: true })`
  // clobbered the very function this tool needs, so every calculate() call
  // failed with "Nested evaluate is disabled." Nested evaluate inside an
  // expression string still resolves through the overridden namespace symbol,
  // so it stays blocked.
  const evaluate = typeof evaluateFn === 'function' ? evaluateFn : math.evaluate.bind(math);
  return function safeCalculate(expression) {
    const expr = String(expression || '').trim();
    if (!expr) throw new Error('Missing expression.');
    if (expr.length > 500) throw new Error('Expression is too long.');
    if (/[^0-9a-zA-Z_+\-*/%^().,\s\[\]{}:<>!=|&]/.test(expr)) {
      throw new Error('Expression contains unsupported characters.');
    }
    const result = evaluate(expr, {});
    if (typeof result === 'number') {
      if (!Number.isFinite(result)) throw new Error('Result is not finite.');
      return String(result);
    }
    if (result && typeof result.toString === 'function') return result.toString();
    return JSON.stringify(result);
  };
}

function addCalculatorSystemHint(messages) {
  const hint = 'Calculator tool available: for any non-trivial arithmetic, exact numeric computation, percentages, statistics, roots, powers, logs, matrix operations, or calculations where precision matters, call calculate instead of estimating mentally. Explain the final result clearly after receiving the tool result.';
  if (messages?.[0]?.role === 'system') {
    return [{ ...messages[0], content: String(messages[0].content || '') + '\n\n' + hint }, ...messages.slice(1)];
  }
  return [{ role: 'system', content: hint }, ...(messages || [])];
}

module.exports = {
  CALCULATOR_TOOL,
  createSafeCalculate,
  addCalculatorSystemHint
};
