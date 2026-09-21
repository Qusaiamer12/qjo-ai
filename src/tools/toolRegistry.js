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

  // Never throws: a tool failure is an observation the model should see and
  // work around, not an error that ends the task.
  async function execute(name, args, ctx = {}) {
    const tool = tools.get(name);
    if (!tool || !tool.available()) {
      return { ok: false, output: `Tool "${name}" is not available.` };
    }
    try {
      const output = await tool.run(args || {}, ctx);
      return { ok: true, output };
    } catch (error) {
      return { ok: false, output: `Tool error: ${error?.message || error}` };
    }
  }

  return { register, has, names, schemasFor, execute, labelFor };
}

module.exports = { createToolRegistry };
