export interface EncoderOptions { width:number;height:number;channels?:3|4;baseSize?:16|32|64;omitBits?:0|1|2|3|4;maxPixels?:number }
export declare function encode(pixels:Uint8Array|Uint8ClampedArray,options:EncoderOptions):Uint8Array;
