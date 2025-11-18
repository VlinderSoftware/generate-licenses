#!/usr/bin/env node
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 676:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const { Transform } = __nccwpck_require__(203)

const [cr] = Buffer.from('\r')
const [nl] = Buffer.from('\n')
const defaults = {
  escape: '"',
  headers: null,
  mapHeaders: ({ header }) => header,
  mapValues: ({ value }) => value,
  newline: '\n',
  quote: '"',
  raw: false,
  separator: ',',
  skipComments: false,
  skipLines: null,
  maxRowBytes: Number.MAX_SAFE_INTEGER,
  strict: false,
  outputByteOffset: false
}

class CsvParser extends Transform {
  constructor (opts = {}) {
    super({ objectMode: true, highWaterMark: 16 })

    if (Array.isArray(opts)) opts = { headers: opts }

    const options = Object.assign({}, defaults, opts)

    options.customNewline = options.newline !== defaults.newline

    for (const key of ['newline', 'quote', 'separator']) {
      if (typeof options[key] !== 'undefined') {
        ([options[key]] = Buffer.from(options[key]))
      }
    }

    // if escape is not defined on the passed options, use the end value of quote
    options.escape = (opts || {}).escape ? Buffer.from(options.escape)[0] : options.quote

    this.state = {
      empty: options.raw ? Buffer.alloc(0) : '',
      escaped: false,
      first: true,
      lineNumber: 0,
      previousEnd: 0,
      rowLength: 0,
      quoted: false
    }

    this._prev = null

    if (options.headers === false) {
      // enforce, as the column length check will fail if headers:false
      options.strict = false
    }

    if (options.headers || options.headers === false) {
      this.state.first = false
    }

    this.options = options
    this.headers = options.headers
    this.bytesRead = 0
  }

  parseCell (buffer, start, end) {
    const { escape, quote } = this.options
    // remove quotes from quoted cells
    if (buffer[start] === quote && buffer[end - 1] === quote) {
      start++
      end--
    }

    let y = start

    for (let i = start; i < end; i++) {
      // check for escape characters and skip them
      if (buffer[i] === escape && i + 1 < end && buffer[i + 1] === quote) {
        i++
      }

      if (y !== i) {
        buffer[y] = buffer[i]
      }
      y++
    }

    return this.parseValue(buffer, start, y)
  }

  parseLine (buffer, start, end) {
    const { customNewline, escape, mapHeaders, mapValues, quote, separator, skipComments, skipLines } = this.options

    end-- // trim newline
    if (!customNewline && buffer.length && buffer[end - 1] === cr) {
      end--
    }

    const comma = separator
    const cells = []
    let isQuoted = false
    let offset = start

    if (skipComments) {
      const char = typeof skipComments === 'string' ? skipComments : '#'
      if (buffer[start] === Buffer.from(char)[0]) {
        return
      }
    }

    const mapValue = (value) => {
      if (this.state.first) {
        return value
      }

      const index = cells.length
      const header = this.headers[index]

      return mapValues({ header, index, value })
    }

    for (let i = start; i < end; i++) {
      const isStartingQuote = !isQuoted && buffer[i] === quote
      const isEndingQuote = isQuoted && buffer[i] === quote && i + 1 <= end && buffer[i + 1] === comma
      const isEscape = isQuoted && buffer[i] === escape && i + 1 < end && buffer[i + 1] === quote

      if (isStartingQuote || isEndingQuote) {
        isQuoted = !isQuoted
        continue
      } else if (isEscape) {
        i++
        continue
      }

      if (buffer[i] === comma && !isQuoted) {
        let value = this.parseCell(buffer, offset, i)
        value = mapValue(value)
        cells.push(value)
        offset = i + 1
      }
    }

    if (offset < end) {
      let value = this.parseCell(buffer, offset, end)
      value = mapValue(value)
      cells.push(value)
    }

    if (buffer[end - 1] === comma) {
      cells.push(mapValue(this.state.empty))
    }

    const skip = skipLines && skipLines > this.state.lineNumber
    this.state.lineNumber++

    if (this.state.first && !skip) {
      this.state.first = false
      this.headers = cells.map((header, index) => mapHeaders({ header, index }))

      this.emit('headers', this.headers)
      return
    }

    if (!skip && this.options.strict && cells.length !== this.headers.length) {
      const e = new RangeError('Row length does not match headers')
      this.emit('error', e)
    } else {
      if (!skip) {
        const byteOffset = this.bytesRead - buffer.length + start
        this.writeRow(cells, byteOffset)
      }
    }
  }

