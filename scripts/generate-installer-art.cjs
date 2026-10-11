const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

function createBmpBuffer(width, height, rawRgbBuffer) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const imageSize = rowSize * height;
  const fileSize = 54 + imageSize;
  const buf = Buffer.alloc(fileSize);

  // BMP Header (14 bytes)
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt16LE(0, 6);
  buf.writeUInt16LE(0, 8);
  buf.writeUInt32LE(54, 10);

  // DIB Header (BITMAPINFOHEADER - 40 bytes)
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(imageSize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  // Pixel rows bottom-to-top, BGR order
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y;
    const destRowOffset = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const srcIdx = (srcY * width + x) * 3;
      const r = rawRgbBuffer[srcIdx];
      const g = rawRgbBuffer[srcIdx + 1];
      const b = rawRgbBuffer[srcIdx + 2];
      const destIdx = destRowOffset + x * 3;
      buf[destIdx] = b;
      buf[destIdx + 1] = g;
      buf[destIdx + 2] = r;
    }
  }
  return buf;
}

async function renderSvgToBmp(svgString, width, height, outputPath) {
  const rawRgb = await sharp(Buffer.from(svgString))
    .resize(width, height)
    .removeAlpha()
    .raw()
    .toBuffer();

  const bmpBuf = createBmpBuffer(width, height, rawRgb);
  fs.writeFileSync(outputPath, bmpBuf);
  console.log(`Generated: ${outputPath} (${width}x${height}, ${bmpBuf.length} bytes)`);
}

