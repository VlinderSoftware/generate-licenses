#!/usr/bin/env node

/**
 * Download license files for all npm dependencies
 * Reads from package.json and downloads LICENSE files from npm/github
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const LICENSES_DIR = path.join(__dirname, '../licenses/texts');
const CACHE_FILE = path.join(__dirname, '../licenses/cache.json');

// Ensure output directory exists
if (!fs.existsSync(LICENSES_DIR)) {
  fs.mkdirSync(LICENSES_DIR, { recursive: true });
}

// Load cache
let cache = {};
if (fs.existsSync(CACHE_FILE)) {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
}

console.log('Downloading license files...');

// Get all dependencies
let npmList;
try {
  npmList = execSync('npm list --json --all --omit=peer', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
} catch (err) {
  // npm list returns non-zero exit code even with valid output when there are warnings
  if (err.stdout) {
    npmList = err.stdout;
  } else {
    throw err;
  }
}

const dependencies = JSON.parse(npmList);

// Track unique packages
const packages = new Map();

function extractPackages(deps) {
  if (!deps) return;
  
  for (const [name, info] of Object.entries(deps)) {
    const version = info.version;
    const key = `${name}@${version}`;
    
    if (!packages.has(key) && info.resolved) {
      packages.set(key, {
        name,
        version,
        resolved: info.resolved,
      });
    }
    
    if (info.dependencies) {
      extractPackages(info.dependencies);
    }
  }
}

if (dependencies.dependencies) {
  extractPackages(dependencies.dependencies);
}

// Download function with promise
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000 
    }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        return downloadFile(response.headers.location, dest)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const file = fs.createWriteStream(dest);
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    }).on('error', reject).on('timeout', () => {
      reject(new Error('Request timeout'));
    });
  });
}

// Sanitize filename
function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9.-]/gi, '_');
}

// Try to download license for a package
async function downloadLicense(pkg) {
  const cacheKey = `${pkg.name}@${pkg.version}`;
  
  // Check cache
  if (cache[cacheKey] && fs.existsSync(path.join(LICENSES_DIR, cache[cacheKey]))) {
    return cache[cacheKey];
  }
  
  const filename = `${sanitizeFilename(pkg.name)}-${sanitizeFilename(pkg.version)}.txt`;
  const filepath = path.join(LICENSES_DIR, filename);
  
  // Try to get license from unpkg.com
  const urls = [
    `https://unpkg.com/${pkg.name}@${pkg.version}/LICENSE`,
    `https://unpkg.com/${pkg.name}@${pkg.version}/LICENSE.md`,
    `https://unpkg.com/${pkg.name}@${pkg.version}/LICENSE.txt`,
    `https://unpkg.com/${pkg.name}@${pkg.version}/license`,
    `https://unpkg.com/${pkg.name}@${pkg.version}/license.md`,
  ];
  
  for (const url of urls) {
    try {
      await downloadFile(url, filepath);
      cache[cacheKey] = filename;
      return filename;
    } catch (err) {
      // Try next URL
    }
  }
  
  // If download failed, create a placeholder
  const placeholder = `License file not found for ${pkg.name}@${pkg.version}\n\nPlease visit: https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`;
  fs.writeFileSync(filepath, placeholder, 'utf8');
  cache[cacheKey] = filename;
  return filename;
}

// Process packages
async function processPackages() {
  const packagesArray = Array.from(packages.values());
  let downloaded = 0;
  let cached = 0;
  let failed = 0;
  
  for (let i = 0; i < packagesArray.length; i++) {
    const pkg = packagesArray[i];
    const cacheKey = `${pkg.name}@${pkg.version}`;
    
    try {
      if (cache[cacheKey]) {
        cached++;
      } else {
        await downloadLicense(pkg);
        downloaded++;
      }
      
      if ((i + 1) % 50 === 0) {
        console.log(`  Progress: ${i + 1}/${packagesArray.length} packages...`);
      }
    } catch (err) {
      failed++;
      console.error(`  ✗ Failed to download license for ${pkg.name}@${pkg.version}`);
    }
  }
  
  // Save cache
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  
  console.log(`\n✓ Processed ${packagesArray.length} packages`);
  console.log(`  Downloaded: ${downloaded}`);
  console.log(`  Cached: ${cached}`);
  if (failed > 0) {
    console.log(`  Failed: ${failed}`);
  }
}

processPackages().catch(console.error);
