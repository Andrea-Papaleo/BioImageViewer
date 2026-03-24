import type { Shape } from "@/types";

export const shapeToArray = (
  shape: Shape,
): [number, number, number, number] => {
  return [shape.planes, shape.height, shape.width, shape.channels];
};
