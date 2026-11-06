// Generalized size/preview baseline; SHP1 encoder and decoder stay untouched.
export function predictiveBaseline(rgba, width, height, baseSize) {
  let w=width,h=height,rgb=Uint8Array.from({length:w*h*3},(_,i)=>rgba[Math.floor(i/3)*4+i%3]);
  const levels=[{width:w,height:h,rgb}];
  while(w>baseSize||h>baseSize){
    const nw=Math.ceil(w/2),nh=Math.ceil(h/2),next=new Uint8Array(nw*nh*3);
    for(let y=0;y<nh;y++)for(let x=0;x<nw;x++)for(let c=0;c<3;c++){
      let sum=0,n=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)if(x*2+dx<w&&y*2+dy<h){sum+=rgb[((y*2+dy)*w+x*2+dx)*3+c];n++;}
      next[(y*nw+x)*3+c]=Math.round(sum/n);
    }w=nw;h=nh;rgb=next;levels.unshift({width:w,height:h,rgb});
  }
  let bytes=8,firstBytes;
  for(let l=0;l<levels.length;l++){
    const a=levels[l],prev=levels[l-1];
    for(let i=0;i<a.rgb.length;i++){
      const p=Math.floor(i/3),x=p%a.width,y=Math.floor(p/a.width),prediction=prev?prev.rgb[(Math.floor(y/2)*prev.width+Math.floor(x/2))*3+i%3]:0;
      const d=a.rgb[i]-prediction,z=d<0?-2*d-1:2*d;bytes+=z<128?1:2;
    }firstBytes??=bytes;
  }
  return {bytes,firstBytes,checkpoints:levels.length,base:levels[0]};
}
