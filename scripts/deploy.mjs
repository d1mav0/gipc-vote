import archiver from 'archiver';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const APP = 'gipc-vote';
const RG  = 'rg-gipc-bookroom';

// 1. Build
console.log('Building…');
execSync('npm run build', { stdio: 'inherit' });

// 2. Copy .next/static into standalone output
const staticSrc  = path.resolve('.next/static');
const staticDest = path.resolve(`.next/standalone/${APP}/.next/static`);
console.log('Copying .next/static…');
fs.cpSync(staticSrc, staticDest, { recursive: true });

// 3. Zip standalone output
console.log('Creating deploy.zip…');
await new Promise((resolve, reject) => {
  const out = fs.createWriteStream('deploy.zip');
  const arc = archiver('zip', { zlib: { level: 9 } });
  arc.pipe(out);
  arc.directory(`.next/standalone/${APP}/`, false);
  out.on('close', resolve);
  arc.on('error', reject);
  arc.finalize();
});
console.log(`deploy.zip: ${(fs.statSync('deploy.zip').size / 1024 / 1024).toFixed(1)} MB`);

// 4. Deploy
console.log('Deploying to Azure…');
execSync(
  `az webapp deploy --resource-group ${RG} --name ${APP} --src-path deploy.zip --type zip --restart true`,
  { stdio: 'inherit' }
);
console.log('Done. https://gipc-vote.azurewebsites.net');
