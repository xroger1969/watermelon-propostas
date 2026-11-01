import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../lib/product-builder.js',import.meta.url),'utf8');

test('Product Studio requires GPT-6 Astra and has no legacy model fallback',()=>{
  assert.match(source,/OPENAI_PRODUCT_MODEL\s*\|\|\s*['"]gpt-6-astra['"]/);
  assert.match(source,/withConfiguredModel/);
  assert.doesNotMatch(source,/withModelFallback/);
  assert.doesNotMatch(source,/gpt-5\.6-terra|gpt-6\.1-sol/);
});
