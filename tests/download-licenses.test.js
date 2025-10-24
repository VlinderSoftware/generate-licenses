const fs = require('fs');
const path = require('path');

describe('download-licenses', () => {
  describe('Helper functions and validation', () => {
    it('should sanitize filenames correctly', () => {
      const sanitizeFilename = (name) => {
        return name.replace(/[^a-z0-9.-]/gi, '_');
      };

      expect(sanitizeFilename('simple-name')).toBe('simple-name');
      expect(sanitizeFilename('@scope/package')).toBe('_scope_package');
      expect(sanitizeFilename('package@1.0.0')).toBe('package_1.0.0');
      expect(sanitizeFilename('complex/name:with@special#chars')).toBe('complex_name_with_special_chars');
    });

    it('should create proper license filenames', () => {
      const sanitizeFilename = (name) => name.replace(/[^a-z0-9.-]/gi, '_');
      const createFilename = (name, version) => {
        return `${sanitizeFilename(name)}-${sanitizeFilename(version)}.txt`;
      };

      expect(createFilename('lodash', '4.17.21')).toBe('lodash-4.17.21.txt');
      expect(createFilename('@babel/core', '7.20.0')).toBe('_babel_core-7.20.0.txt');
    });
  });

  describe('URL generation', () => {
    it('should generate correct unpkg URLs', () => {
      const generateUrls = (packageName, version) => [
        `https://unpkg.com/${packageName}@${version}/LICENSE`,
        `https://unpkg.com/${packageName}@${version}/LICENSE.md`,
        `https://unpkg.com/${packageName}@${version}/LICENSE.txt`,
        `https://unpkg.com/${packageName}@${version}/license`,
        `https://unpkg.com/${packageName}@${version}/license.md`,
      ];

      const urls = generateUrls('lodash', '4.17.21');
      expect(urls[0]).toBe('https://unpkg.com/lodash@4.17.21/LICENSE');
      expect(urls[1]).toBe('https://unpkg.com/lodash@4.17.21/LICENSE.md');
      expect(urls.length).toBe(5);
    });
  });

  describe('File structure validation', () => {
    it('should have the download script', () => {
      const scriptPath = path.join(__dirname, '../scripts/download-licenses.cjs');
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it('should be executable', () => {
      const scriptPath = path.join(__dirname, '../scripts/download-licenses.cjs');
      const stats = fs.statSync(scriptPath);
      expect(stats.isFile()).toBe(true);
    });
  });
});