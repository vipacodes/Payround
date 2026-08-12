// Turn a camera / gallery File into a small JPEG data URL.
// Phones often send HEIC, empty type, or huge files — handle those without throwing.

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode'));
    img.src = url;
  });
}

function canvasJpeg(img, maxSize, quality) {
  const w0 = img.width || img.naturalWidth || 1;
  const h0 = img.height || img.naturalHeight || 1;
  const scale = Math.min(1, maxSize / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function compressImage(file, maxSize = 512, quality = 0.85) {
  if (!file || file.size === 0) throw new Error('empty');

  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      try {
        return canvasJpeg(bmp, maxSize, quality);
      } finally {
        if (bmp.close) bmp.close();
      }
    } catch {
      /* HEIC / odd types — try URL next */
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageFromUrl(objectUrl);
    return canvasJpeg(img, maxSize, quality);
  } catch {
    /* FileReader last */
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const original = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });

  try {
    const img = await loadImageFromUrl(original);
    return canvasJpeg(img, maxSize, quality);
  } catch {
    if (typeof original === 'string' && original.startsWith('data:image/')) return original;
    throw new Error('unsupported');
  }
}
