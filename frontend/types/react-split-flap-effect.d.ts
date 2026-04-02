declare module "react-split-flap-effect" {
  import { ComponentType } from "react";

  export interface FlapDisplayProps {
    chars?: string;
    length?: number;
    value?: string;
    padChar?: string;
    padMode?: "auto" | "start" | "end";
    timing?: number;
    hinge?: boolean;
    withSound?: boolean | string;
    className?: string;
  }

  export const FlapDisplay: ComponentType<FlapDisplayProps>;

  export const Presets: {
    NUM: string;
    ALPHANUM: string;
    ALPHA: string;
  };
}
