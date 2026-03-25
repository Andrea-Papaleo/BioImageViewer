import type { Shape, ShapeArray } from "@/types";

export const shapeToArray = (shape: Shape): ShapeArray => {
  return [shape.planes, shape.height, shape.width, shape.channels];
};

export const arrayToShape = (array: ShapeArray): Shape => ({
  planes: array[0],
  height: array[1],
  width: array[2],
  channels: array[3],
});
