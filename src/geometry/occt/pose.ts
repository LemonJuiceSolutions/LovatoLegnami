import { Transformation, cast, makeAx3, type Shape3D } from "replicad";
import type { Pose } from "@/domain/components/types";
import { axisOf, originOf } from "@/domain/math/mat4";
import { cross, dot, norm } from "@/domain/math/vec3";
import { occt } from "./init";

const RIGID_TOLERANCE = 1e-6;

/**
 * Copia del solido (in locale pezzo) portata nel sistema assieme con la posa
 * del pezzo. La posa deve essere rigida (assi ortonormali destrorsi), come
 * nel writer SAT; altrimenti lancia un errore.
 */
export function placeShape(shape: Shape3D, pose: Pose): Shape3D {
  const x = axisOf(pose, 0);
  const y = axisOf(pose, 1);
  const z = axisOf(pose, 2);
  const o = originOf(pose);
  const rigid =
    Math.abs(norm(x) - 1) < RIGID_TOLERANCE &&
    Math.abs(norm(z) - 1) < RIGID_TOLERANCE &&
    Math.abs(dot(x, z)) < RIGID_TOLERANCE &&
    Math.abs(dot(cross(z, x), y) - 1) < RIGID_TOLERANCE;
  if (!rigid) throw new Error("posa non rigida");
  const oc = occt();
  const from = new oc.gp_Ax3();
  const to = makeAx3([o.x, o.y, o.z], [z.x, z.y, z.z], [x.x, x.y, x.z]);
  const transformation = new Transformation(new oc.gp_Trsf());
  try {
    transformation.wrapped.SetDisplacement(from, to);
    return cast(transformation.transform(shape.wrapped)) as Shape3D;
  } finally {
    from.delete();
    to.delete();
    transformation.delete();
  }
}
