const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const rawPngToIco = require('png-to-ico');
const pngToIco = rawPngToIco.default || rawPngToIco;

const rootDir = path.resolve(__dirname, '..');

// Exact Website SVG Icon:
// Rounded gradient rectangle (#fa2d48 to #7c3aed) with 5 white soundwave bars
const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fa2d48" />
      <stop offset="100%" stop-color="#7c3aed" />
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="24" fill="url(#g)" />
  <path d="M28 36v28M40 26v48M52 18v64M64 26v48M76 36v28" stroke="white" stroke-width="7" stroke-linecap="round" />
</svg>`;

async function generate() {
  console.log('Generating standardized website icons...');

  const publicIconSvg = path.join(rootDir, 'public/icon.svg');
  fs.writeFileSync(publicIconSvg, svgString, 'utf8');
  console.log('Wrote public/icon.svg');

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  const tempFiles = [];

  for (const size of sizes) {
    const buf = await sharp(Buffer.from(svgString), { density: 300 })
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers.push(buf);

    const tempPath = path.join(rootDir, `scripts/temp_${size}.png`);
    fs.writeFileSync(tempPath, buf);
    tempFiles.push(tempPath);
  }

  // Generate high-res 512x512 PNG
  const png512 = await sharp(Buffer.from(svgString), { density: 300 })
    .resize(512, 512)
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(rootDir, 'public/icon.png'), png512);
  console.log('Wrote public/icon.png (512x512)');

  // Generate ICO with multi-resolution layers
  console.log('Generating .ico from PNGs [16, 24, 32, 48, 64, 128, 256]...');
  const icoBuf = await pngToIco(tempFiles);

  // Write to public/icon.ico and build/icon.ico
  fs.writeFileSync(path.join(rootDir, 'public/icon.ico'), icoBuf);
  console.log('Wrote public/icon.ico');

  fs.mkdirSync(path.join(rootDir, 'build'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'build/icon.ico'), icoBuf);
  console.log('Wrote build/icon.ico');

  // Also copy to dist if dist exists
  if (fs.existsSync(path.join(rootDir, 'dist'))) {
    fs.writeFileSync(path.join(rootDir, 'dist/icon.ico'), icoBuf);
    fs.writeFileSync(path.join(rootDir, 'dist/icon.png'), png512);
    fs.writeFileSync(path.join(rootDir, 'dist/icon.svg'), svgString);
    console.log('Updated dist/ icon assets');
  }

  // Cleanup temp files
  for (const tmp of tempFiles) {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }

  console.log('All standard icons generated successfully!');
}

generate().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
