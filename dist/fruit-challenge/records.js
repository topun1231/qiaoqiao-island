export const RECORD_KEY='qiaoqiao-island-fruit-records-v1';
const empty=()=>({easy:0,normal:0,hard:0});
function decode(raw){
 if(raw===null)return empty();
 const data=JSON.parse(raw);
 if(!data||Array.isArray(data)||typeof data!=='object')throw Error('Invalid records');
 const result=empty();
 for(const speed of Object.keys(result)){
  const value=data[speed]??0;
  if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid record');
  result[speed]=value;
 }
 return result;
}
export function createRecords(storage){
 let best=empty(),saved=true;
 function refresh(){
  try{
   const disk=decode(storage().getItem(RECORD_KEY));
   for(const speed of Object.keys(best))best[speed]=Math.max(best[speed],disk[speed]);
   return true;
  }catch{saved=false;return false;}
 }
 refresh();
 return{
  best:speed=>best[speed],get saved(){return saved;},refresh,
  record(speed,streak){
   if(!Object.hasOwn(best,speed)||!Number.isSafeInteger(streak)||streak<0)return false;
   const readable=refresh(),improved=streak>best[speed];
   best[speed]=Math.max(best[speed],streak);
   // Never overwrite unreadable data. A later catch can retry a failed save.
   if(readable){try{storage().setItem(RECORD_KEY,JSON.stringify(best));saved=true;}catch{saved=false;}}
   return improved;
  }
 };
}
