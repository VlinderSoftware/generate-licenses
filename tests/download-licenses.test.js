const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Mock external dependencies
jest.mock('fs');
jest.mock('https');
jest.mock('child_process');

describe('download-licenses', () => {
  let consoleSpy;
  
  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('License downloading', () => {
    it('should download license files for packages', async () => {
      const mockNpmOutput = JSON.stringify({
        dependencies: {
          'test-package': {
            version: '1.0.0',
            resolved: 'https://registry.npmjs.org/test-package/-/test-package-1.0.0.tgz'
          }
        }
      });
      
      // Mock file system operations
      fs.existsSync.mockImplementation(filePath => {
        if (filePath.includes('licenses/texts')) return true;
        if (filePath.includes('cache.json')) return false;
        return false;
      });
      fs.mkdirSync.mockImplementation();
      fs.readFileSync.mockReturnValue('{}');
      fs.writeFileSync.mockImplementation();
      
      // Mock successful npm list
      execSync.mockReturnValue(mockNpmOutput);
      
      // Mock successful HTTPS download
      const mockResponse = {
        statusCode: 200,
        pipe: jest.fn(),
        on: jest.fn()
      };
      
      const mockFile = {
        close: jest.fn(),
        on: jest.fn()
      };
      
      fs.createWriteStream.mockReturnValue(mockFile);
      
      https.get.mockImplementation((url, options, callback) => {
        // Simulate successful download
        callback(mockResponse);
        return {
          on: jest.fn(),
          setTimeout: jest.fn()
        };
      });
      
      // Mock response.pipe to call file.on('finish')
      mockResponse.pipe.mockImplementation((file) => {
        setImmediate(() => file.on.mock.calls.find(call => call[0] === 'finish')[1]());
        return file;
      });
      
      require('../scripts/download-licenses.cjs');
      
      // Allow async operations to complete
      await new Promise(resolve => setImmediate(resolve));
      
      expect(https.get).toHaveBeenCalled();
      expect(fs.createWriteStream).toHaveBeenCalled();
    });

    it('should handle download failures gracefully', async () => {
      const mockNpmOutput = JSON.stringify({
        dependencies: {
          'test-package': {
            version: '1.0.0',
            resolved: 'https://registry.npmjs.org/test-package/-/test-package-1.0.0.tgz'
          }
        }
      });
      
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation();
      fs.readFileSync.mockReturnValue('{}');
      fs.writeFileSync.mockImplementation();
      execSync.mockReturnValue(mockNpmOutput);
      
      // Mock failed HTTPS request
      https.get.mockImplementation((url, options, callback) => {
        const mockResponse = { statusCode: 404 };
        callback(mockResponse);
        return {
          on: jest.fn(),
          setTimeout: jest.fn()
        };
      });
      
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      require('../scripts/download-licenses.cjs');
      
      await new Promise(resolve => setImmediate(resolve));
      
      errorSpy.mockRestore();
    });

    it('should use cache when available', () => {
      const mockNpmOutput = JSON.stringify({
        dependencies: {
          'cached-package': {
            version: '1.0.0',
            resolved: 'https://registry.npmjs.org/cached-package/-/cached-package-1.0.0.tgz'
          }
        }
      });
      
      const mockCache = {
        'cached-package@1.0.0': 'cached-package-1.0.0.txt'
      };
      
      fs.existsSync.mockImplementation(filePath => {
        if (filePath.includes('cache.json')) return true;
        if (filePath.includes('cached-package-1.0.0.txt')) return true;
        if (filePath.includes('licenses/texts')) return true;
        return false;
      });
      fs.mkdirSync.mockImplementation();
      fs.readFileSync.mockReturnValue(JSON.stringify(mockCache));
      fs.writeFileSync.mockImplementation();
      execSync.mockReturnValue(mockNpmOutput);
      
      require('../scripts/download-licenses.cjs');
      
      // Should not make HTTP requests for cached items
      expect(https.get).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle npm list failures', () => {
      execSync.mockImplementation(() => {
        throw new Error('npm list failed');
      });
      
      expect(() => require('../scripts/download-licenses.cjs')).toThrow();
    });

    it('should sanitize filenames properly', () => {
      const mockNpmOutput = JSON.stringify({
        dependencies: {
          '@scope/package-name': {
            version: '1.0.0-beta.1',
            resolved: 'https://registry.npmjs.org/@scope/package-name/-/package-name-1.0.0-beta.1.tgz'
          }
        }
      });
      
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation();
      fs.readFileSync.mockReturnValue('{}');
      fs.writeFileSync.mockImplementation();
      execSync.mockReturnValue(mockNpmOutput);
      
      require('../scripts/download-licenses.cjs');
      
      // Should create sanitized filename
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('_scope_package-name-1.0.0-beta.1.txt'),
        expect.any(String),
        'utf8'
      );
    });
  });
});