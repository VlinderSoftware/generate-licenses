#!/usr/bin/env node
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 317:
/***/ ((module) => {

"use strict";
module.exports = require("child_process");

/***/ }),

/***/ 896:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ 692:
/***/ ((module) => {

"use strict";
module.exports = require("https");

/***/ }),

/***/ 928:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};

/**
 * Download license files for all npm dependencies
 * Reads from package.json and downloads LICENSE files from npm/github
 */

const fs = __nccwpck_require__(896);
const path = __nccwpck_require__(928);
const https = __nccwpck_require__(692);
const { execSync } = __nccwpck_require__(317);

const LICENSES_DIR = path.join(process.cwd(), 'licenses/texts');
const CACHE_FILE = path.join(process.cwd(), 'licenses/cache.json');

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
    cwd: process.cwd(),
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

module.exports = __webpack_exports__;
/******/ })()
;