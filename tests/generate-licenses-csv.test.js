const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('js-yaml');

// Mock external dependencies
jest.mock('child_process');
jest.mock('fs');
jest.mock('js-yaml');

describe('generate-licenses-csv', () => {
  let originalEnv;
  let consoleSpy;
  
  beforeEach(() => {
    originalEnv = process.env;
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    process.env = originalEnv;
    consoleSpy.mockRestore();
  });

  describe('CSV generation', () => {
    it('should generate CSV with basic package information', () => {
      // Mock npm list output
      const mockNpmOutput = JSON.stringify({
        dependencies: {
          'test-package': {
            version: '1.0.0',
            license: 'MIT',
            resolved: 'https://registry.npmjs.org/test-package/-/test-package-1.0.0.tgz'
          }
        }
      });
      
      execSync.mockReturnValue(mockNpmOutput);
      fs.existsSync.mockReturnValue(false); // No overrides file
      fs.mkdirSync.mockImplementation();
      fs.writeFileSync.mockImplementation();
      
      // Require the script (this will execute it)
      require('../scripts/generate-licenses-csv.cjs');
      
      // Verify CSV was written
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('licenses.csv'),
        expect.stringContaining('Component Name,Version,License (SPDX ID),License URL'),
        'utf8'
      );
    });

    it('should apply license overrides when available', () => {
      const mockNpmOutput = JSON.stringify({
        dependencies: {
          'unknown-package': {
            version: '1.0.0',
            license: 'UNKNOWN'
          }
        }
      });
      
      const mockOverrides = {
        overrides: {
          'unknown-package@1.0.0': {
            license: 'MIT',
            licenseUrl: 'https://example.com/license'
          }
        }
      };
      
      execSync.mockReturnValue(mockNpmOutput);
      fs.existsSync.mockImplementation(filePath => 
        filePath.includes('license-overrides.yml')
      );
      fs.readFileSync.mockReturnValue('mock yaml content');
      yaml.load.mockReturnValue(mockOverrides);
      fs.mkdirSync.mockImplementation();
      fs.writeFileSync.mockImplementation();
      
      require('../scripts/generate-licenses-csv.cjs');
      
      expect(yaml.load).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Applied override for unknown-package@1.0.0: MIT')
      );
    });

    it('should handle npm list errors gracefully', () => {
      const mockError = new Error('npm list failed');
      mockError.stdout = JSON.stringify({
        dependencies: { 'test-package': { version: '1.0.0', license: 'MIT' } }
      });
      
      execSync.mockImplementation(() => { throw mockError; });
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation();
      fs.writeFileSync.mockImplementation();
      
      expect(() => require('../scripts/generate-licenses-csv.cjs')).not.toThrow();
    });

    it('should detect copyleft licenses', () => {
      const mockNpmOutput = JSON.stringify({
        dependencies: {
          'gpl-package': {
            version: '1.0.0',
            license: 'GPL-3.0'
          },
          'mit-package': {
            version: '1.0.0',
            license: 'MIT'
          }
        }
      });
      
      execSync.mockReturnValue(mockNpmOutput);
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation();
      fs.writeFileSync.mockImplementation();
      
      require('../scripts/generate-licenses-csv.cjs');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('COPYLEFT LICENSES DETECTED')
      );
    });
  });

  describe('Error handling', () => {
    it('should handle missing override file gracefully', () => {
      const mockNpmOutput = JSON.stringify({
        dependencies: {
          'test-package': { version: '1.0.0', license: 'MIT' }
        }
      });
      
      execSync.mockReturnValue(mockNpmOutput);
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation();
      fs.writeFileSync.mockImplementation();
      
      expect(() => require('../scripts/generate-licenses-csv.cjs')).not.toThrow();
    });

    it('should handle invalid YAML in overrides file', () => {
      const mockNpmOutput = JSON.stringify({
        dependencies: {
          'test-package': { version: '1.0.0', license: 'MIT' }
        }
      });
      
      execSync.mockReturnValue(mockNpmOutput);
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid yaml content');
      yaml.load.mockImplementation(() => { throw new Error('Invalid YAML'); });
      fs.mkdirSync.mockImplementation();
      fs.writeFileSync.mockImplementation();
      
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      require('../scripts/generate-licenses-csv.cjs');
      
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load license overrides')
      );
      
      warnSpy.mockRestore();
    });
  });
});