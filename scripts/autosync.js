const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEBOUNCE_DELAY_MS = 5000;
const IGNORED_NAMES = new Set(['.git', 'node_modules', '.next', '.env', '.env.local', 'scripts']);

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
    
    console.log(`[${new Date().toLocaleTimeString()}] Synchronization completed successfully!`);
  } catch (error) {
    console.error('Error during synchronization:', error.message);
  }
}

function getWatchTargets(baseDir) {
  const targets = [];
  try {
    const items = fs.readdirSync(baseDir);
    for (const item of items) {
      if (IGNORED_NAMES.has(item)) continue;
      const fullPath = path.join(baseDir, item);
      try {
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          targets.push({ path: fullPath, isDirectory: true });
        }
      } catch (e) {
        // ignore files that cannot be stats'd
      }
    }
  } catch (e) {
    console.error('Error reading directory:', e.message);
  }
  // Also watch root itself non-recursively
  targets.push({ path: baseDir, isDirectory: false });
  return targets;
}

const isWatchMode = process.argv.includes('--watch');

if (isWatchMode) {
  console.log('Starting AutoSync in Watch Mode...');
  console.log(`Watching root directory: ${process.cwd()}`);
  console.log('Pushes to "origin main" automatically after 5 seconds of inactivity.');
  
  let isSyncing = false;
  let debounceTimer = null;
  const activeWatchers = [];
  
  function startWatchers() {
    // Clear any existing watchers
    while (activeWatchers.length > 0) {
      const w = activeWatchers.pop();
      try { w.close(); } catch (e) {}
    }
    
    const targets = getWatchTargets(process.cwd());
    
    for (const target of targets) {
      try {
        const watcher = fs.watch(
          target.path,
          { recursive: target.isDirectory },
          (eventType, filename) => {
            if (!filename) return;
            
            // Resolve relative path
            let relativePath;
            if (target.path === process.cwd()) {
              relativePath = filename;
            } else {
              relativePath = path.relative(process.cwd(), path.join(target.path, filename));
            }
            
            if (shouldIgnore(relativePath)) return;
            if (isSyncing) return;
            
            if (debounceTimer) {
              clearTimeout(debounceTimer);
            }
            
            console.log(`[File Changed] ${relativePath} (${eventType}). Queueing sync...`);
            
            debounceTimer = setTimeout(() => {
              isSyncing = true;
              try {
                runSync();
              } finally {
                isSyncing = false;
              }
            }, DEBOUNCE_DELAY_MS);
          }
        );
        
        watcher.on('error', (err) => {
          console.warn(`[Watcher Warning] Watcher error on target "${target.path}":`, err.message);
          // Restart watchers after a short delay
          setTimeout(startWatchers, 1000);
        });
        
        activeWatchers.push(watcher);
      } catch (err) {
        console.warn(`[Watcher Warning] Could not start watcher on "${target.path}":`, err.message);
      }
    }
  }
  
  startWatchers();
  
  // Keep the process alive indefinitely using an interval
  setInterval(() => {}, 1000 * 60 * 60);
} else {
  runSync();
}
