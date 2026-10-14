import {isRoomDesign,roomObjectives} from './playability.js';
// Explain the controls, without choosing a solution or revealing the next key.
export function taskGuide(state) {
 const done=state.solved||state.phase==='complete';
 if(state.version<4||state.stageReady||done&&state.mode!=='room')return null;
 const guide=(title,controls,next)=>({title,controls,next});
 if(state.action)return guide('小熊正在完成动作','已经接收的按键不用重复按','等动作完成后，看新的目标和操作说明');
 const choices=(state.choices||[]).filter(c=>!c.disabled&&!c.done);
 const options=choices.map(c=>`${c.code||c.key}：${c.label}`).join('；');
 const shortCode=state.codeBuffer?`已输入 ${state.codeBuffer} · 接着输入剩余字母；Backspace 可删末字`:'短码从左到右逐个按，不用同时按，也不用回车';
 if(state.routeAdventure){
  if(state.level===4)return !state.route?guide(state.routeLeg?'到小岛了，再选一条路':'先选路，再输入石头短码','A：大石头路，3 跳 × 2 字母；H：捷径，2 跳 × '+(state.lessonStageIndex===2?4:3)+' 字母','两条都算完成；中途小岛可以换路，捷径有小鸭'):guide('输入当前石头的完整字母串','从左到右逐个按；打完整串跳一次，Backspace 可修正',state.codeBuffer?'已输入 '+state.codeBuffer:'站稳后再看下一块，不用按回车');
  return guide('自己选路，探索森林','输入任一路牌的完整短码；返回路也能走',state.codeBuffer?shortCode:'所有路都能通行；走过的小径会标记，探索不计错');
 }
 if(isRoomDesign(state))return guide(['布置阅读角','准备小表演','布置安静阅读角'][state.lessonStageIndex],state.held?'输入位置短码放下；左右都可选':'先输入物品短码拿起，再选放置位置',roomObjectives(state).map(goal=>`${goal.done?'✓':'○'} ${goal.label}`).join(' · '));
 if(state.contentVersion===5&&state.level===6)return guide(state.lessonStageIndex===2?'带齐两份，送到朋友身边':state.inventory.length?'保留篮中食物，去取另一份':'先决定取哪份野餐食物',state.stage==='select'?'输入目的地的完整短码':'输入前方路标短码，沿路前进',state.lessonStageIndex===2?'蜂蜜和果汁都已带齐，送到野餐地就完成':state.inventory.length?'已经取到的东西会一直放在篮子里':'蜂蜜和果汁都要取，顺序由你决定');
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
   if(state.level===9)return guide('照着完整目标，写好卡片','用键盘依次输入字母，按错可以直接重试','正确的前面不用重写；写完整后会自动收好，不用回车');
   return guide(state.level===10?'对照目标，修好卡片末尾':'照着完整目标，写好卡片','用键盘输入字母；Backspace 删除末尾一个字','正确的前面不用重写；写完整后会自动收好，不用回车');
  case 'mail':
   if(state.stage==='select')return guide('先选一位伙伴，一起玩野餐',`按键盘 ${options}`,'本段任选一位；选好后，照小纸条输入字母');
   return guide('照小纸条，写完整句话','用键盘依次输入字母；词与词之间按空格','Backspace 可删末字；写完整后自动完成，不用回车');
 }
 return null;
}
