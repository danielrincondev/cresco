// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./viewer.ts", "./_generated/*.js"]);

describe("viewer.current", () => {
  it("returns the identity validated by Convex", async () => {
    const asDaniel = convexTest(schema, modules).withIdentity({
      email: "daniel@example.com",
      name: "Daniel",
      subject: "user_123",
    });

    await expect(asDaniel.query(api.viewer.current)).resolves.toEqual({
      email: "daniel@example.com",
      id: "user_123",
      name: "Daniel",
    });
  });

  it("rejects unauthenticated requests", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(api.viewer.current)).rejects.toThrow(
      "Authentication required",
    );
  });
});
