const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Building Mailguard...');

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// Full path for the app
const appName = 'Mailguard';
const platform = process.platform === 'win32' ? 'win32' : 'linux';
const arch = 'x64';

console.log(`Packaging for ${platform}-${arch}...`);

try {
  execSync(`npx electron-packager . ${appName} --platform=${platform} --arch=${arch} --out=dist --overwrite`, { stdio: 'inherit' });
  console.log('Build complete! Check the dist/ folder.');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
