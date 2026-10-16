export function signConnector(board, pin) {
  return {x:Math.max(board.x,Math.min(board.x+board.w,pin.x)),y:Math.max(board.y,Math.min(board.y+board.h,pin.y))};
}
export function segmentCrossesBox(a,b,box,pad=0) {
  let start=0,end=1;
  for(const [key,size] of [['x','w'],['y','h']]){
    const delta=b[key]-a[key],min=box[key]-pad,max=box[key]+box[size]+pad;
    if(Math.abs(delta)<1e-8){if(a[key]<=min||a[key]>=max)return false;continue;}
    const near=(min-a[key])/delta,far=(max-a[key])/delta;
    start=Math.max(start,Math.min(near,far));end=Math.min(end,Math.max(near,far));
    if(start>=end)return false;
  }
  return end>0&&start<1;
}
export function forestScreenArrow(from,to){
  return ['→','↘','↓','↙','←','↖','↑','↗'][(Math.round(Math.atan2(to.y-from.y,to.x-from.x)/(Math.PI/4))+8)%8];
}
// Place signs outward along their paths; keep every path pin and connector readable.
export function layoutForestSigns(boards, width, height, bear) {
  const gap=10;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w+gap,b.x+b.w)-Math.max(a.x-gap,b.x))*Math.max(0,Math.min(a.y+a.h+gap,b.y+b.h)-Math.max(a.y-gap,b.y));
  function arrange(order){
   const placed=[],lines=[],boxes=[];let total=0,violations=0;
   for(const index of order){const board=boards[index];
    const w=board.w,h=board.h,origin=board.origin||{x:bear.x+bear.w/2,y:bear.y+bear.h-24};
    const dx=board.x-origin.x,dy=board.y-origin.y,length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length;
    const reach=Math.abs(ux)*w/2+Math.abs(uy)*h/2+18;
    const ideal={x:board.x+ux*reach-w/2,y:board.y+uy*reach-h/2};
    let best,score=Infinity,bad=0;
    function consider(x,y){
      const r={x:clamp(x,8,width-w-8),y:clamp(y,8,height-h-8),w,h};
      const blocked=[bear,...placed].reduce((sum,b)=>sum+overlap(r,b),0);
      const line=signConnector(r,board);
      const coversPin=boards.filter(p=>p.x>r.x-10&&p.x<r.x+w+10&&p.y>r.y-10&&p.y<r.y+h+10).length;
      const crosses=placed.filter(p=>segmentCrossesBox(line,board,p,4)).length+lines.filter(l=>segmentCrossesBox(l.from,l.to,r,4)).length;
      const crossesBear=segmentCrossesBox(line,board,{...bear,h:Math.max(1,bear.h-24)});
      const wrongSide=(r.x+w/2-origin.x)*ux+(r.y+h/2-origin.y)*uy<0;
      const cost=blocked*1e9+(coversPin+crosses)*1e8+(crossesBear+wrongSide)*1e6+(r.x-ideal.x)**2+(r.y-ideal.y)**2;
      if(cost<score){score=cost;best=r;bad=Number(blocked>0)+coversPin+crosses;}
    }
    consider(ideal.x,ideal.y);
    for(const dx of [0,-1,1,-2,2])for(const dy of [0,-1,1,-2,2])consider(ideal.x+dx*(w+gap)/2,ideal.y+dy*(h+gap));
    if(score>=1e6)for(let y=8;y<=height-h-8;y+=12)for(let x=8;x<=width-w-8;x+=12)consider(x,y);
    placed.push(best);lines.push({from:signConnector(best,board),to:board});boxes[index]=best;total+=score;violations+=bad;
   }
   return{boxes,total,violations};
  }
  const order=boards.map((_,i)=>i);let best=arrange(order);
  // A cramped third branch may require moving an earlier board, not crossing it.
  if(best.violations){
   const alternatives=boards.length===3?[[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]:boards.length===2?[[1,0]]:[];
   for(const order of alternatives){const result=arrange(order);if(result.total<best.total)best=result;if(!best.violations)break;}
  }
  return best.boxes;
}
