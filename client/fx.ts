import * as THREE from 'three';
/** 주소에 ?fx=low 가 있으면 저사양 모드: 그림자·환경 반사를 끄고 가벼운 재질을 쓴다 */
export const LOW = new URLSearchParams(location.search).get('fx') === 'low';
type P = { color?: number; map?: THREE.Texture; roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number; transparent?: boolean; opacity?: number; polygonOffset?: boolean; polygonOffsetFactor?: number };
export function surface(p: P): THREE.Material {
  if (!LOW) return new THREE.MeshStandardMaterial(p);
  const { roughness, metalness, ...rest } = p;
  return new THREE.MeshLambertMaterial(rest);
}
