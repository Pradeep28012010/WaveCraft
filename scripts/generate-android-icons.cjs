const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const srcIconPath = path.resolve(__dirname, '../public/icon.png');
const resDir = path.resolve(__dirname, '../android/app/src/main/res');

const densities = [
  { name: 'mipmap-mdpi', size: 48, foregroundSize: 108 },
  { name: 'mipmap-hdpi', size: 72, foregroundSize: 162 },
  { name: 'mipmap-xhdpi', size: 96, foregroundSize: 216 },
  { name: 'mipmap-xxhdpi', size: 144, foregroundSize: 324 },
  { name: 'mipmap-xxxhdpi', size: 192, foregroundSize: 432 }
];

async function generate() {
  console.log('Generating Android app icons from', srcIconPath);

  // 1. Create a circular mask for round icons
  const iconMetadata = await sharp(srcIconPath).metadata();
  const circleSvg = Buffer.from(
    `<svg width="${iconMetadata.width}" height="${iconMetadata.height}">
      <circle cx="${iconMetadata.width / 2}" cy="${iconMetadata.height / 2}" r="${iconMetadata.width / 2}" fill="white" />
    </svg>`
  );

  const roundIconBuffer = await sharp(srcIconPath)
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .png()
    .toBuffer();

  for (const d of densities) {
    const dir = path.join(resDir, d.name);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // A. ic_launcher.png (legacy standard icon)
    await sharp(srcIconPath)
      .resize(d.size, d.size)
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'));

    // B. ic_launcher_round.png (legacy round icon)
    await sharp(roundIconBuffer)
      .resize(d.size, d.size)
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));

    // C. ic_launcher_foreground.png (modern adaptive icon foreground with safe padding)
    const logoSize = Math.round(d.foregroundSize * 0.72);
    const resizedLogo = await sharp(srcIconPath)
      .resize(logoSize, logoSize, { fit: 'contain' })
      .toBuffer();

    const top = Math.round((d.foregroundSize - logoSize) / 2);
    const left = Math.round((d.foregroundSize - logoSize) / 2);

    await sharp({
      create: {
        width: d.foregroundSize,
        height: d.foregroundSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: resizedLogo, top, left }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));

    console.log(`Generated icons for ${d.name} (${d.size}x${d.size}, fg ${d.foregroundSize}x${d.foregroundSize})`);
  }

  // 2. Update ic_launcher_background.xml
  const bgXmlPath = path.join(resDir, 'drawable/ic_launcher_background.xml');
  const bgXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportHeight="108"
    android:viewportWidth="108">
    <path
        android:fillColor="#06060b"
        android:pathData="M0,0h108v108h-108z" />
</vector>
`;
  fs.writeFileSync(bgXmlPath, bgXmlContent, 'utf-8');
  console.log('Updated drawable/ic_launcher_background.xml');

  // 3. Update values/ic_launcher_background.xml
  const valuesBgXmlPath = path.join(resDir, 'values/ic_launcher_background.xml');
  const valuesBgXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#06060b</color>
</resources>
`;
  fs.writeFileSync(valuesBgXmlPath, valuesBgXmlContent, 'utf-8');
  console.log('Updated values/ic_launcher_background.xml');

  // 4. Remove or replace drawable-v24/ic_launcher_foreground.xml so Android uses the mipmap foreground
  const v24Foreground = path.join(resDir, 'drawable-v24/ic_launcher_foreground.xml');
  if (fs.existsSync(v24Foreground)) {
    fs.unlinkSync(v24Foreground);
    console.log('Removed legacy drawable-v24/ic_launcher_foreground.xml');
  }

  console.log('All Android icons generated successfully!');
}

generate().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
