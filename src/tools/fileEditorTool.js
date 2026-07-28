const { z } = require('zod');

const QcodeToolNameSchema = z.enum([
  'list_files',
  'read_file',
  'write_file',
  'edit_file',
  'search_files',
  'run_command',
  'project_map',
  'create_snapshot',
  'rollback_snapshot'
]);

const QcodeActionSchema = z.object({
  tool: QcodeToolNameSchema,
  path: z.string().max(500).optional().default(''),
  content: z.string().max(250000).optional().default(''),
  find: z.string().max(50000).optional().default(''),
  replace: z.string().max(50000).optional().default(''),
  query: z.string().max(500).optional().default(''),
  command: z.string().max(500).optional().default(''),
  snapshotId: z.string().max(120).optional().default('')
});

const QcodeActionsSchema = z.array(QcodeActionSchema).max(12);

function validateQcodeActions(actions) {
  const parsed = QcodeActionsSchema.safeParse(Array.isArray(actions) ? actions : []);
  if (!parsed.success) return [];
  return parsed.data;
}

function qcodeToolNames() {
  return QcodeToolNameSchema.options.slice();
}

module.exports = {
  QcodeToolNameSchema,
  QcodeActionSchema,
  QcodeActionsSchema,
  validateQcodeActions,
  qcodeToolNames
};
