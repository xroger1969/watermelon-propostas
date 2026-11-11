import test from 'node:test';
import assert from 'node:assert/strict';
import {packCompletionMetadata,unpackCompletionMetadata,importedPhotoReferences} from '../completion-fields.js';
import {approveProductReview,reviewFingerprint} from '../product-integrity.js';
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
test('mixed imported and uploaded photos retain order, cover and operational review after signed URLs refresh',()=>{
  const second={...photo,url:photo.url.replace('photo.jpg','second.jpg'),name:'second.jpg'};
  const upload={path:'products/upload.jpg',url:'https://storage.example/upload?token=old',isMain:false};
  const last={path:'products/last.jpg',url:'https://storage.example/last?token=old',isMain:false};
  const p={...product,gallery:[{...photo,isMain:true},upload,second,last],mainImage:photo.url};
  approveProductReview(p);
  const packed=packCompletionMetadata(p);
  const refreshed=[{...upload,url:'https://storage.example/upload?token=new',isMain:true},{...last,url:'https://storage.example/last?token=new'}];
  const restored=unpackCompletionMetadata({...packed,gallery:refreshed,mainImage:refreshed[0].url});
  assert.deepEqual(restored.gallery.map(item=>item.path||item.url),p.gallery.map(item=>item.path||item.url));
  assert.equal(restored.mainImage,photo.url);
  assert.equal(restored.gallery[0].isMain,true);
  assert.equal(restored.gallery[1].isMain,false);
  assert.equal(restored.inputSource.studioSafety.reviewApproved,reviewFingerprint(restored));
  assert.ok(!JSON.stringify(packed.inputSource.studioGalleryLayout).includes('token='));
});
test('a selected uploaded cover survives a mixed gallery without saving its signed URL',()=>{
  const upload={path:'products/cover.jpg',url:'https://storage.example/cover?token=old'};
  const p={...product,gallery:[photo,upload],mainImage:upload.url};
  const packed=packCompletionMetadata(p);
  const fresh={...upload,url:'https://storage.example/cover?token=new'};
  const restored=unpackCompletionMetadata({...packed,gallery:[fresh],mainImage:''});
  assert.equal(restored.mainImage,fresh.url);
  assert.equal(restored.gallery[1].isMain,true);
  assert.equal(restored.gallery[0].isMain,false);
  assert.deepEqual(packed.inputSource.studioGalleryLayout,{version:1,order:['import:dynamic-media.tacdn.com/media/photo-o/aa/bb/photo.jpg','storage:products/cover.jpg'],main:'storage:products/cover.jpg'});
});
test('deletion and reorder replace the layout and never restore stale gallery items',()=>{
  const upload={path:'products/cover.jpg',url:'https://storage.example/cover?token=old'};
  const second={...photo,url:photo.url.replace('photo.jpg','second.jpg')};
  const saved=packCompletionMetadata({...product,gallery:[photo,upload,second],mainImage:photo.url});
  const edited=packCompletionMetadata({...saved,gallery:[second,upload],mainImage:second.url});
  const restored=unpackCompletionMetadata({...edited,gallery:[upload],mainImage:upload.url});
  assert.deepEqual(restored.gallery.map(item=>item.path||item.url),[second.url,upload.path]);
  assert.equal(restored.mainImage,second.url);
  const empty=packCompletionMetadata({...restored,gallery:[],mainImage:''});
  assert.deepEqual(empty.inputSource.studioGalleryLayout,{version:1,order:[],main:''});
  assert.deepEqual(unpackCompletionMetadata({...empty,gallery:[]}).gallery,[]);
  assert.equal(unpackCompletionMetadata({...empty,gallery:[]}).mainImage,'');
  const tampered=unpackCompletionMetadata({...edited,gallery:[],inputSource:{...edited.inputSource,studioGalleryLayout:{version:1,order:['storage:missing.jpg','import:unrelated.example/photo.jpg'],main:'storage:missing.jpg'}}});
  assert.deepEqual(tampered.gallery.map(item=>item.url),[second.url]);
});
