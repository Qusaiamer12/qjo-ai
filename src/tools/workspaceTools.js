// A per-task file workspace. Without one, "build me a project" can only ever
// produce disconnected code blocks in chat: the model has nowhere to put file
// one so that step four can read it back, and nothing accumulates.
//
// This is deliberately NOT the real filesystem. The model is writing paths it
// invented, in a process that also holds API keys and service-account
// credentials, so the workspace is a plain object living in the task's own
// state. Nothing here can touch disk, and a traversal attempt is a validation
// error rather than a write to /etc.

const MAX_FILES = 40;
const MAX_FILE_BYTES = 64 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024;
const MAX_PATH_LENGTH = 180;

// Accepts the shape of a project path and nothing else. Rejecting is cheap;
// a model that gets "use a relative path" back simply writes the right one.
function normalizePath(rawPath) {
  const path = String(rawPath || '').trim().replace(/\\/g, '/');
  if (!path) throw new Error('A file path is required.');
  if (path.length > MAX_PATH_LENGTH) throw new Error(`Path is too long (max ${MAX_PATH_LENGTH} characters).`);
  if (path.startsWith('/')) throw new Error('Use a relative path, not an absolute one.');
  if (/^[a-zA-Z]:/.test(path)) throw new Error('Use a relative path, not a drive path.');
  if (path.split('/').some(segment => segment === '..')) throw new Error('Paths cannot step outside the workspace.');
  if (path.split('/').some(segment => segment === '.')) throw new Error('Paths cannot contain "." segments.');
  if (/\0/.test(path)) throw new Error('Path contains an invalid character.');
  // Leading "./" is a normal thing to write and harmless once stripped.
  return path.replace(/^\.\//, '');
}

function byteLength(text) {
  return Buffer.byteLength(String(text || ''), 'utf8');
}

function totalBytes(files) {
  return Object.values(files || {}).reduce((sum, content) => sum + byteLength(content), 0);
}

function createWorkspace(initialFiles = {}) {
  const files = { ...initialFiles };

  function write(rawPath, content) {
    const path = normalizePath(rawPath);
    const body = String(content == null ? '' : content);
    const size = byteLength(body);

    if (size > MAX_FILE_BYTES) {
      throw new Error(`That file is ${Math.round(size / 1024)}KB; the limit is ${MAX_FILE_BYTES / 1024}KB. Split it into modules.`);
    }
    const isNew = !(path in files);
    if (isNew && Object.keys(files).length >= MAX_FILES) {
      throw new Error(`The workspace already holds ${MAX_FILES} files, which is the limit.`);
    }
    const projected = totalBytes(files) - byteLength(files[path] || '') + size;
    if (projected > MAX_TOTAL_BYTES) {
      throw new Error(`That write would take the project past ${MAX_TOTAL_BYTES / 1024}KB in total.`);
    }

    files[path] = body;
    return { path, bytes: size, created: isNew };
  }

  function read(rawPath) {
    const path = normalizePath(rawPath);
    if (!(path in files)) {
      const known = Object.keys(files).slice(0, 12).join(', ');
      throw new Error(`No file at "${path}".${known ? ` The workspace has: ${known}` : ' The workspace is empty.'}`);
    }
    return { path, content: files[path] };
  }

  function remove(rawPath) {
    const path = normalizePath(rawPath);
    if (!(path in files)) throw new Error(`No file at "${path}".`);
    delete files[path];
    return { path };
  }

  function list() {
    return Object.keys(files).sort().map(path => ({ path, bytes: byteLength(files[path]) }));
  }

  function snapshot() {
    return { ...files };
  }

  return { write, read, remove, list, snapshot, get size() { return totalBytes(files); } };
}

const WRITE_FILE_TOOL = {
  type: 'function',
  function: {
    name: 'write_file',
    description: 'Create or replace a file in the project workspace. Write complete, runnable files — never fragments or "rest unchanged" placeholders, because the next step reads back exactly what you wrote.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path inside the project, e.g. "src/server.js".' },
        content: { type: 'string', description: 'The complete contents of the file.' }
      },
      required: ['path', 'content']
    }
  }
};

const READ_FILE_TOOL = {
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read a file you wrote earlier in this project. Use it before editing, so you change the current contents rather than what you remember writing.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Relative path inside the project.' } },
      required: ['path']
    }
  }
};

const LIST_FILES_TOOL = {
  type: 'function',
  function: {
    name: 'list_files',
    description: 'List every file in the project workspace with its size. Use it to see what already exists before creating something new.',
    parameters: { type: 'object', properties: {} }
  }
};

const DELETE_FILE_TOOL = {
  type: 'function',
  function: {
    name: 'delete_file',
    description: 'Remove a file from the project workspace.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Relative path inside the project.' } },
      required: ['path']
    }
  }
};

// Bound to a workspace instance and handed to the routing engine as extraTools.
function workspaceToolDefinitions(getWorkspace) {
  return {
    write_file: {
      schema: WRITE_FILE_TOOL,
      label: 'Writing file',
      run: (args, ctx) => {
        const result = getWorkspace().write(args.path, args.content);
        ctx.note({ tool: 'write_file', input: result.path, bytes: result.bytes });
        return `${result.created ? 'Created' : 'Updated'} ${result.path} (${result.bytes} bytes).`;
      }
    },
    read_file: {
      schema: READ_FILE_TOOL,
      label: 'Reading file',
      run: (args, ctx) => {
        const result = getWorkspace().read(args.path);
        ctx.note({ tool: 'read_file', input: result.path });
        return `FILE: ${result.path}\n\n${result.content}`;
      }
    },
    list_files: {
      schema: LIST_FILES_TOOL,
      label: 'Listing files',
      run: (args, ctx) => {
        const entries = getWorkspace().list();
        ctx.note({ tool: 'list_files', count: entries.length });
        if (!entries.length) return 'The project workspace is empty.';
        return entries.map(e => `${e.path} (${e.bytes} bytes)`).join('\n');
      }
    },
    delete_file: {
      schema: DELETE_FILE_TOOL,
      label: 'Deleting file',
      run: (args, ctx) => {
        const result = getWorkspace().remove(args.path);
        ctx.note({ tool: 'delete_file', input: result.path });
        return `Deleted ${result.path}.`;
      }
    }
  };
}

module.exports = {
  createWorkspace,
  workspaceToolDefinitions,
  normalizePath,
  WRITE_FILE_TOOL,
  READ_FILE_TOOL,
  LIST_FILES_TOOL,
  DELETE_FILE_TOOL,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES
};
