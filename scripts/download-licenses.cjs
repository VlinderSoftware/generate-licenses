#!/usr/bin/env node

/**
 * Download license files for all npm dependencies
 * Reads from licenses.csv to only download licenses for packages that will be included in the final report
 */

const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const https = require('https');

const LICENSES_DIR = path.join(process.cwd(), 'licenses/texts');
const LICENSES_CSV = path.join(process.cwd(), 'licenses/licenses.csv');
const CACHE_FILE = path.join(process.cwd(), 'licenses/cache.json');

function ensureLicenseDirExists() {
  // Ensure output directory exists
  if (!fs.existsSync(LICENSES_DIR)) {
    console.warn(`${LICENSES_DIR} does not exist -- creating it`);
    fs.mkdirSync(LICENSES_DIR, { recursive: true });
  }
}

function ensureCsvFileExists() {
  // Check if CSV file exists
  if (!fs.existsSync(LICENSES_CSV)) {
    console.error('Error: licenses.csv not found. Please run generate-licenses-csv first.');
    process.exit(1);
  }
}

function loadCache() {
  // Load cache
  let cache = {};
  if (fs.existsSync(CACHE_FILE)) {
    console.log(`Loading ${CACHE_FILE}`);
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  }
  return cache;
}

// Download function with promise
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url} to ${dest}`);
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
async function downloadLicense(cache, pkg) {
  const cacheKey = `${pkg.name}@${pkg.version}`;
  
  // Check cache
  if (cache[cacheKey] && fs.existsSync(path.join(LICENSES_DIR, cache[cacheKey]))) {
    return [{ success: true, filename: cache[cacheKey], cached: true }, cache];
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
    `https://unpkg.com/${pkg.name}@${pkg.version}/License.md`,
  ];
  
  if (pkg.overrideUrl) {
    urls.push(pkg.overrideUrl);
  }

  for (const url of urls) {
    try {
      await downloadFile(url, filepath);
      cache[cacheKey] = filename;
      return [{ success: true, filename, cached: false }, cache];
    } catch (err) {
      // Try next URL
    }
  }
  
  // If download failed, return failure info
  return [{ 
    success: false, 
    package: `${pkg.name}@${pkg.version}`,
    error: 'License file not found in package'
  }, cache];
}

// Process packages
async function processPackages(cache, packagesArray) {
  //const packagesArray = Array.from(packages.values());
  let downloaded = 0;
  let cached = 0;
  const failures = [];
  
  for (let i = 0; i < packagesArray.length; i++) {
    const pkg = packagesArray[i];
    
    try {
      let result;
      [result, cache] = await downloadLicense(cache, pkg);
      
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

function parseCsv() {
  return new Promise((resolve, reject) => {
    let lines = [];
    // Read packages from CSV file
    fs.createReadStream(LICENSES_CSV, 'utf-8')
      .pipe(csv())
      .on('data', (data) => lines.push(data))
      .on('end', () => {
        resolve(lines);
      });
  });
}


// const csvContent = fs.readFileSync(LICENSES_CSV, 'utf8');
// //const lines = csvContent.split('\n').slice(1); // Skip header
// const packages = new Map();

// console.log(`Read ${lines.length} lines from the CSV file`);

// // Parse CSV to get package list
// let i = 1; // first line is a comment
// for (const line of lines) {
//   if (!line.trim()) continue;
//   i = i + 1;
  
//   const [component, version, licenseUrl, overrideUrl] = line.split(',');
//   if (!component){
//     console.warn(`Skipping line ${i} due to missing component.`);
//     continue;
//   }
//   if (!version){
//     console.warn(`Skipping line ${i} due to missing version.`);
//     continue;
//   }
  
//   const key = `${component}@${version}`;
  
//   packages.set(key, { name: component, version });
// }

// Main execution
async function main() {
  try {
    ensureLicenseDirExists();
    ensureCsvFileExists();
    let cache = loadCache();
    const lines = await parseCsv();
    await processPackages(cache, lines);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
