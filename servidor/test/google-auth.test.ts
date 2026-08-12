import { auth } from "@/lib/auth";
import { describe, expect, it, vi } from "vitest";

const { GOOGLE_CLIENT_ID } = vi.hoisted(() => {
 const googleClientId = "test-client-id.apps.googleusercontent.com";
 process.env.DATABASE_URL = "postgresql://cresco_app:cresco_app_dev@localhost:5432/cresco";
 process.env.BETTER_AUTH_SECRET = "test-secret-at-least-32-characters-long";
 process.env.BETTER_AUTH_URL = "http://localhost:3000";
 process.env.GOOGLE_CLIENT_ID = googleClientId;
 process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
 return { GOOGLE_CLIENT_ID: googleClientId };
});

describe("autenticación con Google", () => {
 it("configura el proveedor con las credenciales validadas", () => {
  expect(auth.options.baseURL).toBe("http://localhost:3000");
  expect(auth.options.socialProviders?.google).toMatchObject({
   clientId: GOOGLE_CLIENT_ID,
   clientSecret: "test-google-client-secret",
   prompt: "select_account",
  });
 });
});
