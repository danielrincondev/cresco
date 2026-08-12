import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { guardarPerfilUsuario, obtenerBaseDatos } from "@cresco/db/acceso";
import {
 institucion,
 organization as organizationTable,
 user as userTable,
} from "@cresco/db/schema";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@cresco/db/schema";

const registroSchema = z.object({
 cedula: z.string().regex(/^\d{10}$/, "La cédula debe contener 10 dígitos."),
 telefono: z.string().regex(/^\+?\d{7,15}$/, "El teléfono no es válido."),
 rol: z.enum(["DOCENTE", "REPRESENTANTE"]),
});

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!databaseUrl || !secret || !baseURL || !googleClientId || !googleClientSecret) {
 throw new Error(
  "Varlock debe cargar DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET antes de iniciar el servidor.",
 );
}

const db = obtenerBaseDatos();

export const auth = betterAuth({
 appName: "Cresco",
 baseURL,
 secret,
 database: drizzleAdapter(db, {
  provider: "pg",
  schema,
 }),
 emailAndPassword: {
  enabled: true,
 },
 socialProviders: {
  google: {
   clientId: googleClientId,
   clientSecret: googleClientSecret,
   prompt: "select_account",
  },
 },
 databaseHooks: {
  user: {
   create: {
    before: async (_user, context) => {
     if (context?.path !== "/sign-up/email") return;
     const registro = registroSchema.safeParse(context?.body);
     if (!registro.success) {
      throw new APIError("BAD_REQUEST", {
       message: registro.error.issues[0]?.message ?? "Cédula, teléfono y rol son obligatorios.",
      });
     }
    },
    after: async (authUser, context) => {
     if (context?.path !== "/sign-up/email") return;
     const registro = registroSchema.parse(context?.body);
     try {
      await guardarPerfilUsuario(authUser.id, {
       numeroDocumento: registro.cedula,
       telefono: registro.telefono,
       rol: registro.rol,
      });
     } catch (error) {
      await db.delete(userTable).where(eq(userTable.id, authUser.id));
      throw error;
     }
    },
   },
  },
 },
 plugins: [
  organization({
   organizationHooks: {
    afterCreateOrganization: async ({ organization: nueva }) => {
     try {
      await db.insert(institucion).values({
       organizationId: nueva.id,
       nombreDeclarado: nueva.name,
      });
     } catch (error) {
      await db.delete(organizationTable).where(eq(organizationTable.id, nueva.id));
      throw error;
     }
    },
    afterUpdateOrganization: async ({ organization: actualizada }) => {
     if (!actualizada) return;
     await db
      .update(institucion)
      .set({
       nombreDeclarado: actualizada.name,
       actualizadoEn: new Date(),
      })
      .where(eq(institucion.organizationId, actualizada.id));
    },
   },
  }),
 ],
});
