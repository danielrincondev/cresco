import { auth } from "@/lib/auth";
import { ErrorHttp } from "@/lib/http";

export interface SesionAplicacion {
 userId: string;
 activeOrganizationId: string | null;
}

export async function exigirSesion(request: Request): Promise<SesionAplicacion> {
 const sesion = await auth.api.getSession({ headers: request.headers });
 if (!sesion) {
  throw new ErrorHttp(401, "NO_AUTENTICADO", "Debe iniciar sesión.");
 }

 return {
  userId: sesion.user.id,
  activeOrganizationId: sesion.session.activeOrganizationId ?? null,
 };
}
