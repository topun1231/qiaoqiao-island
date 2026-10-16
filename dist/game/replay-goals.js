// Only fully observed rounds earn records; legacy saves never become zero-error runs.
export function cleanReplayRecords(value){
 const records={};
 for(let level=1;level<=12;level++){
  const r=value?.[level];
  if(!r||!Number.isSafeInteger(r.bestWrong)||r.bestWrong<0||r.bestWrong>1000000||!Number.isSafeInteger(r.bestHelp)||r.bestHelp<0||r.bestHelp>1000000)continue;
  records[level]={bestWrong:r.bestWrong,bestHelp:r.bestHelp};
 }
 return records;
}
export function recordReplay(data,state,metrics){
 if(!(state.solved||state.phase==='complete')||state.startStageIndex!==0||!metrics||metrics.level!==state.level||metrics.seed!==state.seed||metrics.stages.length!==3||!metrics.stages.every(s=>s.observed))return false;
 const old=data.replayRecords?.[state.level];
 const next={bestWrong:Math.min(old?.bestWrong??Infinity,metrics.wrong),bestHelp:Math.min(old?.bestHelp??Infinity,metrics.help)};
 if(old&&old.bestWrong===next.bestWrong&&old.bestHelp===next.bestHelp)return false;
 (data.replayRecords??={})[state.level]=next;return true;
}
export const stampCount=r=>r?Number(r.bestHelp===0)+Number(r.bestWrong===0):0;
export function replayGoal(record,metrics){
 if(!metrics)return '挑战印章：从头重玩并完成三段后记录';
 const goal=record?.bestHelp!==0?'全关不求助':record?.bestWrong!==0?'全关零错按':'再拿双印章';
 return `挑战：${goal} · 本轮提示 ${metrics.help} / 错按 ${metrics.wrong}`;
}
