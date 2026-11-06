// Experimental predictive pyramid. Each level depends on the previous one.
const MAX = 4_000_000;
function dimensions(w,h) {
  const a=[[w,h]];
  while(w>8||h>8){w=Math.ceil(w/2);h=Math.ceil(h/2);a.unshift([w,h]);}
  return a;
}
export function encode(rgb,w,h) {
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>MAX||rgb.length!==w*h*3) throw Error('Invalid RGB dimensions');
  const dims=dimensions(w,h), levels=[rgb];
  for(let i=dims.length-2;i>=0;i--){
    const [nw,nh]=dims[i], [pw,ph]=dims[i+1], prev=levels[0], out=new Uint8Array(nw*nh*3);
    for(let y=0;y<nh;y++)for(let x=0;x<nw;x++)for(let c=0;c<3;c++){
      let sum=0,n=0;
      for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)if(x*2+dx<pw&&y*2+dy<ph){sum+=prev[((y*2+dy)*pw+x*2+dx)*3+c];n++;}
      out[(y*nw+x)*3+c]=Math.round(sum/n);
    } levels.unshift(out);
  }
  const bytes=[83,72,80,49,w>>>8,w&255,h>>>8,h&255];
  for(let i=0;i<levels.length;i++){
    const [lw,lh]=dims[i], prev=levels[i-1], pw=i?dims[i-1][0]:0;
    for(let y=0;y<lh;y++)for(let x=0;x<lw;x++)for(let c=0;c<3;c++){
      const prediction=i?prev[(Math.floor(y/2)*pw+Math.floor(x/2))*3+c]:0;
      const d=levels[i][(y*lw+x)*3+c]-prediction, z=d<0?-d*2-1:d*2;
      if(z<128)bytes.push(z);else bytes.push((z&127)|128,z>>>7);
    }
  }
  return Uint8Array.from(bytes);
}
export class Decoder {
  constructor(onLevel=()=>{}) {this.onLevel=onLevel;this.header=[];this.index=0;this.level=0;this.pending=-1;this.done=false;this.bytes=0;}
  push(chunk){for(const b of chunk){
    this.bytes++;
    if(this.done)throw Error('Trailing bytes');
    if(this.header.length<8){
      this.header.push(b);
      if(this.header.length===8){
        const a=this.header;if(a.slice(0,4).join()!=='83,72,80,49')throw Error('Bad magic');
        this.width=a[4]*256+a[5];this.height=a[6]*256+a[7];
        if(!this.width||!this.height||this.width*this.height>MAX)throw Error('Dimensions exceed limit');
        this.dims=dimensions(this.width,this.height);this.alloc();
      }continue;
    }
    let z=b;
    if(this.pending>=0){if(b>3)throw Error('Invalid residual');z=this.pending+(b<<7);this.pending=-1;}
    else if(b&128){this.pending=b&127;continue;}
    const d=z&1?-(z+1)/2:z/2;
    const [w,h]=this.dims[this.level], pixel=Math.floor(this.index/3),c=this.index%3;
    const prediction=this.level?this.prev[(Math.floor(Math.floor(pixel/w)/2)*this.dims[this.level-1][0]+Math.floor((pixel%w)/2))*3+c]:0;
    const value=prediction+d;if(value<0||value>255)throw Error('Invalid reconstructed sample');
    this.current[this.index++]=value;
    if(this.index===w*h*3){
      this.onLevel({rgb:this.current,width:w,height:h,bytes:this.bytes,level:this.level});
      this.prev=this.current;this.level++;this.done=this.level===this.dims.length;if(!this.done)this.alloc();
    }
  }}
  alloc(){const [w,h]=this.dims[this.level];this.current=new Uint8Array(w*h*3);this.index=0;}
  finish(){if(!this.done)throw Error('Truncated stream');}
}