  parseValue (buffer, start, end) {
    if (this.options.raw) {
      return buffer.slice(start, end)
    }

    return buffer.toString('utf-8', start, end)
  }

  writeRow (cells, byteOffset) {
    const headers = (this.headers === false) ? cells.map((value, index) => index) : this.headers

    const row = cells.reduce((o, cell, index) => {
      const header = headers[index]
      if (header === null) return o // skip columns
      if (header !== undefined) {
        o[header] = cell
      } else {
        o[`_${index}`] = cell
      }
      return o
    }, {})

    if (this.options.outputByteOffset) {
      this.push({ row, byteOffset })
    } else {
      this.push(row)
    }
  }

  _flush (cb) {
    if (this.state.escaped || !this._prev) return cb()
    this.parseLine(this._prev, this.state.previousEnd, this._prev.length + 1) // plus since online -1s
    cb()
  }

  _transform (data, enc, cb) {
    if (typeof data === 'string') {
      data = Buffer.from(data)
    }

    const { escape, quote } = this.options
    let start = 0
    let buffer = data
    this.bytesRead += data.byteLength

    if (this._prev) {
      start = this._prev.length
      buffer = Buffer.concat([this._prev, data])
      this._prev = null
    }

    const bufferLength = buffer.length

    for (let i = start; i < bufferLength; i++) {
      const chr = buffer[i]
      const nextChr = i + 1 < bufferLength ? buffer[i + 1] : null

      this.state.rowLength++
      if (this.state.rowLength > this.options.maxRowBytes) {
        return cb(new Error('Row exceeds the maximum size'))
      }

      if (!this.state.escaped && chr === escape && nextChr === quote && i !== start) {
        this.state.escaped = true
        continue
      } else if (chr === quote) {
        if (this.state.escaped) {
          this.state.escaped = false
          // non-escaped quote (quoting the cell)
        } else {
          this.state.quoted = !this.state.quoted
        }
        continue
      }

      if (!this.state.quoted) {
        if (this.state.first && !this.options.customNewline) {
          if (chr === nl) {
            this.options.newline = nl
          } else if (chr === cr) {
            if (nextChr !== nl) {
              this.options.newline = cr
            }
          }
        }

        if (chr === this.options.newline) {
          this.parseLine(buffer, this.state.previousEnd, i + 1)
          this.state.previousEnd = i + 1
          this.state.rowLength = 0
        }
      }
    }

    if (this.state.previousEnd === bufferLength) {
      this.state.previousEnd = 0
      return cb()
    }

    if (bufferLength - this.state.previousEnd < data.length) {
      this._prev = data
      this.state.previousEnd -= (bufferLength - data.length)
      return cb()
    }

    this._prev = buffer
    cb()
  }
}

module.exports = (opts) => new CsvParser(opts)


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

/***/ }),

/***/ 203:
/***/ ((module) => {

"use strict";
module.exports = require("stream");

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
 * Reads from licenses.csv to only download licenses for packages that will be included in the final report
 */

const fs = __nccwpck_require__(896);
const csv = __nccwpck_require__(676);
const path = __nccwpck_require__(928);
const https = __nccwpck_require__(692);

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

module.exports = __webpack_exports__;
/******/ })()
;