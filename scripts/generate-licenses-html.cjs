#!/usr/bin/env node

/**
 * Generate HTML page from licenses CSV and downloaded license files
 * Uses Nunjucks template to create a styled page matching the app's CSS
 */

const fs = require('fs');
const path = require('path');
const nunjucks = require('nunjucks');

// Paths
const SCRIPT_DIR = __dirname;
const PACKAGE_DIR = path.dirname(SCRIPT_DIR); // One level up from scripts/
const WORKING_DIR = process.cwd();
const CSV_FILE = path.join(WORKING_DIR, 'licenses', 'licenses.csv');
const LICENSES_DIR = path.join(WORKING_DIR, 'licenses', 'texts');
const OUTPUT_FILE = path.join(WORKING_DIR, 'public', 'licenses.html');

// Template resolution order:
// 1. User's local template (working directory)
// 2. Package template (installed with action)
// 3. Legacy template (for backward compatibility)
const LOCAL_TEMPLATE = path.join(WORKING_DIR, 'licenses.html.j2');
const PACKAGE_TEMPLATE = path.join(PACKAGE_DIR, 'templates', 'licenses.html.j2');
const LEGACY_TEMPLATE = path.join(SCRIPT_DIR, 'licenses.html.j2');

function findTemplate() {
    /**
     * Find the template file, prioritizing user's local template
     */
    if (fs.existsSync(LOCAL_TEMPLATE)) {
        console.log(`Using local template: ${LOCAL_TEMPLATE}`);
        return LOCAL_TEMPLATE;
    } else if (fs.existsSync(PACKAGE_TEMPLATE)) {
        console.log(`Using package template: ${PACKAGE_TEMPLATE}`);
        return PACKAGE_TEMPLATE;
    } else if (fs.existsSync(LEGACY_TEMPLATE)) {
        console.log(`Using legacy template: ${LEGACY_TEMPLATE}`);
        return LEGACY_TEMPLATE;
    } else {
        throw new Error(
            `No template found. Searched:\n` +
            `  1. Local: ${LOCAL_TEMPLATE}\n` +
            `  2. Package: ${PACKAGE_TEMPLATE}\n` +
            `  3. Legacy: ${LEGACY_TEMPLATE}\n` +
            `\nTo customize the template, copy the default template to your project root:\n` +
            `  cp ${PACKAGE_TEMPLATE} ${LOCAL_TEMPLATE}`
        );
    }
}

function sanitizeFilename(name, version) {
    /**
     * Create sanitized filename matching download script
     */
    function sanitize(s) {
        return s.replace(/[^a-zA-Z0-9.-]/g, '_');
    }
    return `${sanitize(name)}-${sanitize(version)}.txt`;
}

function loadLicenses() {
    /**
     * Load license data from CSV
     */
    const licenses = [];
    
    if (!fs.existsSync(CSV_FILE)) {
        console.error(`Error: CSV file not found: ${CSV_FILE}`);
        process.exit(1);
    }
    
    const csvContent = fs.readFileSync(CSV_FILE, 'utf-8');
    const lines = csvContent.split('\n');
    
    if (lines.length < 2) {
        console.error('Error: CSV file appears to be empty or malformed');
        process.exit(1);
    }
    
    // Parse CSV header
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Simple CSV parsing - handles basic quoted fields
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim()); // Add the last value
        
        // Create row object
        const row = {};
        headers.forEach((header, index) => {
            row[header] = (values[index] || '').replace(/^"|"$/g, '');
        });
        
        const name = row['Component Name'];
        const version = row['Version'];
        const licenseId = row['License (SPDX ID)'];
        const licenseUrl = row['License URL'];
        
        if (!name) continue; // Skip empty rows
        
        // Try to load license text
        const licenseFilename = sanitizeFilename(name, version);
        const licensePath = path.join(LICENSES_DIR, licenseFilename);
        
        let licenseText = null;
        if (fs.existsSync(licensePath)) {
            try {
                licenseText = fs.readFileSync(licensePath, 'utf-8');
            } catch (error) {
                console.warn(`Warning: Could not read license file ${licensePath}: ${error.message}`);
            }
        }
        
        licenses.push({
            name: name,
            version: version,
            license: licenseId,
            license_url: licenseUrl,
            license_text: licenseText,
        });
    }
    
    return licenses;
}

function generateHtml() {
    /**
     * Generate HTML from template
     */
    console.log('Generating licenses HTML page...');
    
    // Load licenses
    const licenses = loadLicenses();
    
    // Count licenses
    const licenseCounts = {};
    for (const lic of licenses) {
        const licenseId = lic.license;
        licenseCounts[licenseId] = (licenseCounts[licenseId] || 0) + 1;
    }
    
    // Sort by count
    const sortedLicenseCounts = Object.entries(licenseCounts)
        .sort((a, b) => b[1] - a[1]);
    
    // Find and setup template
    const templateFile = findTemplate();
    const templateDir = path.dirname(templateFile);
    const templateName = path.basename(templateFile);
    
    // Configure Nunjucks to be compatible with Jinja2
    nunjucks.configure(templateDir, {
        autoescape: true,
        trimBlocks: true,
        lstripBlocks: true
    });
    
    // Render template
    const html = nunjucks.render(templateName, {
        licenses: licenses,
        license_counts: sortedLicenseCounts,
        total_count: licenses.length,
    });
    
    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write output
    fs.writeFileSync(OUTPUT_FILE, html, 'utf-8');
    
    console.log(`✓ Generated licenses page: ${OUTPUT_FILE}`);
    console.log(`  Total packages: ${licenses.length}`);
    console.log(`  Unique licenses: ${Object.keys(licenseCounts).length}`);
}

if (require.main === module) {
    generateHtml();
}

module.exports = { generateHtml, loadLicenses, sanitizeFilename };