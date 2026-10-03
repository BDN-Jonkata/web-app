import test from 'node:test';
import assert from 'node:assert/strict';
import {placeMapLabels} from './mapLabels.js';
import {CITIES,SITES,NUCLEAR,GEO,pos,simulate} from './energy.js';

function scene(width,height,selected='sofia') {
  const sim=simulate({hour:13,season:'autumn',cloud:20,wind:45});
  const scale=Math.max(.75,Math.min(1,width/1100,height/620));
  const nodes=[
    ...CITIES.map(city=>({...city,priority:100,size:(15+Math.sqrt(sim.cityDemand[city.id])*.75)*scale})),
    ...SITES.map(site=>({...site,priority:50,size:(14+Math.sqrt(site.cap))*scale})),
    {...NUCLEAR,priority:75,size:25*scale}
  ].map(node=>{
    const p=pos(node.lon,node.lat);
    return {...node,x:p.x/GEO.width*width,y:p.y/GEO.height*height,
      radius:node.size/2,side:node.label||'right',
      labelWidth:Math.max(84,node.name.length*7.8+12),
      priority:node.priority+(node.id===selected?100:0)};
  });
  const obstacles=[{x:9,y:8,w:151,h:198},{x:width-290,y:height-310,w:282,h:298}];
  return {nodes,obstacles};
}
const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*
  Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));

test('empty or not-yet-measured map has no labels',()=>{
  assert.deepEqual(placeMapLabels([],0,0),{});
});

for(const [width,height] of [[990,530],[916,460],[1110,700],[654,440]]) {
  test('readable labels in a '+width+' × '+height+' map',()=>{
    const {nodes,obstacles}=scene(width,height);
    const original=structuredClone(nodes);
    const labels=placeMapLabels(nodes,width,height,obstacles);
    assert.equal(Object.keys(labels).length,nodes.length);
    assert.deepEqual(nodes,original,'Label placement must never move geographic points');
    for(const node of nodes){
      const {rect}=labels[node.id];
      assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.w<=width&&rect.y+rect.h<=height,node.id+' stays in view');
      for(const obstacle of obstacles)assert.equal(overlap(rect,obstacle),0,node.id+' avoids overlay panels');
    }
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      assert.equal(overlap(labels[nodes[i].id].rect,labels[nodes[j].id].rect),0,nodes[i].id+' / '+nodes[j].id);
    }
  });
}
test('resizing and selection produce deterministic label positions',()=>{
  for(const selected of ['sofia','plovdiv','ruse','varna','pazardzhik',null]){
    const {nodes,obstacles}=scene(990,530,selected);
    assert.deepEqual(placeMapLabels(nodes,990,530,obstacles),placeMapLabels(nodes,990,530,obstacles));
  }
});
