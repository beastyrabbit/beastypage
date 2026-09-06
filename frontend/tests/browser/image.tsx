import type { ImgHTMLAttributes } from "react";
export default function Image({
  fill: _fill,
  priority: _priority,
  unoptimized: _unoptimized,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
}) {
  return <img {...props} alt={props.alt ?? ""} />;
}
