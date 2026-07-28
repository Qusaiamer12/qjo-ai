const fs = require('fs');
const path = require('path');

const checkFile = (file) => {
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(/require\(['"](\.[^'"]+)['"]\)/g) || [];
  for (const m of matches) {
    const reqPath = m.match(/require\(['"](\.[^'"]+)['"]\)/)[1];
    let fullPath = path.join(path.dirname(file), reqPath);
    if (!fs.existsSync(fullPath) && !fs.existsSync(fullPath + '.js') && !fs.existsSync(fullPath + '/index.js')) {
      console.error('MISSING IN ' + file + ': ' + reqPath);
    }
  }
};

checkFile('server.js');
checkFile('src/routes/chat.js');
checkFile('src/routes/qcode.js');
checkFile('src/routes/qspark.js');
checkFile('src/agents/RoutingEngine.js');
checkFile('src/services/llmService.js');
checkFile('src/agents/qcodeAgent.js');
console.log('Dependency check complete.');
