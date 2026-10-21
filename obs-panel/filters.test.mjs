import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enrichMatches,filterMatches,choices} from './public/filters.js';
const side=name=>({team:{name},score:0,sets:0,games:0,points:0});
const records=enrichMatches([
  {id:'avulsa-1',sport:'futsal',status:'scheduled',title:'Amistoso',category:'Adulto',venue:'Ginásio Central',scheduledAt:'2026-09-24T14:00',a:side('São José'),b:side('Verde')},
  {id:'cup-1',tournamentId:'cup',stageId:'stage',sport:'football',status:'done',title:'Decisão',category:'Juvenil',venue:'Campo Norte',scheduledAt:'2026-09-24T16:30',a:side('Azul'),b:side('Verde')},
  {id:'sets-1',sport:'volleyball',status:'done',a:{...side('A'),score:25,sets:3},b:{...side('B'),score:12,sets:1}},
],[{id:'cup',name:'Copa Camar',stages:[{id:'stage',name:'Final'}]}]);

test('includes standalone matches and distinguishes them explicitly',()=>{
  assert.equal(filterMatches(records).length,3);
  assert.deepEqual(filterMatches(records,{selected:{origin:'Partidas avulsas',sport:'Futsal'}}).map(m=>m.id),['avulsa-1']);
  assert.deepEqual(filterMatches(records,{selected:{tournament:'Copa Camar',phase:'Final'}}).map(m=>m.id),['cup-1']);
  assert.ok(choices(records,'tournament').includes('Partidas avulsas'));
});
test('text search ignores accents and covers multiple metadata fields or one selected field',()=>{
  assert.equal(filterMatches(records,{query:'sao ginasio 14:00 avulsa-1'}).length,1);
  assert.equal(filterMatches(records,{query:'24/09/2026 Copa Final Encerrada'}).length,1);
  assert.equal(filterMatches(records,{query:'central',field:'venue'}).length,1);
  assert.equal(filterMatches(records,{query:'central',field:'team'}).length,0);
  assert.equal(filterMatches(records,{selected:{team:'Verde',category:'Juvenil',time:'16:30',date:'24/09/2026'}}).length,1);
  assert.equal(filterMatches(records,{selected:{team:'Ver'}}).length,0);
});
test('zero-zero completed matches count as score, scheduled zeros do not; set sports use sets',()=>{
  assert.equal(filterMatches(records,{selected:{result:'Sem placar'}})[0].id,'avulsa-1');
  assert.equal(filterMatches(records,{selected:{result:'Com placar'}}).length,2);
  assert.equal(records[1].score,'0 × 0');
  assert.equal(records[2].score,'3 × 1 sets');
  assert.equal(filterMatches(records,{field:'score',query:'3 x 1'}).length,1);
});
