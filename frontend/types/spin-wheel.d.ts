declare module "spin-wheel" {
  interface WheelItem {
    label: string;
    weight?: number;
    backgroundColor?: string;
    labelColor?: string;
  }

  interface WheelOptions {
    items?: WheelItem[];
    radius?: number;
    itemLabelRadius?: number;
    itemLabelRadiusMax?: number;
    itemLabelRotation?: number;
    itemLabelAlign?: string;
    itemLabelColors?: string[];
    itemLabelBaselineOffset?: number;
    itemLabelFont?: string;
    itemLabelFontSizeMax?: number;
    itemBackgroundColors?: string[];
    rotationSpeedMax?: number;
    rotationResistance?: number;
    lineWidth?: number;
    lineColor?: string;
    borderWidth?: number;
    borderColor?: string;
    isInteractive?: boolean;
    pointerAngle?: number;
    onRest?: (event: { currentIndex: number }) => void;
  }

  export class Wheel {
    constructor(container: Element, options?: WheelOptions);
    radius: number;
    itemLabelFontSizeMax: number;
    onRest?: (event: { currentIndex: number }) => void;
    spinToItem(itemIndex: number, duration: number, spinToCenter?: boolean, numberOfRevolutions?: number, direction?: number, easingFunction?: ((n: number) => number) | null): void;
    resize(): void;
    remove(): void;
  }
}
