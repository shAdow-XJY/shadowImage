import { ShadowImagePlayer } from '../dist/index.js';
const $=id=>document.getElementById(id);let player;
window.shadowEvents=[];
try{
const response=await fetch('/experiments/generated/manifest.json');if(!response.ok)throw Error('请先运行 npm run corpus');
const samples=await response.json();for(const s of samples){const option=document.createElement('option');option.value=s.id;option.textContent=`${s.id} · ${s.width}×${s.height}`;$('sample').append(option);}
const reference=()=>{$('reference').src=`/experiments/generated/${$('sample').value}.png`;};$('sample').onchange=reference;reference();$('status').textContent='准备就绪，点击开始。';
$('start').onclick=async()=>{
 player?.destroy();window.shadowEvents=[];window.shadowResult=null;$('log').textContent='';$('status').textContent='连接中…';
 const events=window.shadowEvents;
 player=new ShadowImagePlayer({canvas:$('canvas'),execution:$('execution').value,url:`/experiments/generated/${$('sample').value}${$('quality').value}.shp?rate=${$('rate').value}`,
 onProgress:e=>{events.push(e);if(e.stage==='frame'){$('status').textContent=`${e.final?'最终画面':'渐进重建'} · ${e.width}×${e.height} · ${(e.bytes/1024).toFixed(1)} KiB · ${Math.round(e.elapsedMs)} ms`;}
 if(e.stage!=='download'){$('log').textContent+=JSON.stringify(e)+'\n';$('log').scrollTop=$('log').scrollHeight;}},onError:e=>$('status').textContent=`错误：${e.message}`});
 window.shadowPlayer=player;const active=player;try{const result=await active.start();if(player===active)window.shadowResult=result;}catch(e){if(player===active)window.shadowResult={status:'error',message:e.message};}
};$('stop').onclick=()=>{player?.stop();$('status').textContent='已停止，保留最后画面。';};
}catch(e){$('status').textContent=e.message;}
