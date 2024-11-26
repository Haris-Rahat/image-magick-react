import * as Magick from "wasm-imagemagick";
export type IMagick = typeof Magick;

declare global {
  interface Window {
    magick: IMagick;
  }
}
declare module 'https://knicknic.github.io/wasm-imagemagick/magickApi.js' {
    const _Magick: IMagick;
    export = _Magick;
  }