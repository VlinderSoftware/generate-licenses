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
    
    // Create a minimal package.json with real dependencies
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'lodash': '^4.17.21'
      },
      scripts: {
        'licenses:csv': 'node ../scripts/generate-licenses-csv.cjs',
        'licenses:download': 'node ../scripts/download-licenses.cjs',
        'licenses:html': 'python3 ../scripts/generate-licenses-html.py',
        'licenses:generate': 'npm run licenses:csv && npm run licenses:download && npm run licenses:html'
      }
    };
    
    fs.writeFileSync(
      path.join(testProjectDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    
    // Install dependencies
    execSync('npm install', { 
      cwd: testProjectDir,
      stdio: 'pipe' // Suppress output during tests
    });
  });
  
  afterAll(() => {
    // Clean up test project
    if (fs.existsSync(testProjectDir)) {
      execSync(`rm -rf "${testProjectDir}"`, { stdio: 'pipe' });
    }
  });

  describe('End-to-end license generation', () => {
    it('should generate CSV file with package information', () => {
      execSync('npm run licenses:csv', { 
        cwd: testProjectDir,
        stdio: 'pipe'
      });
      
      const csvFile = path.join(testProjectDir, 'licenses/licenses.csv');
      expect(fs.existsSync(csvFile)).toBe(true);
      
      const csvContent = fs.readFileSync(csvFile, 'utf8');
      expect(csvContent).toContain('Component Name,Version,License (SPDX ID),License URL');
      expect(csvContent).toContain('lodash');
      expect(csvContent).toContain('MIT');
    });

    it('should download license files', () => {
      // First generate CSV
      execSync('npm run licenses:csv', { 
        cwd: testProjectDir,
        stdio: 'pipe'
      });
      
      // Then download licenses
      execSync('npm run licenses:download', { 
        cwd: testProjectDir,
        stdio: 'pipe'
      });
      
      const textsDir = path.join(testProjectDir, 'licenses/texts');
      expect(fs.existsSync(textsDir)).toBe(true);
      
      const files = fs.readdirSync(textsDir);
      expect(files.length).toBeGreaterThan(0);
      
      // Check that at least one license file was downloaded
      const lodashLicenseFile = files.find(file => file.includes('lodash'));
      expect(lodashLicenseFile).toBeDefined();
    });

    it('should generate HTML report', () => {
      // Generate all prerequisites
      execSync('npm run licenses:csv', { 
        cwd: testProjectDir,
        stdio: 'pipe'
      });
      execSync('npm run licenses:download', { 
        cwd: testProjectDir,
        stdio: 'pipe'
      });
      
      // Generate HTML
      execSync('npm run licenses:html', { 
        cwd: testProjectDir,
        stdio: 'pipe'
      });
      
      const htmlFile = path.join(testProjectDir, 'public/licenses.html');
      expect(fs.existsSync(htmlFile)).toBe(true);
      
      const htmlContent = fs.readFileSync(htmlFile, 'utf8');
      expect(htmlContent).toContain('<!DOCTYPE html>');
      expect(htmlContent).toContain('Open Source Licenses');
      expect(htmlContent).toContain('lodash');
    });

    it('should run complete license generation pipeline', () => {
      execSync('npm run licenses:generate', { 
        cwd: testProjectDir,
        stdio: 'pipe'
      });
      
      // Verify all outputs exist
      expect(fs.existsSync(path.join(testProjectDir, 'licenses/licenses.csv'))).toBe(true);
      expect(fs.existsSync(path.join(testProjectDir, 'licenses/texts'))).toBe(true);
      expect(fs.existsSync(path.join(testProjectDir, 'public/licenses.html'))).toBe(true);
    });
  });

  describe('License override functionality', () => {
    it('should apply license overrides correctly', () => {
      // Create override file
      const githubDir = path.join(testProjectDir, '.github');
      if (!fs.existsSync(githubDir)) {
        fs.mkdirSync(githubDir, { recursive: true });
      }
      
      const overrides = {
        overrides: {
          'lodash@4.17.21': {
            license: 'MIT-OVERRIDE',
            licenseUrl: 'https://example.com/license',
            notes: 'Test override'
          }
        }
      };
      
      fs.writeFileSync(
        path.join(githubDir, 'license-overrides.yml'),
        `# Test overrides\noverrides:\n  lodash@4.17.21:\n    license: "MIT-OVERRIDE"\n    licenseUrl: "https://example.com/license"\n    notes: "Test override"`
      );
      
      execSync('npm run licenses:csv', { 
        cwd: testProjectDir,
        stdio: 'pipe'
      });
      
      const csvContent = fs.readFileSync(
        path.join(testProjectDir, 'licenses/licenses.csv'),
        'utf8'
      );
      
      expect(csvContent).toContain('MIT-OVERRIDE');
      expect(csvContent).toContain('https://example.com/license');
    });
  });

  describe('Performance and caching', () => {
    it('should use cache on subsequent runs', () => {
      // First run
      const start1 = Date.now();
      execSync('npm run licenses:download', { 
        cwd: testProjectDir,
        stdio: 'pipe'
      });
      const duration1 = Date.now() - start1;
      
      // Second run (should use cache)
      const start2 = Date.now();
      execSync('npm run licenses:download', { 
        cwd: testProjectDir,
        stdio: 'pipe'
      });
      const duration2 = Date.now() - start2;
      
      // Second run should be significantly faster due to caching
      expect(duration2).toBeLessThan(duration1);
      
      // Verify cache file exists
      expect(fs.existsSync(path.join(testProjectDir, 'licenses/cache.json'))).toBe(true);
    });
  });
});