async function main() {
  const buildDir = path.join(__dirname, '../build');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  // 1. installerSidebar.bmp (164 x 314 px)
  const sidebarSvg = `
  <svg width="164" height="314" viewBox="0 0 164 314" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#050508"/>
        <stop offset="45%" stop-color="#0c0d16"/>
        <stop offset="100%" stop-color="#07070d"/>
      </linearGradient>
      <linearGradient id="brand" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fa2d48"/>
        <stop offset="100%" stop-color="#7c3aed"/>
      </linearGradient>
      <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#06b6d4"/>
        <stop offset="100%" stop-color="#3b82f6"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="30%" r="60%">
        <stop offset="0%" stop-color="#fa2d48" stop-opacity="0.35"/>
        <stop offset="50%" stop-color="#7c3aed" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <!-- Deep obsidian background -->
    <rect width="164" height="314" fill="url(#bg)"/>

    <!-- Ambient glow circle -->
    <circle cx="82" cy="85" r="70" fill="url(#glow)"/>

    <!-- Top WaveCraft Pro Icon -->
    <g transform="translate(56, 32)">
      <rect width="52" height="52" rx="14" fill="url(#brand)"/>
      <rect width="52" height="52" rx="14" fill="none" stroke="#ffffff" stroke-width="1" stroke-opacity="0.3"/>
      <!-- Soundwave equalizer bars -->
      <path d="M14 20v12M20 14v24M26 9v34M32 14v24M38 20v12" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>
    </g>

    <!-- Title & Brand -->
    <text x="82" y="106" font-family="Segoe UI, Inter, Arial, sans-serif" font-weight="900" font-size="12" fill="#ffffff" text-anchor="middle" letter-spacing="1.5">WAVECRAFT PRO</text>
    <text x="82" y="119" font-family="Segoe UI, Inter, Arial, sans-serif" font-weight="700" font-size="7.5" fill="#fa2d48" text-anchor="middle" letter-spacing="1">STUDIO AUDIO PLATFORM</text>

    <!-- Divider line -->
    <line x1="24" y1="130" x2="140" y2="130" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1"/>

    <!-- Feature badges -->
    <g transform="translate(18, 144)">
      <!-- Item 1 -->
      <rect x="0" y="0" width="128" height="24" rx="6" fill="#ffffff" fill-opacity="0.04" stroke="#ffffff" stroke-opacity="0.08"/>
      <text x="10" y="15" font-family="Segoe UI, Arial" font-size="8.5" fill="#ff758c" font-weight="bold">✦</text>
      <text x="22" y="15" font-family="Segoe UI, Arial" font-size="8" fill="#e2e8f0" font-weight="600">AI Smart Vibe DJ</text>

      <!-- Item 2 -->
      <rect x="0" y="30" width="128" height="24" rx="6" fill="#ffffff" fill-opacity="0.04" stroke="#ffffff" stroke-opacity="0.08"/>
      <text x="10" y="45" font-family="Segoe UI, Arial" font-size="8.5" fill="#a78bfa" font-weight="bold">✦</text>
      <text x="22" y="45" font-family="Segoe UI, Arial" font-size="8" fill="#e2e8f0" font-weight="600">3D Spatial Acoustics</text>

      <!-- Item 3 -->
      <rect x="0" y="60" width="128" height="24" rx="6" fill="#ffffff" fill-opacity="0.04" stroke="#ffffff" stroke-opacity="0.08"/>
      <text x="10" y="75" font-family="Segoe UI, Arial" font-size="8.5" fill="#38bdf8" font-weight="bold">✦</text>
      <text x="22" y="75" font-family="Segoe UI, Arial" font-size="8" fill="#e2e8f0" font-weight="600">10-Band Studio EQ</text>

      <!-- Item 4 -->
      <rect x="0" y="90" width="128" height="24" rx="6" fill="#ffffff" fill-opacity="0.04" stroke="#ffffff" stroke-opacity="0.08"/>
      <text x="10" y="105" font-family="Segoe UI, Arial" font-size="8.5" fill="#34d399" font-weight="bold">✦</text>
      <text x="22" y="105" font-family="Segoe UI, Arial" font-size="8" fill="#e2e8f0" font-weight="600">Infinite Lossless Stream</text>
    </g>

    <!-- Bottom Waveform Decoration -->
    <path d="M10 286 Q 40 274, 82 284 T 154 282" fill="none" stroke="url(#cyanGrad)" stroke-width="2" stroke-opacity="0.5"/>
    <text x="82" y="302" font-family="Segoe UI, Arial" font-size="7" fill="#64748b" text-anchor="middle" font-weight="600" letter-spacing="0.5">Liquid Glass Sound Architecture</text>
  </svg>
  `;

  // 2. installerHeader.bmp (150 x 57 px)
  const headerSvg = `
  <svg width="150" height="57" viewBox="0 0 150 57" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="hbg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#07070d"/>
        <stop offset="100%" stop-color="#10111d"/>
      </linearGradient>
      <linearGradient id="hbrand" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fa2d48"/>
        <stop offset="100%" stop-color="#7c3aed"/>
      </linearGradient>
    </defs>

    <rect width="150" height="57" fill="url(#hbg)"/>

    <!-- Small Brand Icon -->
    <g transform="translate(10, 10)">
      <rect width="36" height="36" rx="9" fill="url(#hbrand)"/>
      <path d="M10 14v8M14 10v16M18 6v24M22 10v16M26 14v8" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
    </g>

    <!-- Text Header -->
    <text x="54" y="25" font-family="Segoe UI, Arial" font-weight="900" font-size="11" fill="#ffffff" letter-spacing="0.8">WaveCraft Pro</text>
    <text x="54" y="39" font-family="Segoe UI, Arial" font-weight="600" font-size="8" fill="#fa2d48" letter-spacing="0.5">Setup Wizard</text>

    <!-- Decorative Audio Wave on the right -->
    <path d="M124 20v16M130 14v28M136 22v12M142 26v4" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-opacity="0.6"/>
  </svg>
  `;

  await renderSvgToBmp(sidebarSvg, 164, 314, path.join(buildDir, 'installerSidebar.bmp'));
  await renderSvgToBmp(headerSvg, 150, 57, path.join(buildDir, 'installerHeader.bmp'));
  console.log('Modern NSIS installer artwork successfully created!');
}

main().catch(console.error);
