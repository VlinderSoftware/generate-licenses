#!/usr/bin/env node

/**
 * Generate a CSV file of all npm dependencies with their licenses
 * Output format: Component Name, Version, License (SPDX ID), License URL
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('js-yaml');

const OUTPUT_CSV = path.join(process.cwd(), 'licenses/licenses.csv');
const OUTPUT_DIR = path.dirname(OUTPUT_CSV);
const OVERRIDES_FILE = path.join(process.cwd(), '.github/license-overrides.yml');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Load license overrides
let overrides = {};
if (fs.existsSync(OVERRIDES_FILE)) {
  try {
    const overridesContent = fs.readFileSync(OVERRIDES_FILE, 'utf8');
    const overridesData = yaml.load(overridesContent);
    if (overridesData && overridesData.overrides) {
      overrides = overridesData.overrides;
      console.log(`Loaded ${Object.keys(overrides).length} license override(s) from ${OVERRIDES_FILE}`);
    }
  } catch (err) {
    console.warn(`Warning: Failed to load license overrides: ${err.message}`);
  }
}

console.log('Generating licenses CSV...');

// Get all dependencies including nested ones
// Use --omit=peer to avoid peer dependency errors
let npmList;
try {
  npmList = execSync('npm list --json --all --long --omit=peer', {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
  });
} catch (err) {
  // npm list returns non-zero exit code even with valid output when there are warnings
  // So we capture the output from the error
  if (err.stdout) {
    npmList = err.stdout;
  } else {
    throw err;
  }
}

const dependencies = JSON.parse(npmList);

// Map to store unique packages (name@version)
const packages = new Map();

function extractPackages(deps, prefix = '') {
  if (!deps) return;
  
  for (const [name, info] of Object.entries(deps)) {
    const version = info.version;
    const key = `${name}@${version}`;
    
    if (!packages.has(key)) {
      // Get license info
      let license = info.license || 'UNKNOWN';
      let licenseUrl = '';
      
      // Check for override first
      if (overrides[key]) {
        const override = overrides[key];
        if (override.license) {
          license = override.license;
          console.log(`  ✓ Applied override for ${key}: ${license}`);
        }
        if (override.licenseUrl) {
          licenseUrl = override.licenseUrl;
        }
      }
      
      // If no override URL, try to get repository URL from package
      if (!licenseUrl) {
        if (info.resolved) {
          // For npm packages, construct a link to the package page
          licenseUrl = `https://www.npmjs.com/package/${name}/v/${version}`;
        } else if (info.repository) {
          if (typeof info.repository === 'string') {
            licenseUrl = info.repository;
          } else if (info.repository.url) {
            licenseUrl = info.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
          }
        }
      }
      
      packages.set(key, {
        name,
        version,
        license,
        licenseUrl,
      });
    }
    
    // Recursively process dependencies
    if (info.dependencies) {
      extractPackages(info.dependencies, `${prefix}${name} > `);
    }
  }
}

// Extract packages from dependencies and devDependencies
if (dependencies.dependencies) {
  extractPackages(dependencies.dependencies);
}

// Convert to array and sort by name
const sortedPackages = Array.from(packages.values()).sort((a, b) => 
  a.name.localeCompare(b.name)
);

// Generate CSV
const csvLines = ['Component Name,Version,License (SPDX ID),License URL'];

for (const pkg of sortedPackages) {
  // Escape CSV fields if they contain commas or quotes
  const escapeCsv = (str) => {
    if (!str) return '';
    const strValue = String(str);
    if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
      return `"${strValue.replace(/"/g, '""')}"`;
    }
    return strValue;
  };
  
  csvLines.push(
    `${escapeCsv(pkg.name)},${escapeCsv(pkg.version)},${escapeCsv(pkg.license)},${escapeCsv(pkg.licenseUrl)}`
  );
}

const csvContent = csvLines.join('\n');

// Write CSV file
fs.writeFileSync(OUTPUT_CSV, csvContent, 'utf8');

console.log(`✓ Generated licenses CSV with ${sortedPackages.length} packages`);
console.log(`  Output: ${OUTPUT_CSV}`);

// Generate a summary report
const licenseCounts = new Map();
const copyleftLicenses = [];

for (const pkg of sortedPackages) {
  const license = pkg.license;
  licenseCounts.set(license, (licenseCounts.get(license) || 0) + 1);
  
  // Check for copyleft licenses
  const copyleftPatterns = /GPL|AGPL|LGPL|MPL|EPL|CDDL|CPL/i;
  if (copyleftPatterns.test(license)) {
    copyleftLicenses.push({ name: pkg.name, version: pkg.version, license });
  }
}

// Sort licenses by count
const sortedLicenses = Array.from(licenseCounts.entries())
  .sort((a, b) => b[1] - a[1]);

console.log('\n📊 License Summary:');
console.log('===================');
for (const [license, count] of sortedLicenses) {
  console.log(`  ${license}: ${count}`);
}

if (copyleftLicenses.length > 0) {
  console.log('\n⚠️  COPYLEFT LICENSES DETECTED:');
  console.log('================================');
  for (const pkg of copyleftLicenses) {
    console.log(`  - ${pkg.name}@${pkg.version}: ${pkg.license}`);
  }
  console.log('\nPlease review these licenses carefully to ensure compliance.');
} else {
  console.log('\n✓ No copyleft licenses detected.');
}
