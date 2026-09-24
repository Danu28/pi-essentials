declare module "@earendil-works/pi-coding-agent" {
  export interface ExtensionAPI {
    on(event: string, handler: (ev: any, ctx: any) => any): void;
    registerTool(tool: any): void;
    registerCommand(name: string, cmd: any): void;
    appendEntry?: (key: string, value: any) => Promise<void>;
  }
}
declare module "typebox" {
  export const Type: any;
}
