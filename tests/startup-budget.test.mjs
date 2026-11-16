import test from 'node:test';
import assert from 'node:assert/strict';
import {assessStartup} from './startup-budget.mjs';
const report=()=>({version:1,entryReady:1500,campusBuilt:2800,entered:1600,longTasks:[{start:10,duration:60},{start:21000,duration:150}],frameGaps:[16,17,25],resources:[{start:30,transferSize:1024}],gpu:'test fixture (not measurement)',environment:{chrome:'fixture'},errors:[],httpErrors:[]});
test('startup budget counts only the specified twenty-second window',()=>{const r=assessStartup(report(),{maxTasks:1,maxTaskMs:100});assert.equal(r.passed,true);assert.equal(r.metrics.tasks,1);});
test('incomplete or fabricated-missing observations never pass',()=>{const r=report();r.campusBuilt=null;assert.equal(assessStartup(r).valid,false);});
test('thresholds and browser errors independently fail the gate',()=>{const r=report();assert.equal(assessStartup(r,{maxBytes:1000}).passed,false);r.errors.push('WebGL failed');assert.equal(assessStartup(r).passed,false);});
