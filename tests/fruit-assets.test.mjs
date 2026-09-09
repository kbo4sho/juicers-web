import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import validator from 'gltf-validator';

const root = new URL('../public/fruits/3d/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
test('GLB shortlist covers every served fruit within the mobile asset budget', async () => {
  const source = await readFile(new URL('../src/game/model.ts', import.meta.url), 'utf8');
  const kinds = JSON.parse(source.match(/export const FRUITS = (\[.*?\])/)[1]);
  assert.deepEqual(manifest.map(asset => asset.kind), kinds);
  assert.ok(manifest.reduce((total, asset) => total + asset.bytes, 0) < 5_000_000);
});
for (const asset of manifest) {
  test(`${asset.kind} is a valid, self-contained glTF 2.0 mesh`, async () => {
    const bytes = await readFile(new URL(`${asset.kind}.glb`, root));
    assert.equal(bytes.byteLength, asset.bytes);
    const report = await validator.validateBytes(new Uint8Array(bytes), { maxIssues: 20 });
    assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues.messages));
    assert.equal(report.issues.numWarnings, 0, JSON.stringify(report.issues.messages));
    assert.ok(asset.triangles < 10_000);
    assert.ok(report.info.totalTriangleCount > 0);
    const jsonLength = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    assert.equal(gltf.asset.version, '2.0');
    assert.equal(gltf.images, undefined, 'No external or embedded texture payload');
    assert.ok(gltf.buffers.every(buffer => !buffer.uri), 'No external buffer dependencies');
  });
}
