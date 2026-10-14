export const isRoomDesign = state => state.contentVersion === 5 && state.level === 8;

export function roomObjectives(state) {
 const p=state.placements||{},same=(...keys)=>Boolean(p[keys[0]])&&keys.every(key=>p[key]===p[keys[0]]);
 const performance=state.lessonStageIndex===1,anchor=performance?'B':'F',other=performance?'F':'B';
 return [
  {label:performance?'灯和玩具篮放一起':state.lessonStageIndex===2?'书、灯、软垫放一起':'书和灯放一起',done:performance?same('D','B'):state.lessonStageIndex===2?same('F','D','V'):same('F','D')},
  {label:performance?'书留在另一边':'玩具篮放另一边',done:Boolean(p[anchor]&&p[other])&&p[anchor]!==p[other]},
  {label:'四件都摆好，每处最多三件',done:['F','D','V','B'].every(key=>['M','N'].includes(p[key]))&&['M','N'].every(zone=>Object.values(p).filter(value=>value===zone).length<=3)},
 ];
}

export function applyPlayability(state) {
 if(state.contentVersion!==5)return;
 const n=state.lessonStageIndex;
 if(state.level===6){
  state.stageDescription=['先取蜂蜜还是果汁由你决定；沿路标取到第一份，放进随身篮子','带着已经取到的食物，再去另一处取齐第二份','篮子装齐了，从最后一处沿路标直接送到朋友身边'][n];
  for(const task of state.tasks){
   if(n===2)task.label='送到朋友身边';
   for(const fork of task.forks){
    fork.branches=fork.branches.filter(branch=>branch.key===fork.correct);
    fork.clue=n===2?'两份食物都在篮子里，沿路标送到野餐地':`沿路标前进，去取${task.item}`;
   }
  }
 }
 if(isRoomDesign(state)){
  state.stageDescription=['布置阅读角：书和灯在一起，玩具在另一边；软垫由你安排','改成表演角：把灯移到玩具篮旁，书留在另一边；软垫由你安排','准备安静阅读：书、灯、软垫在一起，玩具留在另一边'][n]+'。窗边和靠墙都能用，每处最多三件';
  for(const item of state.items)delete item.goalZone;
  for(const task of state.tasks)delete task.goalZone;
  state.zones.forEach(zone=>{zone.label=zone.key==='M'?'窗边角':'靠墙角';zone.capacity=3;});
  state.total=3;
 }
 if(state.level===12){
  const texts=[
   [['hello rabbit','hello bear','hello deer'],['roll a ball','build a tower','fly a kite'],['share a pear','pour the juice','pass a cake']],
   [['hi rabbit','hi bear','hi deer'],['roll the blue ball','build a tall tower','fly the red kite'],['share the sweet pear','pour fresh juice','pass the jam cake']],
  ][state.seed%2][n];
  state.friends.forEach((friend,i)=>friend.text=texts[i]);state.tasks=state.friends.map(friend=>({...friend}));
  state.stageDescription=['选择一位朋友打招呼，写好问候后朋友会挥手回应','选择滚球、搭积木或放风筝；写好短句就一起玩，成果会留在野餐地','选择分梨、倒果汁或递蛋糕；写好短句就把对应点心分享给朋友'][n];
 }
 state.message=state.stageDescription;
}
