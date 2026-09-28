'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),{validateCoreReleaseInput}=require('./validate-core-release-input');
test('accepts a stable version and derives the beta image tag',()=>{assert.deepEqual(validateCoreReleaseInput('0.2.0',' First clean-core beta. '),{version:'0.2.0',channel:'BETA',imageTag:'0.2.0-beta',releaseNotes:'First clean-core beta.'});});
test('rejects a prerelease that would create a double-beta tag',()=>{assert.throws(()=>validateCoreReleaseInput('0.2.0-beta.1','notes'),/stable semantic version/);});
test('rejects malformed versions and empty or oversized notes',()=>{for(const version of ['v0.2.0','01.2.0','0.2','latest'])assert.throws(()=>validateCoreReleaseInput(version,'notes'),/stable semantic version/);assert.throws(()=>validateCoreReleaseInput('0.2.0','   '),/required/);assert.throws(()=>validateCoreReleaseInput('0.2.0','x'.repeat(50001)),/50000/);});
