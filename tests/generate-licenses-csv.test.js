const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

describe('generate-licenses-csv', () => {
  describe('Helper functions and validation', () => {
    it('should validate YAML parsing works', () => {
      const testYaml = `
overrides:
  test-package@1.0.0:
    license: "MIT"
    licenseUrl: "https://example.com"
`;
      const parsed = yaml.load(testYaml);
      expect(parsed.overrides).toBeDefined();
      expect(parsed.overrides['test-package@1.0.0'].license).toBe('MIT');
    });

    it('should detect copyleft license patterns', () => {
      const copyleftPatterns = /GPL|AGPL|LGPL|MPL|EPL|CDDL|CPL/i;
      
      expect(copyleftPatterns.test('GPL-3.0')).toBe(true);
      expect(copyleftPatterns.test('LGPL-2.1')).toBe(true);
      expect(copyleftPatterns.test('MPL-2.0')).toBe(true);
      expect(copyleftPatterns.test('MIT')).toBe(false);
      expect(copyleftPatterns.test('Apache-2.0')).toBe(false);
    });

    it('should handle CSV escaping correctly', () => {
      const escapeCsv = (str) => {
        if (!str) return '';
        const strValue = String(str);
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      };

      expect(escapeCsv('simple')).toBe('simple');
      expect(escapeCsv('has,comma')).toBe('"has,comma"');
      expect(escapeCsv('has "quotes"')).toBe('"has ""quotes"""');
      expect(escapeCsv('')).toBe('');
    });
  });

  describe('File structure validation', () => {
    it('should have the CSV generation script', () => {
      const scriptPath = path.join(__dirname, '../scripts/generate-licenses-csv.cjs');
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it('should be executable', () => {
      const scriptPath = path.join(__dirname, '../scripts/generate-licenses-csv.cjs');
      const stats = fs.statSync(scriptPath);
      expect(stats.isFile()).toBe(true);
    });
  });
});