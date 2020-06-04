import { IRectangle } from './interfaces';

export function addPadding(r: IRectangle, padding: number): IRectangle;
export function addPadding(r: ReadonlyArray<IRectangle>, padding: number): ReadonlyArray<IRectangle>;
export function addPadding(
  r: IRectangle | ReadonlyArray<IRectangle>,
  padding: number
): IRectangle | ReadonlyArray<IRectangle> {
  const map = (r: IRectangle) => ({
    x: r.x - padding,
    y: r.y - padding,
    width: r.width + 2 * padding,
    height: r.height + 2 * padding,
  });
  if (Array.isArray(r)) {
    return r.map(map);
  }
  return map(r as IRectangle);
}
