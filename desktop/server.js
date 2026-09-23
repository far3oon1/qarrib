const path = require('path');
const server = require(path.join(__dirname, '..', 'backend', 'src', 'server'));

console.log('Qarrab Desktop Application');
console.log('Version:', require(path.resolve(__dirname, '..', 'package.json')).version);
console.log('Server running as desktop app');
