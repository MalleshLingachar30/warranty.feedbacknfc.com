declare module "bwip-js" {
  interface ToSvgOptions {
    bcid: string;
    text: string;
    scale?: number;
    paddingwidth?: number;
    paddingheight?: number;
  }

  interface BwipJsModule {
    toSVG(options: ToSvgOptions): string;
  }

  const bwipjs: BwipJsModule;
  export default bwipjs;
}
