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
// Look for overrides file in multiple locations (most specific to least specific)
const findOverridesFile = () => {
  const possiblePaths = [
    path.join(process.cwd(), 'license-overrides.yml'),           // Working directory
    path.join(process.cwd(), '.github/license-overrides.yml'),  // Working directory .github
    path.join(process.cwd(), 'licenses/overrides.yml'),         // Working directory licenses folder
  ];
  
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  
  return null;
};

const OVERRIDES_FILE = findOverridesFile();

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Load license overrides
let overrides = {};
if (OVERRIDES_FILE && fs.existsSync(OVERRIDES_FILE)) {
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
} else {
  console.log('No license overrides file found. Checked locations:');
  console.log('  - license-overrides.yml (working directory)');
  console.log('  - .github/license-overrides.yml (working directory)');
  console.log('  - licenses/overrides.yml (working directory)');
}

console.log('Generating licenses CSV...');

// Read package.json to determine production vs dev dependencies
let packageJson = {};
let productionDeps = new Set();
if (process.env.PRODUCTION_ONLY === 'true') {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Collect all production dependencies (including nested ones)
    const collectProductionDeps = (deps) => {
      if (!deps) return;
      for (const dep of Object.keys(deps)) {
        productionDeps.add(dep);
      }
    };
    
    collectProductionDeps(packageJson.dependencies);
    // Note: We intentionally don't add devDependencies to productionDeps
    
    console.log(`Production-only mode: filtering to ${productionDeps.size} direct production dependencies`);
  } catch (err) {
    console.warn('Warning: Could not read package.json for production-only mode, falling back to full scan');
  }
}

// Get all dependencies including nested ones
// Use --omit=peer to avoid peer dependency errors  
let npmList;
try {
  npmList = execSync(`npm list --json --all --long --omit=peer`, {
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

// Extract packages from dependencies
if (dependencies.dependencies) {
  if (process.env.PRODUCTION_ONLY === 'true' && productionDeps.size > 0) {
    // Only extract packages that are in the production dependency tree
    console.log('Production-only mode: filtering dependency tree...');
    
    // Create a filtered dependencies object with only production dependencies
    const filteredDeps = {};
    for (const [name, info] of Object.entries(dependencies.dependencies)) {
      if (productionDeps.has(name)) {
        filteredDeps[name] = info;
      }
    }
    
    extractPackages(filteredDeps);
  } else {
    extractPackages(dependencies.dependencies);
  }
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
const unknownLicenses = [];

for (const pkg of sortedPackages) {
  const license = pkg.license;
  licenseCounts.set(license, (licenseCounts.get(license) || 0) + 1);
  
  // Check for unknown licenses
  if (license === 'UNKNOWN' || license === '' || !license) {
    unknownLicenses.push({ name: pkg.name, version: pkg.version, license: license || 'UNKNOWN' });
  }
  
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

// Track if we should fail the build
let shouldFail = false;

// Check for unknown licenses
if (unknownLicenses.length > 0) {
  console.log('\n⚠️  UNKNOWN LICENSES DETECTED:');
  console.log('===============================');
  for (const pkg of unknownLicenses) {
    console.log(`  - ${pkg.name}@${pkg.version}: ${pkg.license}`);
  }
  console.log('\nPlease add license information for these packages to license overrides.');
  
  if (process.env.FAIL_ON_UNKNOWN === 'true') {
    console.error('\n❌ Build will fail due to unknown licenses detected.');
    shouldFail = true;
  }
} else {
  console.log('\n✓ No unknown licenses detected.');
}

// Check for copyleft licenses
if (copyleftLicenses.length > 0) {
  console.log('\n⚠️  COPYLEFT LICENSES DETECTED:');
  console.log('================================');
  for (const pkg of copyleftLicenses) {
    console.log(`  - ${pkg.name}@${pkg.version}: ${pkg.license}`);
  }
  console.log('\nPlease review these licenses carefully to ensure compliance.');
  
  if (process.env.FAIL_ON_COPYLEFT === 'true') {
    console.error('\n❌ Build will fail due to copyleft licenses detected.');
    shouldFail = true;
  }
} else {
  console.log('\n✓ No copyleft licenses detected.');
}

// Exit with error if any failure conditions were met
if (shouldFail) {
  console.error('\n❌ Build failed due to license policy violations.');
  console.error('   Either remove these dependencies or add them to license overrides.');
  process.exit(1);
}
