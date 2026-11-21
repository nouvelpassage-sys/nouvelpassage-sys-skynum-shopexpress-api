import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';

export function fingerprintPhoto(bytes) {
  if (!bytes?.length || bytes.length > 12 * 1024 * 1024) throw new Error('Unsupported image size');
  let image;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    image = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 16, maxMemoryUsageInMB: 256, tolerantDecoding: false });
  } else if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    if (bytes.length < 24 || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 16000000) throw new Error('Unsupported PNG resolution');
    image = PNG.sync.read(bytes);
  } else throw new Error('Unsupported photo format');
  const { width, height, data } = image;
  if (width < 32 || height < 32) throw new Error('Photo too small for duplicate review');
  const size = 32;
  const grey = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sum = 0, count = 0;
    for (let py = Math.floor(y * height / size); py < Math.floor((y + 1) * height / size); py++) {
      for (let px = Math.floor(x * width / size); px < Math.floor((x + 1) * width / size); px++) {
        const i = (py * width + px) * 4;
        sum += data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
        count++;
      }
    }
    grey.push(sum / count);
  }
  const mean = grey.reduce((a,b) => a+b,0) / grey.length;
  const variance = grey.reduce((sum,v) => sum + (v-mean)**2,0) / grey.length;
  if (variance < 20) throw new Error('Insufficient photo detail');
  const coefficients = [];
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
    if (u === 0 && v === 0) continue;
    let sum = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      sum += grey[y*size+x] * Math.cos(Math.PI*(2*x+1)*u/(2*size)) * Math.cos(Math.PI*(2*y+1)*v/(2*size));
    }
    coefficients.push(sum);
  }
  const median = [...coefficients].sort((a,b) => a-b)[31];
  return { version: 1, sha256: createHash('sha256').update(bytes).digest('hex'),
    phash: coefficients.map((value) => value > median ? '1' : '0').join('') };
}

export function similarPhoto(left, right) {
  if (left?.version !== 1 || right?.version !== 1 || left.phash?.length !== 63 || right.phash?.length !== 63) throw new Error('Invalid fingerprint');
  if (left.sha256 === right.sha256) return true;
  const distance = [...left.phash].reduce((n,bit,i) => n + (bit === right.phash[i] ? 0 : 1),0);
  return distance <= 14;
}
