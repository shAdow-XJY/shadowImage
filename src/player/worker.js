import { ShadowImageDecoder } from '../decoder.js';
let decoder;
self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'init') {
      decoder = new ShadowImageDecoder({ ...data.options,
        onHeader: header => self.postMessage({ type: 'header', header }),
        onFrame: frame => self.postMessage({ type: 'frame', frame }, [frame.rgba.buffer]),
      });
    } else if (type === 'push') await decoder.pushAsync(data.bytes);
    else if (type === 'finish') decoder.finish();
    else throw Error('Unknown worker message');
    self.postMessage({ type: 'ack', id, maxSliceMs: decoder.maxSliceMs });
  } catch (error) { self.postMessage({ type: 'error', id, message: error.message }); }
};
