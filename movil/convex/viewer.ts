import { query } from "./_generated/server";

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (identity === null) {
      throw new Error("Authentication required");
    }

    return {
      email: identity.email ?? null,
      id: identity.subject,
      name: identity.name ?? null,
    };
  },
});
