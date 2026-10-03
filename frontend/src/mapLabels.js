// Move labels, never the geographic marker. Rectangles are measured in screen
// pixels so the placement stays readable after resizing or collapsing the chat.
export function placeMapLabels(nodes, width, height, obstacles = []) {
  if (!width || !height) return {};
  const overlaps = (a, b) => Math.max(0, Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)) * Math.max(0, Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  const occupied = [...obstacles, ...nodes.map(n=>({x:n.x-n.radius-3,y:n.y-n.radius-3,w:n.radius*2+6,h:n.radius*2+6}))];
  const result = {};
  const ordered = [...nodes].sort((a,b)=>b.priority-a.priority);
  for (const n of ordered) {
    const gap=n.radius+7,w=n.labelWidth,h=34;
    const right=[gap,-h/2],left=[-gap-w,-h/2];
    const candidates=[...(n.side==='left'?[left,right]:[right,left]),[-w/2,-gap-h],[-w/2,gap],[gap,-h-8],[-gap-w,-h-8],[gap,8],[-gap-w,8]];
    // Dense clusters near Plovdiv can use a leader line rather than collide.
    for(const distance of [30,60,90,120,160,210]){
      candidates.push([-w/2,-gap-h-distance],[-w/2,gap+distance],[gap+distance,-h/2],[-gap-w-distance,-h/2],
        [gap+distance,-h-distance],[gap+distance,distance],[-gap-w-distance,-h-distance],[-gap-w-distance,distance]);
    }
    let best=null;
    candidates.forEach(([candidateX,candidateY],rank)=>{
      const dx=Math.max(6-n.x,Math.min(candidateX,width-6-w-n.x));
      const dy=Math.max(6-n.y,Math.min(candidateY,height-6-h-n.y));
      const rect={x:n.x+dx,y:n.y+dy,w,h};
      const outside=Math.max(0,6-rect.x)+Math.max(0,rect.x+w-width+6)+Math.max(0,6-rect.y)+Math.max(0,rect.y+h-height+6);
      const collision=occupied.reduce((sum,o)=>sum+overlaps(rect,o),0);
      const score=collision*30+outside*1000+rank*2;
      if(!best||score<best.score)best={dx,dy,rect,score,collision,leader:rank>=8||dx!==candidateX||dy!==candidateY};
    });
    // Narrow map panes sometimes need a position outside the local cluster.
    // Only search the free canvas when the nearby candidates all collide.
    if(best.collision>0){
      let clear=null;
      for(let y=6;y<=height-h-6;y+=12)for(let x=6;x<=width-w-6;x+=12){
        const rect={x,y,w,h};
        if(occupied.some(o=>overlaps(rect,o)>0))continue;
        const distance=Math.hypot(x+w/2-n.x,y+h/2-n.y);
        if(!clear||distance<clear.distance)clear={dx:x-n.x,dy:y-n.y,rect,distance,leader:true};
      }
      if(clear)best=clear;
    }
    occupied.push({...best.rect,x:best.rect.x-3,y:best.rect.y-2,w:w+6,h:h+4});
    result[n.id]=best;
  }
  return result;
}
