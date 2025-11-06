#!/usr/bin/env node

/**
 * Download license files for all npm dependencies
 * Reads from licenses.csv to only download licenses for packages that will be included in the final report
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const LICENSES_DIR = path.join(process.cwd(), 'licenses/texts');
const LICENSES_CSV = path.join(process.cwd(), 'licenses/licenses.csv');
const CACHE_FILE = path.join(process.cwd(), 'licenses/cache.json');

// Ensure output directory exists
if (!fs.existsSync(LICENSES_DIR)) {
  fs.mkdirSync(LICENSES_DIR, { recursive: true });
}

// Check if CSV file exists
if (!fs.existsSync(LICENSES_CSV)) {
  console.error('Error: licenses.csv not found. Please run generate-licenses-csv first.');
  process.exit(1);
}

// Load cache
let cache = {};
if (fs.existsSync(CACHE_FILE)) {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
}

console.log('Downloading license files...');

// Read packages from CSV file
const csvContent = fs.readFileSync(LICENSES_CSV, 'utf8');
const lines = csvContent.split('\n').slice(1); // Skip header
const packages = new Map();

// Parse CSV to get package list
for (const line of lines) {
  if (!line.trim()) continue;
  
  const [component] = line.split(',');
  if (!component) continue;
  
  // Parse component name and version
  const lastAtIndex = component.lastIndexOf('@');
  if (lastAtIndex <= 0) continue; // Skip if no @ or @ is at start
  
  const name = component.substring(0, lastAtIndex);
  const version = component.substring(lastAtIndex + 1);
  const key = `${name}@${version}`;
  
  packages.set(key, { name, version });
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
    return { success: true, filename: cache[cacheKey], cached: true };
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
      return { success: true, filename, cached: false };
    } catch (err) {
      // Try next URL
    }
  }
  
  // If download failed, return failure info
  return { 
    success: false, 
    package: `${pkg.name}@${pkg.version}`,
    error: 'License file not found in package'
  };
}

// Process packages
async function processPackages() {
  const packagesArray = Array.from(packages.values());
  let downloaded = 0;
  let cached = 0;
  const failures = [];
  
  for (let i = 0; i < packagesArray.length; i++) {
    const pkg = packagesArray[i];
    
    try {
      const result = await downloadLicense(pkg);
      
      if (result.success) {
        if (result.cached) {
          cached++;
        } else {
          downloaded++;
        }
      } else {
        failures.push(result);
      }
      
      if ((i + 1) % 50 === 0) {
        console.log(`  Progress: ${i + 1}/${packagesArray.length} packages...`);
      }
    } catch (err) {
      failures.push({
        success: false,
        package: `${pkg.name}@${pkg.version}`,
        error: err.message
      });
    }
  }
  
  // Save cache
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  
  console.log(`\n✓ Processed ${packagesArray.length} packages`);
  console.log(`  Downloaded: ${downloaded}`);
  console.log(`  Cached: ${cached}`);
  
  if (failures.length > 0) {
    console.log(`\n❌ Failed to download licenses for ${failures.length} packages:`);
    failures.forEach(failure => {
      console.log(`  - ${failure.package}: ${failure.error}`);
    });
    
    console.log(`\n💡 To fix these failures:`);
    console.log(`   1. Add manual overrides to license-overrides.yml`);
    console.log(`   2. Or contact package maintainers to include license files`);
    console.log(`   3. Set fail-on-missing-licenses: false to allow missing licenses`);
    
    // Fail the action
    process.exit(1);
  }
}

// Main execution
async function main() {
  try {
    await processPackages();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
