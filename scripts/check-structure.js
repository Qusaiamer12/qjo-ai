// A ratchet, not an ideal.
//
// Quality rules that fail on day one get turned off on day two. So every
// budget here is set just under what the code does TODAY: nothing can get
// worse, and each refactor lowers the number it just beat. The goal is that
// this file only ever shrinks.
//
// Run with --update after a refactor to record the improvement.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BUDGET_FILE = path.join(__dirname, 'structure-budget.json');

// Files worth holding a line on. Anything not listed is free.
const WATCHED = [
  'public/app.js',
  'public/boot.js',
  'public/domain/markdown.js',
  'public/domain/requestFailure.js',
  'public/domain/streamProtocol.js',
  'public/ui/streamingView.js',
  'server.js',
  'src/agents/RoutingEngine.js',
  'src/agents/TaskRunner.js',
  'src/agents/toolAnswer.js',
  'src/agents/toolLoop.js',
  'src/routes/chat.js',
  'src/routes/sse.js',
  'src/services/exportService.js',
  'src/services/llmService.js',
  'src/services/providerResponse.js',
  'src/services/searchService.js',
  'src/search/searchCore.js',
  'src/services/systemPrompt.js',
  'src/services/knowledgeBase.js'
];

function lineCount(relative) {
  const full = path.join(ROOT, relative);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8').split('\n').length;
}

function readBudget() {
  if (!fs.existsSync(BUDGET_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}

function main() {
  const updating = process.argv.includes('--update');
  const budget = readBudget();
  const current = {};
  let failed = 0;
  let improved = 0;

  console.log('\nFile size budgets (a file may shrink, never grow)\n');

  for (const file of WATCHED) {
    const lines = lineCount(file);
    if (lines === null) {
      console.log(`  ?  ${file} — not found, skipping`);
      continue;
    }
    current[file] = lines;
    const allowed = budget[file];

    if (allowed === undefined) {
      console.log(`  +  ${file.padEnd(38)} ${String(lines).padStart(5)}  (new budget)`);
      continue;
    }
    if (lines > allowed) {
      failed++;
      console.log(`  ✗  ${file.padEnd(38)} ${String(lines).padStart(5)}  over budget by ${lines - allowed} (budget ${allowed})`);
    } else if (lines < allowed) {
      improved++;
      console.log(`  ↓  ${file.padEnd(38)} ${String(lines).padStart(5)}  down ${allowed - lines} from ${allowed}`);
    } else {
      console.log(`  =  ${file.padEnd(38)} ${String(lines).padStart(5)}`);
    }
  }

  if (updating) {
    fs.writeFileSync(BUDGET_FILE, JSON.stringify(current, null, 2) + '\n');
    console.log('\nBudgets updated to current sizes.');
    return;
  }

  if (failed) {
    console.log(`\n${failed} file(s) grew past budget.`);
    console.log('Split the new code into a module, or run "npm run structure -- --update" if the growth is genuinely justified.');
    process.exit(1);
  }

  console.log(`\nAll within budget${improved ? `, ${improved} improved` : ''}.`);
}

main();
