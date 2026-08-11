import { describe, expect, it } from "vitest";
import {
  DEFAULT_BONE_CONNECTIONS,
  cloneConnections,
  connectedJointIndices,
  connectionKey,
  createMotionProject,
  findRestorableConnection,
  parseMotionProject,
  removedDefaultConnections,
} from "./editor-model";

describe("editable bone connections", () => {
  it("creates projects with every default pose connection", () => {
    const project = createMotionProject();
    expect(project.skeleton.connections).toEqual(DEFAULT_BONE_CONNECTIONS);
    expect(project.skeleton.connections).not.toBe(DEFAULT_BONE_CONNECTIONS);
  });

  it("tracks removed connections and isolated joints", () => {
    const removedKeys = new Set([
      connectionKey([29, 31]),
      connectionKey([27, 31]),
    ]);
    const connections = cloneConnections(DEFAULT_BONE_CONNECTIONS).filter(
      (connection) => !removedKeys.has(connectionKey(connection)),
    );
    expect(removedDefaultConnections(connections)).toEqual([[29, 31], [27, 31]]);
    expect(connectedJointIndices(connections).has(31)).toBe(false);
    expect(connectedJointIndices(connections).has(27)).toBe(true);
  });

  it("migrates legacy version-one projects without connection data", () => {
    const { skeleton: _skeleton, ...legacyProject } = createMotionProject();
    const migrated = parseMotionProject(legacyProject);
    expect(migrated.skeleton.connections).toEqual(DEFAULT_BONE_CONNECTIONS);
  });

  it("only offers a dashed restore candidate for a removed original connection", () => {
    const active = cloneConnections(DEFAULT_BONE_CONNECTIONS).filter(
      (connection) => connectionKey(connection) !== connectionKey([11, 13]),
    );
    expect(findRestorableConnection([11, 13], active)).toEqual([11, 13]);
    expect(findRestorableConnection([11, 12], active)).toBeNull();
    expect(findRestorableConnection([7, 8], active)).toBeNull();
    expect(findRestorableConnection([11], active)).toBeNull();
  });
});
