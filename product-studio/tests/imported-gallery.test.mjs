import test from 'node:test';
import assert from 'node:assert/strict';
import {packCompletionMetadata,unpackCompletionMetadata,importedPhotoReferences} from '../completion-fields.js';
const photo={url:'https://dynamic-media.tacdn.com/media/photo-o/aa/bb/photo.jpg',source:'existing-watermelon-viator-listing',sourceProductCode:'9963P14',sourceUrl:'https://www.viator.com/tours/Almada/Tour/d51024-9963P14',name:'almada.jpg',width:1600,height:1200};
const product={id:'WM-9963P14',viatorCode:'9963P14',gallery:[photo]};
test('owned source photo references survive the legacy storage-only API round trip',()=>{
  const packed=packCompletionMetadata(product);
  const restored=unpackCompletionMetadata({...packed,gallery:[],mainImage:''});
  assert.equal(restored.gallery.length,1);
  assert.equal(restored.gallery[0].url,photo.url);
  assert.equal(restored.gallery[0].width,1600);
  assert.equal(restored.mainImage,photo.url);
});
test('removing an imported photo clears its persisted reference on the next save',()=>{
  const saved=packCompletionMetadata(product);
  const edited=packCompletionMetadata({...saved,gallery:[]});
  assert.deepEqual(edited.inputSource.studioImportedMedia,[]);
  assert.deepEqual(unpackCompletionMetadata(edited).gallery,[]);
});
test('unrelated products, unsafe URLs and signed storage items are not imported',()=>{
  for(const bad of [
    {...photo,url:'http://dynamic-media.tacdn.com/media/photo.jpg'},
    {...photo,url:'https://dynamic-media.tacdn.com.evil.test/photo.jpg'},
    {...photo,url:'https://user:password@dynamic-media.tacdn.com/photo.jpg'},
    {...photo,sourceProductCode:'9963P16'},
    {...photo,sourceUrl:photo.sourceUrl.replace('P14','P15')},
    {...photo,path:'products/private.jpg'},
  ])assert.equal(importedPhotoReferences([bad],product).length,0);
});
test('duplicates and thumbnail variants count once and storage uploads are preserved',()=>{
  const imported=importedPhotoReferences([photo,{...photo,url:photo.url+'?w=500'}],product);
  assert.equal(imported.length,1);
  const stored={path:'products/new.jpg',url:'https://storage.example/signed-image'};
  const restored=unpackCompletionMetadata({...product,gallery:[stored],inputSource:{studioImportedMedia:imported}});
  assert.equal(restored.gallery.length,2);
  assert.equal(restored.gallery[0].path,stored.path);
});
