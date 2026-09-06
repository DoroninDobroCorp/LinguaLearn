import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const assetsDir = path.join(distDir, 'assets');
const distSwFile = path.join(distDir, 'sw.js');
const publicSwFile = path.join(rootDir, 'public', 'sw.js');

if (!fs.existsSync(assetsDir)) {
  console.error('[inject-sw-assets] dist/assets directory not found! Run vite build first.');
  process.exit(1);
}

// Find all compiled asset files
const assetFiles = fs.readdirSync(assetsDir)
  .filter(file => !file.startsWith('.') && !file.endsWith('.map'))
  .map(file => `/spanish/assets/${file}`);

console.log(`[inject-sw-assets] Found ${assetFiles.length} built assets in dist/assets:`);
assetFiles.forEach(f => console.log('  -', f));

const versionStamp = `spanish-pwa-v12-offline-transit-${Date.now()}`;

function updateSwContent(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[inject-sw-assets] ${filePath} not found, skipping.`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // Replace CACHE_VERSION
  content = content.replace(
    /const CACHE_VERSION = ".*?";/,
    `const CACHE_VERSION = "${versionStamp}";`
  );

  // Replace or inject PRECACHE_ASSETS
  const baseAssets = [
    "/spanish/",
    "/spanish/index.html",
    "/spanish/exercises",
    "/spanish/vocabulary",
    "/spanish/curriculum",
    "/spanish/manifest.json",
    "/spanish/manifest.webmanifest",
    "/spanish/pwa-icon.svg",
    "/spanish/apple-touch-icon.png",
    "/spanish/pwa-192.png",
    "/spanish/pwa-512.png",
    "/spanish/a1_first_18_offline_pack_100.json"
  ];

  const allAssets = Array.from(new Set([...baseAssets, ...assetFiles]));
  const formattedAssets = JSON.stringify(allAssets, null, 2);

  content = content.replace(
    /const PRECACHE_ASSETS = \[[\s\S]*?\];/,
    `const PRECACHE_ASSETS = ${formattedAssets};`
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`[inject-sw-assets] Successfully updated ${path.basename(filePath)} with ${allAssets.length} precached assets.`);
}

updateSwContent(distSwFile);
updateSwContent(publicSwFile);
console.log('[inject-sw-assets] Completed successfully.');
