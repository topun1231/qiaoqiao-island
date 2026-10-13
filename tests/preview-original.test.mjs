import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
const manifest=JSON.parse(readFileSync(new URL('./preview-original-manifest.json',import.meta.url)));
test('all original v8 distributed assets remain byte-for-byte unchanged',()=>{assert.ok(Object.keys(manifest).length>=30);for(const[path,hash]of Object.entries(manifest)){const content=readFileSync(new URL('../'+path.replace('dist/','dist/v8/'),import.meta.url));assert.equal(createHash('sha256').update(content).digest('hex'),hash,path);}});
