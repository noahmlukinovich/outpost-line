/**
 * Loads a Tiled map (.tmj / JSON, object layers only) into the game's map model.
 *
 * Layers the loader understands (all object layers):
 *   paths  – polylines. Name = path id (e.g. "path_a"). Property `width` (float). Enemies walk
 *            from the first point to the last; the last point is the outpost gate (exit).
 *   zones  – polygons with property `kind` = "blocked" (cliffs, water, rocks) or "buildable".
 *            If no "buildable" zones exist, the whole map is buildable except blocked zones.
 *            Optional `look` = rock | water | cliff (visual only).
 *   cover  – points with property `coverType` = sandbags | trench | ruins | bunker.
 *   decor  – points with property `prop` = floodlight | crate | wreck (visual only).
 */
import { Cover } from '../data/cover';
import { Path, distToPolygonEdge, pointInPolygon, type Vec } from './geometry';

export type ZoneKind = 'blocked' | 'buildable';

export interface Zone {
  kind: ZoneKind;
  look: string;
  poly: Vec[];
}

export interface CoverPoint {
  index: number;
  type: string;
  x: number;
  y: number;
}

export interface DecorPoint {
  prop: string;
  x: number;
  y: number;
}

export interface MapModel {
  name: string;
  biome: string;
  width: number;
  height: number;
  paths: Path[];
  zones: Zone[];
  cover: CoverPoint[];
  decor: DecorPoint[];
}

interface TiledProperty {
  name: string;
  type?: string;
  value: unknown;
}
interface TiledObject {
  name: string;
  x: number;
  y: number;
  point?: boolean;
  polyline?: Vec[];
  polygon?: Vec[];
  properties?: TiledProperty[];
}
interface TiledLayer {
  name: string;
  type: string;
  objects?: TiledObject[];
}
interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  properties?: TiledProperty[];
  layers: TiledLayer[];
}

function prop<T>(props: TiledProperty[] | undefined, name: string, fallback: T): T {
  const p = props?.find((q) => q.name === name);
  return p === undefined ? fallback : (p.value as T);
}

function layer(map: TiledMap, name: string): TiledObject[] {
  return map.layers.find((l) => l.type === 'objectgroup' && l.name === name)?.objects ?? [];
}

const absolute = (o: TiledObject, pts: Vec[]): Vec[] => pts.map((p) => ({ x: o.x + p.x, y: o.y + p.y }));

export function loadTiledMap(json: string): MapModel {
  const map = JSON.parse(json) as TiledMap;
  const model: MapModel = {
    name: prop(map.properties, 'name', 'Unnamed'),
    biome: prop(map.properties, 'biome', 'ashlands'),
    width: map.width * map.tilewidth,
    height: map.height * map.tileheight,
    paths: [],
    zones: [],
    cover: [],
    decor: [],
  };

  for (const o of layer(map, 'paths')) {
    if (!o.polyline) throw new Error(`Map: object "${o.name}" in "paths" must be a polyline`);
    model.paths.push(new Path(o.name || `path_${model.paths.length}`, absolute(o, o.polyline), prop(o.properties, 'width', 56)));
  }
  for (const o of layer(map, 'zones')) {
    if (!o.polygon) throw new Error(`Map: object "${o.name}" in "zones" must be a polygon`);
    const kind = prop<string>(o.properties, 'kind', 'blocked');
    if (kind !== 'blocked' && kind !== 'buildable') throw new Error(`Map: zone "${o.name}" has unknown kind "${kind}"`);
    model.zones.push({ kind, look: prop(o.properties, 'look', 'rock'), poly: absolute(o, o.polygon) });
  }
  for (const o of layer(map, 'cover')) {
    const type = prop(o.properties, 'coverType', o.name);
    if (!(type in Cover)) throw new Error(`Map: cover point has unknown coverType "${type}"`);
    model.cover.push({ index: model.cover.length, type, x: o.x, y: o.y });
  }
  for (const o of layer(map, 'decor')) {
    model.decor.push({ prop: prop(o.properties, 'prop', o.name), x: o.x, y: o.y });
  }

  if (model.paths.length === 0) throw new Error('Map: needs at least one path in the "paths" layer');
  return model;
}

/** True if (x, y) is inside the map, inside buildable terrain, and at least `radius` from blocked terrain. */
export function isTerrainBuildable(map: MapModel, x: number, y: number, radius: number): boolean {
  const margin = 12;
  if (x < radius + margin || y < radius + margin || x > map.width - radius - margin || y > map.height - radius - margin) {
    return false;
  }
  let hasBuildableZones = false;
  let inBuildable = false;
  for (const z of map.zones) {
    if (z.kind === 'blocked') {
      if (pointInPolygon(x, y, z.poly) || distToPolygonEdge(x, y, z.poly) < radius) return false;
    } else {
      hasBuildableZones = true;
      if (pointInPolygon(x, y, z.poly)) inBuildable = true;
    }
  }
  return hasBuildableZones ? inBuildable : true;
}
