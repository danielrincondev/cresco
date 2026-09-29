import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const estado = vi.hoisted(() => ({
  startVerification: vi.fn(),
  attemptFirstFactorVerification: vi.fn(),
  getToken: vi.fn(),
  eliminar: vi.fn(),
  passwordEnabled: true,
}));

vi.mock("react-native", async () => ({
  ...(await import("../test/mockReactNative")).reactNative(),
  Platform: { OS: "web" },
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));
vi.mock("@clerk/expo", () => ({
  useSession: () => ({ session: {
    startVerification: estado.startVerification,
    attemptFirstFactorVerification: estado.attemptFirstFactorVerification,
    getToken: estado.getToken,
  } }),
  useUser: () => ({ user: { passwordEnabled: estado.passwordEnabled } }),
}));
vi.mock("convex/react", () => ({ useAction: () => estado.eliminar }));

const { EliminarCurso } = await import("./EliminarCursoScreen");
const { Boton, Campo, Casilla } = await import("../components/NucleoUI");

const curso = { id: "curso", nombre: "Quinto A" } as React.ComponentProps<typeof EliminarCurso>["curso"];
let vista: ReactTestRenderer;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  estado.passwordEnabled = true;
  estado.startVerification.mockResolvedValue({ supportedFirstFactors: [{ strategy: "password" }] });
  estado.attemptFirstFactorVerification.mockResolvedValue({ status: "complete" });
  estado.getToken.mockResolvedValue("token-recien-emitido");
  estado.eliminar.mockResolvedValue({ matriculasRetiradas: 3 });
});

const boton = () => vista.root.findAllByType(Boton).find((b) => b.props.children === "Eliminar curso")!;
const escribir = (etiqueta: string, valor: string) =>
  act(async () => vista.root.findAllByType(Campo).find((c) => c.props.etiqueta === etiqueta)!.props.onChangeText(valor));

it("no deja eliminar hasta escribir ELIMINAR, marcar que entiende y dar la contraseña", async () => {
  const onEliminado = vi.fn();
  await act(async () => { vista = create(<EliminarCurso curso={curso} onEliminado={onEliminado} onVolver={() => {}} />); });
  expect(JSON.stringify(vista.toJSON())).toContain("no se borran");
  expect(boton().props.disabled).toBe(true);
  await escribir("Escribe ELIMINAR para confirmar", "eliminar");
  await act(async () => vista.root.findByType(Casilla).props.onChange());
  expect(boton().props.disabled).toBe(true);
  await escribir("Confirma tu contraseña", "secreta");
  expect(boton().props.disabled).toBe(false);

  await act(async () => boton().props.onPress());
  expect(estado.attemptFirstFactorVerification).toHaveBeenCalledWith({ strategy: "password", password: "secreta" });
  expect(estado.eliminar).toHaveBeenCalledWith({ cursoId: "curso", tokenReautenticacion: "token-recien-emitido" });
  expect(onEliminado).toHaveBeenCalled();
});

it("con la contraseña equivocada no elimina nada", async () => {
  estado.attemptFirstFactorVerification.mockRejectedValue(new Error("invalid password"));
  const onEliminado = vi.fn();
  await act(async () => { vista = create(<EliminarCurso curso={curso} onEliminado={onEliminado} onVolver={() => {}} />); });
  await escribir("Escribe ELIMINAR para confirmar", "ELIMINAR");
  await act(async () => vista.root.findByType(Casilla).props.onChange());
  await escribir("Confirma tu contraseña", "equivocada");
  await act(async () => boton().props.onPress());
  expect(estado.eliminar).not.toHaveBeenCalled();
  expect(onEliminado).not.toHaveBeenCalled();
  expect(JSON.stringify(vista.toJSON())).toContain("No pudimos verificar tu contraseña");
});

it("una cuenta sin contraseña no puede eliminar", async () => {
  estado.passwordEnabled = false;
  await act(async () => { vista = create(<EliminarCurso curso={curso} onEliminado={() => {}} onVolver={() => {}} />); });
  expect(JSON.stringify(vista.toJSON())).toContain("necesita una contraseña para eliminar un curso");
  expect(boton().props.disabled).toBe(true);
});
