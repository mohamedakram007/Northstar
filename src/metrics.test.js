import test from 'node:test';
import assert from 'node:assert/strict';
import {courseProgress,moduleProgress,learningMinutesBetween,projectProgress} from './metrics.js';

test('module completion uses completed topics only and handles empty modules',()=>{
  const topics=[{moduleId:'m',status:'Completed'},{moduleId:'m',status:'In progress'},{moduleId:'n',status:'Completed'}];
  assert.equal(moduleProgress('m',topics),50);
  assert.equal(moduleProgress('empty',topics),0);
});
test('course completion counts its topics across modules without confidence affecting completion',()=>{
  const modules=[{id:'m1',courseId:'c1'},{id:'m2',courseId:'c1'},{id:'m3',courseId:'c2'}];
  const topics=[{moduleId:'m1',status:'Completed',confidence:1},{moduleId:'m1',status:'Needs revision',confidence:5},{moduleId:'m2',status:'Completed'},{moduleId:'m3',status:'Completed'}];
  assert.equal(courseProgress('c1',modules,topics),67);
  assert.equal(courseProgress('c2',modules,topics),100);
  assert.equal(courseProgress('empty',modules,topics),0);
});
test('learning session minutes sum each saved session once inside an inclusive date range',()=>{
  const sessions=[{date:'2026-10-27',duration:30},{date:'2026-10-28',duration:'45'},{date:'2026-10-29',duration:90},{date:'2026-10-28',duration:'bad'}];
  assert.equal(learningMinutesBetween(sessions,'2026-10-28','2026-10-28'),45);
  assert.equal(learningMinutesBetween(sessions,'2026-10-27','2026-10-28'),75);
});
test('project progress is derived from completed features and handles empty projects',()=>{
  const features=[{projectId:'p',status:'Completed'},{projectId:'p',status:'Testing'},{projectId:'q',status:'Completed'}];
  assert.equal(projectProgress('p',features),50);
  assert.equal(projectProgress('empty',features),0);
});
