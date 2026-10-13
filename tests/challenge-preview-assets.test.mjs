import test from'node:test';import assert from'node:assert/strict';import{readFileSync,readdirSync,existsSync}from'node:fs';import{resolve}from'node:path';import{fileURLToPath}from'node:url';
const dir=fileURLToPath(new URL('../dist/challenge-test/',import.meta.url));
test('every challenge module import resolves to a bundled local file',()=>{for(const f of readdirSync(dir).filter(n=>n.endsWith('.js'))){const source=readFileSync(resolve(dir,f),'utf8');for(const m of source.matchAll(/(?:from\s*|import\s*\()['"](\.\.?\/[^'"]+)['"]/g)){assert.ok(existsSync(resolve(dir,m[1].split(/[?#]/)[0])),f+' imports '+m[1]);}assert.ok(!/https?:\/\/(?:unpkg|cdn|esm\.sh)/.test(source));}});

// This temporary online-only entry intentionally does not promise offline play.
// sw.js is an inert placeholder, not a registered cache worker.
test('challenge entry does not register a service worker or use app caches', () => {
  for (const file of readdirSync(dir).filter(name => /\.(?:js|html)$/.test(name) && name !== 'sw.js')) {
    const source = readFileSync(resolve(dir, file), 'utf8');
    assert.doesNotMatch(source, /serviceWorker\s*(?:\.\s*register|\[\s*['"]register['"]\s*\])/s, file);
    assert.doesNotMatch(source, /\bcaches\s*\.\s*(?:open|match|delete|keys)\s*\(/, file);
  }
});
test('challenge worker placeholder contains no cache or worker lifecycle code', () => {
  const source = readFileSync(resolve(dir, 'sw.js'), 'utf8');
  assert.equal(source.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').trim(), '');
});
