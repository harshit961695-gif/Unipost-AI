const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEBOUNCE_DELAY_MS = 5000;

function shouldIgnore(filePath) {
  if (!filePath) return true;
  const normalizedPath = filePath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  
  if (parts.some(part => [
    'node_modules',
    '.next',
    '.git',
    'scripts',
    '.env',
    '.env.local'
  ].includes(part))) {
    return true;
  }
  
  if (normalizedPath.endsWith('.log')) {
    return true;
  }
  
  return false;
}

function runSync() {
  const timeStr = new Date().toLocaleTimeString();
  console.log(`[${timeStr}] Running sync...`);
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (!status) {
      console.log('No local changes detected. Skipping synchronization.');
      return;
    }
    
    console.log('Detected local changes:\n' + status.split('\n').map(line => '  ' + line).join('\n'));
    
    console.log('Executing: git add .');
    execSync('git add .', { stdio: 'inherit' });
    
    const now = new Date();
    const formattedDate = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + ' ' +
      String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0') + ':' +
      String(now.getSeconds()).padStart(2, '0');
    
    const commitMsg = `Auto sync: ${formattedDate}`;
    console.log(`Executing: git commit -m "${commitMsg}"`);
    execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
    
    console.log('Executing: git push origin main');
    execSync('git push origin main', { stdio: 'inherit' });
    
    console.log('Synchronization completed successfully!');
  } catch (error) {
    console.error('Error during synchronization:', error.message);
  }
}

const isWatchMode = process.argv.includes('--watch');

if (isWatchMode) {
  console.log('Starting AutoSync in Watch Mode...');
  console.log(`Watching directory: ${process.cwd()}`);
  console.log('Will push changes to "origin main" automatically after 5 seconds of inactivity.');
  
  let isSyncing = false;
  let debounceTimer = null;
  
  fs.watch(process.cwd(), { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (shouldIgnore(filename)) return;
    
    if (isSyncing) return;
    
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    console.log(`[File Changed] ${filename} (${eventType}). Queueing sync...`);
    debounceTimer = setTimeout(() => {
      isSyncing = true;
      try {
        runSync();
      } finally {
        isSyncing = false;
      }
    }, DEBOUNCE_DELAY_MS);
  });
} else {
  runSync();
}
