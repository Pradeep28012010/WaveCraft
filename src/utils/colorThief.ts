export async function extractColors(imageUrl: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const rgbCounts: Record<string, number> = {};
      
      const step = Math.ceil(imageData.length / 4000) * 4;
      for (let i = 0; i < imageData.length; i += step) {
        const r = Math.round(imageData[i] / 10) * 10;
        const g = Math.round(imageData[i + 1] / 10) * 10;
        const b = Math.round(imageData[i + 2] / 10) * 10;
        const a = imageData[i + 3];
        
        if (a < 128) continue;
        
        if ((r < 20 && g < 20 && b < 20) || (r > 240 && g > 240 && b > 240)) continue;
        
        const rgb = `${r},${g},${b}`;
        rgbCounts[rgb] = (rgbCounts[rgb] || 0) + 1;
      }
      
      const sortedColors = Object.entries(rgbCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([rgb]) => {
          const [r, g, b] = rgb.split(',').map(Number);
          return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        });
        
      if (sortedColors.length === 0) {
        resolve(['#1f2937', '#111827']);
      } else {
        resolve(sortedColors);
      }
    };
    
    img.onerror = () => {
      resolve(['#1f2937', '#111827']);
    };
    
    img.src = imageUrl;
  });
}
