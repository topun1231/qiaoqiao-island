// Explain the controls, without choosing a solution or revealing the next key.
export function taskGuide(state) {
 const done=state.solved||state.phase==='complete';
 if(state.version<4||state.stageReady||done&&state.mode!=='room')return null;
 const guide=(title,controls,next)=>({title,controls,next});
 if(state.action)return guide('小熊正在完成动作','已经接收的按键不用重复按','等动作完成后，看新的目标和操作说明');
 const choices=(state.choices||[]).filter(c=>!c.disabled&&!c.done);
 const options=choices.map(c=>`${c.code||c.key}：${c.label}`).join('；');
 const shortCode=state.codeBuffer?`已输入 ${state.codeBuffer} · 接着输入剩余字母；Backspace 可删末字`:'短码从左到右逐个按，不用同时按，也不用回车';
 switch(state.mode){
  case 'catch':
   if(state.stage==='select')return guide('先选一篮，开始装水果',`按键盘 ${state.orders.flatMap((order,i)=>state.orderCompleted?.includes(order.id)?[]:[`${order.code||order.key} 选${i?'右':'左'}篮`]).join('，')}`,state.orderCompleted?.length?'选好剩下的篮子，再按水果字母装满':'两个篮子都要装满，先选哪个都可以');
   if(state.catchStyle==='orders')return guide(`正在装：${state.activeOrder?.label||'野餐篮'}`,'看水果旁的字母和数量，按对应字母接水果','每按一次装一个；照清单把还缺的水果装齐');
   return guide('看清字母，接水果','按水果上的字母；小串从左到右依次按','每按一次接一个，可以慢慢按，也可以连贯输入');
  case 'stone':
   if(state.level===4&&!state.route)return guide('先选一条路，跳向岸边',`按键盘 ${choices.map(c=>c.key).join(' 或 ')}，选择以这个字母开头的路线`,'两条都能到岸边；第一键既选路，也跳第一步');
   return guide('按石头上的字母，继续过河','沿所选路线，从小熊前方的石头开始依次按','每按一次跳一步；走完这一小段，再看下一段');
  case 'forest':
   if(state.level===6&&state.stage==='select')return guide(state.lessonStageIndex===2?'选一条回程路，把点心送给朋友':state.inventory?.length?'带上这一份，再去取另一份':'先选一处，出发取点心','输入想去的地点旁的完整短码',state.codeBuffer?shortCode:state.lessonStageIndex===2?'两条回程路任选一条，选好后继续看路口线索':state.inventory?.length?'沿路口线索取回另一份，再把两份送给朋友':'蜂蜜和果汁都要取，先去哪一处都可以');
   return guide('读线索，选对应的路牌','输入符合线索的路牌短码，小熊就会沿路走',shortCode);
  case 'room':
   if(state.held)return guide(`已拿起：${state.items.find(i=>i.key===state.held)?.label||'物品'}`,'看物品用途，输入合适位置的本次收纳码',shortCode);
   return guide(done?'继续自由布置':'先拿一件物品，再选位置','输入物品旁的完整拿取码，小熊就会拿起它',state.codeBuffer?shortCode:done?'可以继续搬动；想结束时点左上角「冒险地图」':'拿起后，再输入合适位置的收纳码；短码逐个按，不用回车');
  case 'card':
   return guide(state.level===10?'对照目标，修好卡片末尾':'照着完整目标，写好卡片','用键盘输入字母；Backspace 删除末尾一个字','正确的前面不用重写；写完整后会自动收好，不用回车');
  case 'mail':
   if(state.stage==='select')return guide('先选一位伙伴，一起玩野餐',`按键盘 ${options}`,'本段任选一位；选好后，照小纸条输入字母');
   return guide('照小纸条，写完整句话','用键盘依次输入字母；词与词之间按空格','Backspace 可删末字；写完整后自动完成，不用回车');
 }
 return null;
}
