import { Container, Text, TextStyle } from 'pixi.js';

export class PlaceholderScene extends Container {
  private titleText: Text;

  constructor(name: string) {
    super();

    this.titleText = new Text({
      text: name,
      style: new TextStyle({
        fill: 0xe6f1ff,
        fontSize: 28,
        fontWeight: '900',
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
      }),
    });

    // Cast only where StackBlitz's TS types are fussy
    (this.titleText as any).anchor.set(0.5);
    (this as any).addChild(this.titleText);
  }

  onEnter() {}
  onExit() {}

  layout(w: number, h: number) {
    (this.titleText as any).position.set(w / 2, h / 2);
  }
}
