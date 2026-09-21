import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DesignerChannelForm } from "../../../lib/lighting/partitura-model";
import { createDefaultPartituraDocument, normalizeDefaultSignLayout } from "../../../lib/lighting/partitura-model";
import {
  channelBorderPolylines,
  channelCenterPolyline,
  channelIsClosed,
  distanceToChannelCenter,
  setChannelNodeType,
  smoothBezierPoints
} from "./designer-geometry";

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 }
];

function closedBezierChannel(): DesignerChannelForm {
  return {
    id: "channel_test",
    name: "Channel test",
    points: smoothBezierPoints(square),
    pathMode: "bezier",
    widthMm: 10,
    closed: true,
    cap: "butt",
    visible: true,
    locked: false,
    opacity: 1
  };
}

describe("closed channel geometry", () => {
  it("stays closed while every Bezier node is converted to a corner or straight node", () => {
    for (const nodeType of ["corner", "straight"] as const) {
      let channel = closedBezierChannel();

      for (let index = 0; index < channel.points.length; index += 1) {
        channel = setChannelNodeType(channel, index, nodeType);
        assert.equal(channelIsClosed(channel), true);

        const center = channelCenterPolyline(channel);
        assert.ok(center.length >= 4);
        assert.notDeepEqual(center.at(-1), center[0]);

        const borders = channelBorderPolylines(channel);
        assert.equal(borders.left.length, center.length);
        assert.equal(borders.right.length, center.length);
      }

      assert.deepEqual(channelCenterPolyline(channel), square);
      assert.ok(Math.abs(distanceToChannelCenter(channel, { x: 0, y: 5 })) < 1e-8);
    }
  });

  it("does not invent a closing edge for an open channel", () => {
    const channel = { ...closedBezierChannel(), points: square, closed: false };
    assert.equal(channelIsClosed(channel), false);
    assert.ok(Math.abs(distanceToChannelCenter(channel, { x: 0, y: 5 }) - 5) < 1e-8);
  });

  it("migrates legacy cap=closed documents to the explicit topology flag", () => {
    const document = createDefaultPartituraDocument("legacy_channel_test");
    document.designer!.channels = [{
      ...closedBezierChannel(),
      closed: undefined,
      cap: "closed"
    } as unknown as DesignerChannelForm];

    const [channel] = normalizeDefaultSignLayout(document).designer.channels;
    assert.equal(channel.closed, true);
    assert.equal(channel.cap, "butt");
  });
});
