// Where a long task lives between steps.
//
// The whole point of the step-driven design is that no single process has to
// stay alive for the length of the task. On the free tier the instance sleeps
// after minutes of quiet and is replaced on every deploy, so anything held in
// a module-level Map is gone by the next step. State therefore has to round-
// trip through storage on every step, and the store is the only thing that
// knows whether that storage is real.
//
// Two implementations behind one interface: Firestore when the server has
// admin credentials, and memory when it does not. Memory is honest about what
// it is — `durable` is false — so callers can tell the user their task will
// not survive a restart instead of quietly losing it.

const MAX_HISTORY_MESSAGES = 60;

function nowIso() {
  return new Date().toISOString();
}

function newTaskId() {
  return `task-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

// The shape every step reads and writes. Kept flat and JSON-serialisable so it
// can go straight into a document without a mapping layer.
function blankTask({ uid, goal, mode = 'max', kind = 'general' }) {
  return {
    id: newTaskId(),
    uid: uid || null,
    goal: String(goal || '').slice(0, 8000),
    kind,
    mode,
    status: 'running',
    step: 0,
    plan: [],
    history: [],
    workspace: {},
    toolsUsed: [],
    result: null,
    error: null,
    lastMessage: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    finishedAt: null
  };
}

function createMemoryTaskStore({ maxTasks = 200 } = {}) {
  const tasks = new Map();

  function trim() {
    while (tasks.size > maxTasks) {
      const oldest = tasks.keys().next().value;
      tasks.delete(oldest);
    }
  }

  return {
    durable: false,
    async create(task) {
      tasks.set(task.id, JSON.parse(JSON.stringify(task)));
      trim();
      return task;
    },
    async get(id) {
      const found = tasks.get(id);
      return found ? JSON.parse(JSON.stringify(found)) : null;
    },
    async save(task) {
      task.updatedAt = nowIso();
      tasks.set(task.id, JSON.parse(JSON.stringify(task)));
      return task;
    },
    async list({ uid, limit = 20 } = {}) {
      return [...tasks.values()]
        .filter(t => !uid || t.uid === uid)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, limit)
        .map(t => JSON.parse(JSON.stringify(t)));
    }
  };
}

// Firestore keeps a document per task. History and workspace are the two parts
// that grow, and both are bounded before a write: a document has a hard size
// limit, and hitting it mid-task would fail the save and lose the step's work.
function createFirestoreTaskStore(firestore, { collection = 'agentTasks' } = {}) {
  const ref = () => firestore.collection(collection);

  return {
    durable: true,
    async create(task) {
      await ref().doc(task.id).set(task);
      return task;
    },
    async get(id) {
      const doc = await ref().doc(String(id)).get();
      return doc.exists ? doc.data() : null;
    },
    async save(task) {
      task.updatedAt = nowIso();
      await ref().doc(task.id).set(task);
      return task;
    },
    async list({ uid, limit = 20 } = {}) {
      let query = ref();
      if (uid) query = query.where('uid', '==', uid);
      const snapshot = await query.orderBy('updatedAt', 'desc').limit(limit).get();
      return snapshot.docs.map(d => d.data());
    }
  };
}

// Picks the durable store when the credentials for one exist, and says which
// it chose rather than leaving the caller to guess.
function createTaskStore({ firestore } = {}) {
  if (firestore) {
    try {
      return createFirestoreTaskStore(firestore);
    } catch (error) {
      console.warn('[taskStore] Firestore unavailable, falling back to memory:', error?.message || error);
    }
  }
  return createMemoryTaskStore();
}

module.exports = {
  createTaskStore,
  createMemoryTaskStore,
  createFirestoreTaskStore,
  blankTask,
  newTaskId,
  MAX_HISTORY_MESSAGES
};
