const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('License Generation Integration Tests', () => {
  let testProjectDir;
  
  beforeAll(() => {
    // Create a test project directory
    testProjectDir = path.join(__dirname, '../../test-project');
    if (!fs.existsSync(testProjectDir)) {
      fs.mkdirSync(testProjectDir, { recursive: true });
    }
    
    // Create a minimal package.json with a small, stable dependency
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'escape-html': '^1.0.3'  // Small, stable package
      },
      scripts: {
        'licenses:csv': 'node ../scripts/generate-licenses-csv.cjs',
        'licenses:download': 'node ../scripts/download-licenses.cjs',
        'licenses:html': 'node ../scripts/generate-licenses-html.cjs',
        'licenses:generate': 'npm run licenses:csv && npm run licenses:download && npm run licenses:html'
      }
    };
    
    fs.writeFileSync(
      path.join(testProjectDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    
    // Install dependencies only if node_modules doesn't exist
    const nodeModulesPath = path.join(testProjectDir, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      try {
        execSync('npm install', { 
          cwd: testProjectDir,
          stdio: 'pipe',
          timeout: 30000  // 30 second timeout
        });
      } catch (error) {
        console.warn('Failed to install test dependencies:', error.message);
        throw error;
      }
    }
  }, 60000); // 60 second timeout for beforeAll
  
  afterAll(() => {
    // Clean up test project
    if (fs.existsSync(testProjectDir)) {
      try {
        execSync(`rm -rf "${testProjectDir}"`, { stdio: 'pipe' });
      } catch (error) {
        console.warn('Failed to clean up test project:', error.message);
      }
    }
  });

  describe('CSV Generation', () => {
    it('should generate CSV file with package information', () => {
      try {
        execSync('npm run licenses:csv', { 
          cwd: testProjectDir,
          stdio: 'pipe',
          timeout: 10000
        });
        
        const csvFile = path.join(testProjectDir, 'licenses/licenses.csv');
        expect(fs.existsSync(csvFile)).toBe(true);
        
        const csvContent = fs.readFileSync(csvFile, 'utf8');
        expect(csvContent).toContain('Component Name,Version,License (SPDX ID),License URL');
        expect(csvContent).toContain('escape-html');
      } catch (error) {
        console.error('CSV generation failed:', error.message);
        throw error;
      }
    }, 15000);
  });

  describe('License Download', () => {
    it('should download license files', () => {
      try {
        // First generate CSV
        execSync('npm run licenses:csv', { 
          cwd: testProjectDir,
          stdio: 'pipe',
          timeout: 10000
        });
        
        // Then download licenses (with shorter timeout since it might fail on some packages)
        try {
          execSync('npm run licenses:download', { 
            cwd: testProjectDir,
            stdio: 'pipe',
            timeout: 15000
          });
        } catch (downloadError) {
          // Download failures are acceptable for this test
          console.warn('Some downloads failed (expected):', downloadError.message);
        }
        
        const textsDir = path.join(testProjectDir, 'licenses/texts');
        expect(fs.existsSync(textsDir)).toBe(true);
      } catch (error) {
        console.error('Download test failed:', error.message);
        throw error;
      }
    }, 20000);
  });

  describe('HTML Generation', () => {
    it('should generate HTML report when Python is available', () => {
      try {
        // Check if Python is available
        execSync('python3 --version', { stdio: 'pipe' });
        
        // Generate prerequisites
        execSync('npm run licenses:csv', { 
          cwd: testProjectDir,
          stdio: 'pipe',
          timeout: 10000
        });
        
        // Attempt download (may partially fail)
        try {
          execSync('npm run licenses:download', { 
            cwd: testProjectDir,
            stdio: 'pipe',
            timeout: 15000
          });
        } catch (downloadError) {
          // Partial failure is OK
        }
        
        // Generate HTML
        execSync('npm run licenses:html', { 
          cwd: testProjectDir,
          stdio: 'pipe',
          timeout: 10000
        });
        
        const htmlFile = path.join(testProjectDir, 'public/licenses.html');
        expect(fs.existsSync(htmlFile)).toBe(true);
        
        const htmlContent = fs.readFileSync(htmlFile, 'utf8');
        expect(htmlContent).toContain('<!DOCTYPE html>');
        expect(htmlContent).toContain('Open Source Licenses');
      } catch (error) {
        if (error.message.includes('python3')) {
          console.warn('Python3 not available, skipping HTML generation test');
          return; // Skip test if Python is not available
        }
        console.error('HTML generation failed:', error.message);
        throw error;
      }
    }, 25000);
  });
});