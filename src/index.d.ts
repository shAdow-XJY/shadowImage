export interface ImageHeader { width:number; height:number; channels:3|4; baseSize:16|32|64; omitBits:number; lossless:boolean }
export interface ProgressiveFrame { rgba:Uint8ClampedArray; width:number; height:number; targetWidth:number; targetHeight:number; level:number; plane:number; bytes:number; final:boolean }
export interface DecoderOptions { onFrame?:(frame:ProgressiveFrame)=>void; onHeader?:(header:ImageHeader)=>void; maxPixels?:number; maxPacketBytes?:number; maxBufferedBytes?:number; frameIntervalMs?:number }
export declare class ShadowImageDecoder {
  constructor(options?:DecoderOptions);
  readonly header?:ImageHeader; readonly done:boolean; readonly failed:boolean; readonly bytes:number; readonly maxSliceMs:number;
  push(bytes:Uint8Array):void;
  pushAsync(bytes:Uint8Array,options?:{budgetMs?:number;signal?:AbortSignal}):Promise<void>;
  finish():ImageHeader;
}
export type ImageSource=string|URL|Uint8Array|ReadableStream<Uint8Array>;
export interface PlayerOptions {
  canvas:HTMLCanvasElement;url?:string|URL;stream?:ReadableStream<Uint8Array>;execution?:'auto'|'main';workerUrl?:string|URL;
  fetchOptions?:RequestInit;maxStreamBytes?:number;limits?:Pick<DecoderOptions,'maxPixels'|'maxPacketBytes'|'maxBufferedBytes'>;
  onFrame?:(frame:ProgressiveFrame)=>void;onError?:(error:Error)=>void;onProgress?:(event:{stage:string;[key:string]:unknown})=>void;
}
export type PlaybackResult={status:'stopped'}|{status:'complete';bytes:number;elapsedMs:number;maxSliceMs:number};
export declare class ShadowImagePlayer {
  constructor(options:PlayerOptions);readonly state:'idle'|'loading'|'stopped'|'complete'|'error'|'destroyed';
  start(source?:ImageSource):Promise<PlaybackResult>;stop():void;destroy():void;
}
