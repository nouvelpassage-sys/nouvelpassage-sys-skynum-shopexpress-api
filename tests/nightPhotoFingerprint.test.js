import test from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { fingerprintPhoto, similarPhoto } from '../src/productAssistant/nightPhotoFingerprint.js';
function picture(size, alternate = false) {
  const data = Buffer.alloc(size*size*4);
  for (let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const i=(y*size+x)*4;
    const v = alternate ? ((Math.floor(x/size*7)+Math.floor(y/size*9))%2)*200 :
      Math.max(0, 240 - Math.hypot(x/size-0.35,y/size-0.6)*280);
    data[i]=v; data[i+1]=v*0.6; data[i+2]=v*0.3; data[i+3]=255;
  }
  return {data,width:size,height:size};
}
test('recompressed and resized photos are duplicate candidates', () => {
  const a=fingerprintPhoto(jpeg.encode(picture(128),90).data);
  const b=fingerprintPhoto(jpeg.encode(picture(64),50).data);
  assert.equal(similarPhoto(a,b),true);
  assert.notEqual(a.sha256,b.sha256);
  assert.equal(similarPhoto(a,fingerprintPhoto(jpeg.encode(picture(128,true),90).data)),false);
});
test('unreadable and flat photos cannot establish uniqueness', () => {
  assert.throws(()=>fingerprintPhoto(Buffer.from('not an image')));
  assert.throws(()=>fingerprintPhoto(jpeg.encode({data:Buffer.alloc(64*64*4),width:64,height:64},80).data));
});

test('standard 12-megapixel phone photo fits the bounded decoder', () => {
  const width=4032,height=3024;
  const data=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;
    data[i]=Math.floor(x/width*220);
    data[i+1]=Math.floor(y/height*220);
    data[i+2]=60;
    data[i+3]=255;
  }
  const result=fingerprintPhoto(jpeg.encode({data,width,height},30).data);
  assert.equal(result.version,1);
  assert.equal(result.phash.length,63);
});
