const fs = require('fs');
const path = require('path');

const walk = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.js')) {
      results.push(file);
    }
  });
  return results;
};

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

const files = walk('src');
files.push('server.js');
files.forEach(checkFile);
console.log('Full scan complete.');
