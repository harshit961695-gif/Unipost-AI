const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEBOUNCE_DELAY_MS = 5000;

// Log helper with timestamp
function log(message, ...args) {
  const timeStr = new Date().toLocaleTimeString();
  console.log(`[AutoSync][${timeStr}] ${message}`, ...args);
}

function errorLog(message, ...args) {
  const timeStr = new Date().toLocaleTimeString();
  console.error(`[AutoSync][${timeStr}][ERROR] ${message}`, ...args);
}

// Global error handling to prevent silent crashes
process.on('uncaughtException', (err) => {
  errorLog('Uncaught Exception:', err.stack || err);
});

process.on('unhandledRejection', (reason) => {
  errorLog('Unhandled Rejection:', reason);
});

// Check if a path should be ignored
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
  
  return false;
}

function runSync() {
  log('Sync running...');
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (!status) {
      log('No local changes detected. Skipping commit/push.');
      return;
    }
    
    log('Detected changes:\n' + status.split('\n').map(line => '  ' + line).join('\n'));
    
    log('Executing: git add .');
    execSync('git add .', { stdio: 'inherit' });
    
    const now = new Date();
    const formattedDate = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + ' ' +
      String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0') + ':' +
      String(now.getSeconds()).padStart(2, '0');
    
    const commitMsg = `Auto sync: ${formattedDate}`;
    log(`Executing: git commit -m "${commitMsg}"`);
    execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
    log('Commit created.');
    
    log('Executing: git push origin main');
    execSync('git push origin main', { stdio: 'inherit' });
    log('Push completed.');
    
    log('Synchronization completed successfully!');
  } catch (error) {
    errorLog('Error during synchronization:', error.message);
  }
}

const isWatchMode = process.argv.includes('--watch');

if (isWatchMode) {
  log('Starting AutoSync in Watch Mode...');
  log(`Watching root directory: ${process.cwd()}`);
  log('Pushes to "origin main" automatically after 5 seconds of inactivity.');
  
  let isSyncing = false;
  let debounceTimer = null;
  let watcher = null;
  
  function startWatcher() {
    try {
      if (watcher) {
        try { watcher.close(); } catch (e) {}
      }
      
      watcher = fs.watch(process.cwd(), { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        if (shouldIgnore(filename)) return;
        if (isSyncing) return;
        
        log(`File changed: ${filename} (Event: ${eventType})`);
        
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        
        log(`Debounce started. Waiting ${DEBOUNCE_DELAY_MS / 1000} seconds of inactivity...`);
        debounceTimer = setTimeout(() => {
          isSyncing = true;
          try {
            runSync();
          } finally {
            isSyncing = false;
          }
        }, DEBOUNCE_DELAY_MS);
      });
      
      watcher.on('error', (err) => {
        errorLog('Watcher error:', err.message);
        // Attempt to recreate the watcher after a delay
        setTimeout(startWatcher, 1000);
      });
      
      log('Watcher started successfully.');
    } catch (err) {
      errorLog('Failed to initialize watcher:', err.message);
      // Attempt to retry initialization after a delay
      setTimeout(startWatcher, 5000);
    }
  }
  
  startWatcher();
  
  // Keep the process alive persistently using a repeating interval
  setInterval(() => {
    log('Watcher heartbeat: Still running...');
  }, 1000 * 60 * 10); // Log heartbeat every 10 minutes to verify activity
  
} else {
  runSync();
}
