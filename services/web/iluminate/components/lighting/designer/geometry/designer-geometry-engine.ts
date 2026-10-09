/**
 * Public boundary for layer-agnostic vector operations. Existing callers may
 * still use the compatibility barrel while phase 2 moves them incrementally.
 */
export {
  channelBorderPolylines,
  channelCenterPolyline,
  channelContainsPoint,
  channelIsClosed,
  channelWidthCm,
  deleteChannelPoint,
  deletePolygonPoint,
  designerShapePointCount,
  designerShapePointLocation,
  insertChannelPoint,
  insertPolygonPoint,
  movedChannel,
  movedShape,
  movedWorkLine,
  nearestChannelInsertIndex,
  nearestShapeInsertIndex,
  pickPolygonPointHit,
  pickShapePointHit,
  pickBezierHandle,
  pointInsideDesignerShape,
  pointNearShapeStroke,
  pointsBounds,
  primitiveShapeBounds,
  rectanglePoints,
  resizedBuildArea,
  resizedZone,
  shapeInsertIndexAtPoint,
  setChannelNodeType,
  setPolygonNodeType,
  smoothBezierPoints,
  smoothOpenBezierPoints,
  updateBezierHandle,
  updateChannelBezierHandle,
  updateChannelPoint,
  updatePolygonPoint,
  updateWorkLinePoint
} from "../designer-geometry";
export {
  applyDesignerBooleanOperation,
  validateDesignerGeometryTopology,
  type DesignerBooleanOperation,
  type DesignerBooleanResult,
  type DesignerTopologyIssue
} from "./designer-geometry-boolean";
