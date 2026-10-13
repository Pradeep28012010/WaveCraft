import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const utilPath = path.resolve(process.cwd(), 'src/utils/versionUtils.ts');
const rawTs = fs.readFileSync(utilPath, 'utf8');
const transpiledJs = ts.transpileModule(rawTs, {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText;

const utilExports = {};
eval('(function(exports) { ' + transpiledJs + ' })(utilExports);');

const { isVersionGreater } = utilExports;

describe('In-App Updater & Semver Comparison Logic', () => {
  it('correctly identifies higher minor version as update needed', () => {
    assert.strictEqual(isVersionGreater('5.1.0', '5.0.0'), true);
  });

  it('correctly identifies higher patch version as update needed', () => {
    assert.strictEqual(isVersionGreater('5.0.1', '5.0.0'), true);
  });

  it('correctly identifies higher major version as update needed', () => {
    assert.strictEqual(isVersionGreater('6.0.0', '5.0.0'), true);
  });

  it('handles "v" prefix correctly', () => {
    assert.strictEqual(isVersionGreater('v5.0.2', 'v5.0.0'), true);
    assert.strictEqual(isVersionGreater('5.0.2', 'v5.0.0'), true);
    assert.strictEqual(isVersionGreater('v5.0.0', '5.0.0'), false);
  });

  it('returns false when latest is identical to current', () => {
    assert.strictEqual(isVersionGreater('5.0.0', '5.0.0'), false);
  });

  it('returns false when latest is older than current', () => {
    assert.strictEqual(isVersionGreater('4.9.9', '5.0.0'), false);
    assert.strictEqual(isVersionGreater('5.0.0', '5.0.1'), false);
  });

  it('handles multi-level version numbers cleanly', () => {
    assert.strictEqual(isVersionGreater('5.0.0.1', '5.0.0'), true);
    assert.strictEqual(isVersionGreater('5.0.0', '5.0.0.1'), false);
  });

  it('handles null, undefined, and non-string inputs safely without throwing', () => {
    assert.strictEqual(isVersionGreater('', '5.0.0'), false);
    assert.strictEqual(isVersionGreater(null, '5.0.0'), false);
    assert.strictEqual(isVersionGreater(undefined, '5.0.0'), false);
    assert.strictEqual(isVersionGreater('5.0.1', null), true);
    assert.strictEqual(isVersionGreater('5.0.1', undefined), true);
  });
});
