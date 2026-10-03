/**
 * Toggle Brand Logo Utility
 * Allows 1-click swapping between the New Red Brand Logo & Icon set
 * and the Legacy Blue Brand Logo & Icon set.
 *
 * Usage:
 *   node scripts/toggle-brand-logo.js red
 *   node scripts/toggle-brand-logo.js legacy
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const BACKUP_DIR = path.join(PUBLIC_DIR, 'legacy-logo-backup');
const RED_DIR = path.join(PUBLIC_DIR, 'red-logo-source');

const LOGO_FILES = [
  'qjo-logo.png',
  'favicon.png',
  'favicon.ico',
  'apple-touch-icon.png',
  'icon-16.png',
  'icon-32.png',
  'icon-48.png',
  'icon-64.png',
  'icon-128.png',
  'icon-180.png',
  'icon-192.png',
  'icon-256.png',
  'icon-512.png'
];

function backupLegacyLogos() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  let count = 0;
  for (const file of LOGO_FILES) {
    const srcPath = path.join(PUBLIC_DIR, file);
    const destPath = path.join(BACKUP_DIR, file);
    if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  console.log(`[Backup] Backed up ${count} legacy logo/icon files to public/legacy-logo-backup/`);
}

function switchTo(variant) {
  const sourceDir = variant === 'red' ? RED_DIR : BACKUP_DIR;

  if (!fs.existsSync(sourceDir)) {
    console.error(`[Error] Target source directory does not exist: ${sourceDir}`);
    process.exit(1);
  }

  let swapped = 0;
  for (const file of LOGO_FILES) {
    const src = path.join(sourceDir, file);
    const dest = path.join(PUBLIC_DIR, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      swapped++;
    }
  }

  console.log(`[Success] Successfully switched Qjo brand logo to: [${variant.toUpperCase()}] (${swapped} files updated)`);
}

const target = process.argv[2] ? process.argv[2].toLowerCase() : 'status';

if (target === 'backup') {
  backupLegacyLogos();
} else if (target === 'red' || target === 'new') {
  switchTo('red');
} else if (target === 'legacy' || target === 'blue' || target === 'revert') {
  switchTo('legacy');
} else {
  console.log(`
Qjo Brand Logo Swapper Utility
--------------------------------
Commands:
  npm run logo:red     -> Switch to new Red Logo & Icon set
  npm run logo:legacy  -> Revert to Legacy Blue Logo & Icon set
  node scripts/toggle-brand-logo.js backup -> Create/verify backup of current files
`);
}
