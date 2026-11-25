// The pixels of an image of the extension's own: a canvas only a real browser draws (see favicons.ts).

/** The RGBA pixels of the image at `url`, or `undefined` when it does not load. */
export async function imagePixels(doc: Document, url: string): Promise<Uint8ClampedArray | undefined> {
  const image = doc.createElement('img');
  image.src = url;
  try {
    await image.decode();
  } catch {
    return undefined;
  }
  const canvas = doc.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}
