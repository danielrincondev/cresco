/**
 * Eliminar un curso, con las mismas verificaciones que una alerta de
 * emergencia (pedido de Kenny, 27 de septiembre): escribir la palabra de
 * confirmación, marcar que se entiende qué pasa, y volver a confirmar la
 * contraseña en ese momento. El servidor verifica de nuevo la firma de Clerk
 * (`nucleo.eliminarCurso`).
 *
 * Eliminar oculta, no borra: la pantalla lo dice antes de pedir nada, porque
 * es justo lo que alguien quiere saber antes de hacerlo.
 */

import { useState } from "react";
import { useSession, useUser } from "@clerk/expo";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { api } from "../../convex/_generated/api";
import {
  Aviso,
  Boton,
  Campo,
  Casilla,
  Cuerpo,
  ErrorMensaje,
  Pagina,
  Tarjeta,
  Subtitulo,
  useOperacion,
} from "../components/NucleoUI";
import { tokenDeReautenticacion } from "../lib/reautenticar";

type Curso = FunctionReturnType<typeof api.nucleo.listarCursos>["cursos"][number];

const PALABRA = "ELIMINAR";

export function EliminarCurso({
  curso,
  onEliminado,
  onVolver,
}: {
  curso: Curso;
  onEliminado: () => void;
  onVolver: () => void;
}) {
  const { session } = useSession();
  const { user } = useUser();
  const eliminar = useAction(api.nucleo.eliminarCurso);
  const [confirmacion, setConfirmacion] = useState("");
  const [entendido, setEntendido] = useState(false);
  const [password, setPassword] = useState("");
  const op = useOperacion();

  const listo =
    !!session && user?.passwordEnabled === true && password.length > 0 &&
    entendido && confirmacion.trim().toUpperCase() === PALABRA;

  async function confirmar() {
    if (!listo || op.pendiente || !session) return;
    const clave = password;
    setPassword("");
    const r = await op.ejecutar(async () => {
      const tokenReautenticacion = await tokenDeReautenticacion(session, clave, "eliminar el curso");
      return await eliminar({ cursoId: curso.id, tokenReautenticacion });
    });
    if (r.ok) onEliminado();
  }

  return (
    <Pagina titulo="Eliminar curso" descripcion={curso.nombre} atras={{ onPress: onVolver }}>
      <Tarjeta>
        <Subtitulo>Qué pasa si lo eliminas</Subtitulo>
        <Cuerpo>
          El curso desaparece para ti y para las familias: dejan de ver sus
          reportes y ya no se puede anotar ni publicar en él.
        </Cuerpo>
        <Cuerpo>
          Las anotaciones, los reportes y las citas no se borran: quedan
          guardados, como exige la política de datos del piloto.
        </Cuerpo>
        <Cuerpo>Desde la aplicación no se puede deshacer.</Cuerpo>
      </Tarjeta>

      <Campo
        etiqueta={`Escribe ${PALABRA} para confirmar`}
        value={confirmacion}
        onChangeText={setConfirmacion}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!op.pendiente}
      />
      <Casilla
        texto="Entiendo que el curso desaparece para las familias"
        marcada={entendido}
        onChange={() => setEntendido(!entendido)}
        disabled={op.pendiente}
      />
      {user?.passwordEnabled ? (
        <Campo
          etiqueta="Confirma tu contraseña"
          ayuda="Verificamos tu identidad antes de eliminar el curso."
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          editable={!op.pendiente}
        />
      ) : (
        <Aviso>
          Tu cuenta necesita una contraseña para eliminar un curso. Si
          ingresaste con Google, configura primero una contraseña en tu cuenta.
        </Aviso>
      )}
      <ErrorMensaje mensaje={op.error} />
      <Boton tono="NEGATIVA" pendiente={op.pendiente} disabled={!listo} onPress={() => void confirmar()}>
        Eliminar curso
      </Boton>
      <Boton secundario onPress={onVolver}>
        Volver
      </Boton>
    </Pagina>
  );
}
