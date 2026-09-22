// A place to declare a tool once — schema and implementation together — so the
// router does not grow an if/else arm per tool, and so new tools can be added
// without touching provider plumbing.
//
// Each tool is { schema, run, available }. `available` is checked at build time
// so a tool whose dependency is missing (no search key, no workspace) is never
// advertised to the model: offering a tool that then answers "not available"
// wastes a whole round.

function createToolRegistry() {
  const tools = new Map();

  function register(name, { schema, run, available = () => true, label }) {
    if (!name || typeof run !== 'function' || !schema) {
      throw new Error(`registerTool(${name}) needs a schema and a run function`);
    }
    tools.set(name, { name, schema, run, available, label: label || name });
  }

  function has(name) {
    const tool = tools.get(name);
    return Boolean(tool && tool.available());
  }

  function names() {
    return [...tools.keys()].filter(has);
  }

  // Schemas for the subset the caller wants to offer, skipping any whose
  // dependency is currently missing.
  function schemasFor(wanted) {
    // Deduplicated: a name can legitimately arrive twice — once because the
    // router asked for it by name and once because the host registered it —
    // and handing the model the same tool twice invites confused calls.
    const seen = new Set();
    const list = [];
    for (const name of wanted || []) {
      if (seen.has(name) || !has(name)) continue;
      seen.add(name);
      list.push(tools.get(name).schema);
    }
    return list.length ? list : undefined;
  }

  function labelFor(name) {
    return tools.get(name)?.label || name;
  }

  // Never throws and never waits forever: a tool failure — including one that
  // does not come back — is an observation the model should see and work
  // around, not something that ends or freezes the task. The tool's own work
  // cannot be cancelled from here, so a late result is simply ignored.
  /**
   * @param {string} name
   * @param {object} [args]
   * @param {object} [ctx]
   * @param {{timeoutMs?: number}} [options]
   */
  async function execute(name, args, ctx = {}, { timeoutMs = 0 } = {}) {
    const tool = tools.get(name);
    if (!tool || !tool.available()) {
      return { ok: false, output: `Tool "${name}" is not available.` };
    }
    let timer = null;
    try {
      const run = Promise.resolve().then(() => tool.run(args || {}, ctx));
      const output = timeoutMs > 0
        ? await Promise.race([
          run,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${name} did not finish within ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
          })
        ])
        : await run;
      return { ok: true, output };
    } catch (error) {
      return { ok: false, output: `Tool error: ${error?.message || error}` };
    } finally {
      clearTimeout(timer);
    }
  }

  return { register, has, names, schemasFor, execute, labelFor };
}

module.exports = { createToolRegistry };
