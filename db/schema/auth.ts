import {
 boolean,
 index,
 pgTable,
 text,
 timestamp,
 uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
 id: text("id").primaryKey(),
 name: text("name").notNull(),
 email: text("email").notNull().unique(),
 emailVerified: boolean("email_verified").notNull().default(false),
 image: text("image"),
 createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
 updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
 id: text("id").primaryKey(),
 expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
 token: text("token").notNull().unique(),
 createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
 updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
 ipAddress: text("ip_address"),
 userAgent: text("user_agent"),
 userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
 activeOrganizationId: text("active_organization_id"),
}, (table) => [index("ix_session_user").on(table.userId)]);

export const account = pgTable("account", {
 id: text("id").primaryKey(),
 accountId: text("account_id").notNull(),
 providerId: text("provider_id").notNull(),
 userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
 accessToken: text("access_token"),
 refreshToken: text("refresh_token"),
 idToken: text("id_token"),
 accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
 refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
 scope: text("scope"),
 password: text("password"),
 createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
 updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("ix_account_user").on(table.userId)]);

export const verification = pgTable("verification", {
 id: text("id").primaryKey(),
 identifier: text("identifier").notNull(),
 value: text("value").notNull(),
 expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
 updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("ix_verification_identifier").on(table.identifier)]);

export const organization = pgTable("organization", {
 id: text("id").primaryKey(),
 name: text("name").notNull(),
 slug: text("slug").notNull().unique(),
 logo: text("logo"),
 createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
 metadata: text("metadata"),
}, (table) => [index("ix_organization_slug").on(table.slug)]);

export const member = pgTable("member", {
 id: text("id").primaryKey(),
 organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
 userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
 role: text("role").notNull().default("member"),
 createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
 index("ix_member_organization").on(table.organizationId),
 index("ix_member_user").on(table.userId),
 uniqueIndex("ux_member_organization_user").on(table.organizationId, table.userId),
]);

export const invitation = pgTable("invitation", {
 id: text("id").primaryKey(),
 organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
 email: text("email").notNull(),
 role: text("role"),
 status: text("status").notNull().default("pending"),
 expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
 inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [
 index("ix_invitation_organization").on(table.organizationId),
 index("ix_invitation_email").on(table.email),
]);
