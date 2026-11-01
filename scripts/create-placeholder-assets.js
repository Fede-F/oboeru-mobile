import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.resolve(rootDir, 'assets');
const publicDir = path.resolve(rootDir, 'public');

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Opción A Oficial: "Google Translate Flip" — Oboeru (覚える)
const iconSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" rx="232" fill="#0d131a"/>

  <!-- 1. Tarjeta Trasera (Verde Oliva Mate) -->
  <rect x="356" y="324" width="484" height="484" rx="92" fill="#3b4d43"/>

  <!-- Elementos de la Tarjeta Trasera -->
  <circle cx="728" cy="436" r="36" fill="#fbbf24"/>
  <rect x="520" y="612" width="232" height="38" rx="19" fill="#a7f3d0"/>
  <rect x="520" y="680" width="148" height="38" rx="19" fill="#6ee7b7" opacity="0.65"/>

  <!-- 2. Sombra de Proyección a 45° sobre la Tarjeta Trasera (Estilo Google Material) -->
  <path d="M356 684 L676 324 H700 V580 L480 808 H448 C397.2 808 356 766.8 356 716 Z" fill="#1e2823" opacity="0.48"/>

  <!-- 3. Tarjeta Frontal (Verde Menta Oboeru #a7f3d0) -->
  <rect x="184" y="196" width="492" height="492" rx="92" fill="#a7f3d0"/>

  <!-- Glifo Geométrico en Tarjeta Frontal: Corona y ventana de「覚」(Oboeru) -->
  <rect x="322" y="294" width="38" height="58" rx="19" fill="#101815"/>
  <rect x="411" y="276" width="38" height="76" rx="19" fill="#101815"/>
  <rect x="500" y="294" width="38" height="58" rx="19" fill="#101815"/>
  <rect x="284" y="344" width="292" height="38" rx="19" fill="#101815"/>
  <rect x="330" y="412" width="200" height="152" rx="38" fill="none" stroke="#101815" stroke-width="38"/>
  <line x1="348" y1="488" x2="512" y2="488" stroke="#101815" stroke-width="34" stroke-linecap="round"/>
</svg>
`;

// Foreground para Android Adaptive Icon (escalado dentro de la zona segura central 66%)
const foregroundSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(512, 512) scale(0.72) translate(-512, -502)">
    <rect x="356" y="324" width="484" height="484" rx="92" fill="#3b4d43"/>
    <circle cx="728" cy="436" r="36" fill="#fbbf24"/>
    <rect x="520" y="612" width="232" height="38" rx="19" fill="#a7f3d0"/>
    <rect x="520" y="680" width="148" height="38" rx="19" fill="#6ee7b7" opacity="0.65"/>
    <path d="M356 684 L676 324 H700 V580 L480 808 H448 C397.2 808 356 766.8 356 716 Z" fill="#1e2823" opacity="0.48"/>
    <rect x="184" y="196" width="492" height="492" rx="92" fill="#a7f3d0"/>
    <rect x="322" y="294" width="38" height="58" rx="19" fill="#101815"/>
    <rect x="411" y="276" width="38" height="76" rx="19" fill="#101815"/>
    <rect x="500" y="294" width="38" height="58" rx="19" fill="#101815"/>
    <rect x="284" y="344" width="292" height="38" rx="19" fill="#101815"/>
    <rect x="330" y="412" width="200" height="152" rx="38" fill="none" stroke="#101815" stroke-width="38"/>
    <line x1="348" y1="488" x2="512" y2="488" stroke="#101815" stroke-width="34" stroke-linecap="round"/>
  </g>
</svg>
`;

const backgroundSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#0d131a" />
</svg>
`;

const splashDarkSvg = `
<svg width="2732" height="2732" viewBox="0 0 2732 2732" xmlns="http://www.w3.org/2000/svg">
  <rect width="2732" height="2732" fill="#090d14" />
  <g transform="translate(1366, 1366) scale(0.72) translate(-512, -502)">
    <rect x="356" y="324" width="484" height="484" rx="92" fill="#3b4d43"/>
    <circle cx="728" cy="436" r="36" fill="#fbbf24"/>
    <rect x="520" y="612" width="232" height="38" rx="19" fill="#a7f3d0"/>
    <rect x="520" y="680" width="148" height="38" rx="19" fill="#6ee7b7" opacity="0.65"/>
    <path d="M356 684 L676 324 H700 V580 L480 808 H448 C397.2 808 356 766.8 356 716 Z" fill="#1e2823" opacity="0.48"/>
    <rect x="184" y="196" width="492" height="492" rx="92" fill="#a7f3d0"/>
    <rect x="322" y="294" width="38" height="58" rx="19" fill="#101815"/>
    <rect x="411" y="276" width="38" height="76" rx="19" fill="#101815"/>
    <rect x="500" y="294" width="38" height="58" rx="19" fill="#101815"/>
    <rect x="284" y="344" width="292" height="38" rx="19" fill="#101815"/>
    <rect x="330" y="412" width="200" height="152" rx="38" fill="none" stroke="#101815" stroke-width="38"/>
    <line x1="348" y1="488" x2="512" y2="488" stroke="#101815" stroke-width="34" stroke-linecap="round"/>
  </g>
</svg>
`;

async function generateOfficialAssets() {
  console.log('🎨 Aplicando Opción A (Translate Flip) como icono y splash oficial de Oboeru...');

  await sharp(Buffer.from(iconSvg)).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-only.png'));
  await sharp(Buffer.from(iconSvg)).resize(1024, 1024).png().toFile(path.join(assetsDir, 'logo.png'));
  await sharp(Buffer.from(foregroundSvg)).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-foreground.png'));
  await sharp(Buffer.from(backgroundSvg)).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-background.png'));
  await sharp(Buffer.from(splashDarkSvg)).resize(2732, 2732).png().toFile(path.join(assetsDir, 'splash.png'));
  await sharp(Buffer.from(splashDarkSvg)).resize(2732, 2732).png().toFile(path.join(assetsDir, 'splash-dark.png'));

  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), iconSvg.trim(), 'utf8');
  console.log('✅ Iconos base (1024x1024), Splash Screens (2732x2732) y favicon.svg actualizados.');
}

generateOfficialAssets().catch((err) => {
  console.error('Error generating assets:', err);
  process.exit(1);
});
