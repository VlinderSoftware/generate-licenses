// Jest setup file
const fs = require('fs');
const path = require('path');

// Create test directories if they don't exist
const testDirs = [
  path.join(__dirname, '../licenses'),
  path.join(__dirname, '../licenses/texts'),
  path.join(__dirname, '../public'),
  path.join(__dirname, '../.github')
];

beforeAll(() => {
  testDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
});

// Clean up test files after each test
afterEach(() => {
  const testFiles = [
    path.join(__dirname, '../licenses/licenses.csv'),
    path.join(__dirname, '../licenses/cache.json'),
    path.join(__dirname, '../public/licenses.html')
  ];
  
  testFiles.forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });
  
  // Clean up licenses/texts directory
  const textsDir = path.join(__dirname, '../licenses/texts');
  if (fs.existsSync(textsDir)) {
    const files = fs.readdirSync(textsDir);
    files.forEach(file => {
      fs.unlinkSync(path.join(textsDir, file));
    });
  }
});