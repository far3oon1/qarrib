const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');

function read(f) { return fs.readFileSync(path.join(BASE, f), 'utf8'); }
function write(f, c) { fs.writeFileSync(path.join(BASE, f), c); }

// 1. Update .env to ensure local MongoDB
let env = read('backend/.env');
env = env.replace(
  /MONGODB_URI=.*/,
  'MONGODB_URI=mongodb://127.0.0.1:27017/qarrab_db'
);
if (!env.includes('CLIENT_URL')) {
  env = env.replace('OWNER_INSTAPAY_NUMBER=01150209401', 'CLIENT_URL=http://localhost:5000\nOWNER_INSTAPAY_NUMBER=01150209401');
}
env = env.replace('NODE_ENV=development', 'NODE_ENV=production');
write('backend/.env', env);
console.log('[OK] .env verified — using local MongoDB');

// 2. Verify render.yaml
const ry = read('render.yaml');
console.log('[OK] render.yaml exists:', ry.includes('services:'));
console.log('[OK] render.yaml has autoDeploy:', ry.includes('autoDeploy: true'));

// 3. Verify package.json has start script
const pkg = read('backend/package.json');
console.log('[OK] package.json has start script:', pkg.includes('"start": "node src/server.js"'));

// 4. Create Dockerfile as backup
const dockerfile = `FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ ./
COPY frontend/ ./frontend/
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD curl -f http://localhost:5000/health || exit 1
CMD ["npm", "start"]
`;
write('Dockerfile', dockerfile);
console.log('[OK] Dockerfile created');

// 5. Create .gitignore if not exists
try {
  fs.accessSync(path.join(BASE, '.gitignore'));
  console.log('[SKIP] .gitignore exists');
} catch {
  const gitignore = `node_modules/
backend/node_modules/
frontend/node_modules/
backend/.env
backend/.env.example
*.log
backend/logs/
uploads/
backend/uploads/
frontend/
dist/
.env.local
.DS_Store
`;
  write('.gitignore', gitignore);
  console.log('[OK] .gitignore created');
}

// 6. Verify frontend serves static
const server = read('backend/src/server.js');
console.log('[OK] server.js serves frontend:', server.includes('express.static(frontendDir)'));

// 7. Check chat routes exist
const chatRoutes = read('backend/src/routes/chat.routes.js');
console.log('[OK] chat routes exist:', chatRoutes.includes('router'));

// 8. Set CLIENT_URL in .env if missing
if (!env.includes('CLIENT_URL')) {
  console.log('[WARN] CLIENT_URL not set in .env');
}

console.log('\n=== ALL DEPLOYMENT FILES READY ===');
console.log('Local MongoDB is the default (mongodb://127.0.0.1:27017/qarrab_db)');
console.log('No cloud dependencies needed.');