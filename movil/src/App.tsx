import { ClerkProvider, useAuth, useSignIn, useSignUp } from "@clerk/expo";
import { useSSO } from "@clerk/expo/experimental";
import { tokenCache } from "@clerk/expo/token-cache";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useState } from "react";
import {
  Authenticated,
  AuthLoading,
  ConvexReactClient,
  Unauthenticated,
} from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

import { Marca, Semantico, Superficie, Texto } from "./theme/Theme";
// Se importa peso por peso, no desde `@expo-google-fonts/inter`. El paquete
// barril arrastra sus 18 archivos .ttf al bundle -- 6 MB para usar dos de
// ellos, mas que el codigo entero de la aplicacion. En un colegio fiscal
// ecuatoriano la descarga la paga la familia con datos prepago.
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { NucleoScreen } from "./screens/NucleoScreen";
import { LimiteError } from "./components/NucleoUI";

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

if (!clerkPublishableKey) {
  throw new Error(
    "Falta EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Configura la clave pública de Clerk antes de iniciar la app.",
  );
}

if (!convexUrl) {
  throw new Error(
    "Falta EXPO_PUBLIC_CONVEX_URL. Ejecuta `npm run convex:dev` y configura la URL generada.",
  );
}

const convex = new ConvexReactClient(convexUrl, {
  unsavedChangesWarning: false,
});

export function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter: Inter_400Regular,
    "Inter-Semibold": Inter_600SemiBold,
  });
  if (!fontsLoaded && !fontError)
    return (
      <SafeAreaProvider>
        <LoadingScreen message="Preparando Cresco..." />
      </SafeAreaProvider>
    );
  return (
    <SafeAreaProvider>
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        tokenCache={tokenCache}
      >
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <StatusBar barStyle="dark-content" />
          <AuthLoading>
            <LoadingScreen message="Preparando tu sesión..." />
          </AuthLoading>
          <Unauthenticated>
            <WelcomeScreen />
          </Unauthenticated>
          <Authenticated>
            <HomeScreen />
          </Authenticated>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </SafeAreaProvider>
  );
}

type AuthMode = "sign-in" | "sign-up";
type AuthStep = "credentials" | "verification";

function getAuthErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "errors" in error &&
    Array.isArray(error.errors)
  ) {
    const firstError = error.errors[0];
    if (firstError && typeof firstError === "object") {
      if (
        "longMessage" in firstError &&
        typeof firstError.longMessage === "string"
      ) {
        return firstError.longMessage;
      }
      if ("message" in firstError && typeof firstError.message === "string") {
        return firstError.message;
      }
    }
  }

  return error instanceof Error
    ? error.message
    : "No se pudo completar la autenticación de Clerk.";
}

function WelcomeScreen() {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();
  const [mode, setMode] = useState<AuthMode | null>(null);
  const [step, setStep] = useState<AuthStep>("credentials");
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isGooglePending, setIsGooglePending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function selectMode(nextMode: AuthMode | null) {
    setErrorMessage(null);
    setStep("credentials");
    setCode("");

    if (nextMode !== mode) {
      try {
        await signIn.reset();
        await signUp.reset();
      } catch {
        // Ignorar errores al limpiar estado previo.
      }
    }

    setMode(nextMode);
  }

  async function continueWithGoogle() {
    setErrorMessage(null);
    setIsGooglePending(true);

    try {
      try {
        await signIn.reset();
        await signUp.reset();
      } catch {
        // Ignora si no había un flujo previo para reiniciar.
      }
      const result = await startSSOFlow({ strategy: "oauth_google" });
      if (!result.createdSessionId) {
        // Cancelado por el usuario o sin sesión creada; no es un error.
        return;
      }
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsGooglePending(false);
    }
  }

  async function submitCredentials() {
    const normalizedEmail = emailAddress.trim();
    if (!normalizedEmail || !password) {
      setErrorMessage("Ingresa tu correo y contraseña.");
      return;
    }

    setErrorMessage(null);
    setIsPending(true);

    try {
      if (mode === "sign-in") {
        const { error } = await signIn.password({
          emailAddress: normalizedEmail,
          password,
        });
        if (error) {
          throw error;
        }

        if (signIn.status === "complete") {
          await signIn.finalize({ navigate: () => {} });
          return;
        }

        if (signIn.status === "needs_client_trust") {
          await signIn.mfa.sendEmailCode();
          setStep("verification");
          return;
        }

        throw new Error(
          "Clerk requiere un paso de inicio de sesión no compatible.",
        );
      }

      if (mode === "sign-up") {
        const { error } = await signUp.password({
          emailAddress: normalizedEmail,
          password,
        });
        if (error) {
          throw error;
        }

        await signUp.verifications.sendEmailCode();
        setStep("verification");
      }
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsPending(false);
    }
  }

  async function verifyCode() {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      setErrorMessage("Ingresa el código enviado a tu correo.");
      return;
    }

    setErrorMessage(null);
    setIsPending(true);

    try {
      if (mode === "sign-in") {
        const { error } = await signIn.mfa.verifyEmailCode({
          code: normalizedCode,
        });
        if (error) {
          throw error;
        }
        if (signIn.status !== "complete") {
          throw new Error("Clerk no pudo completar el inicio de sesión.");
        }
        await signIn.finalize({ navigate: () => {} });
      }

      if (mode === "sign-up") {
        const { error } = await signUp.verifications.verifyEmailCode({
          code: normalizedCode,
        });
        if (error) {
          throw error;
        }
        if (signUp.status !== "complete") {
          throw new Error("Clerk no pudo completar la creación de la cuenta.");
        }
        await signUp.finalize({ navigate: () => {} });
      }
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>CRESCO</Text>
        <Text style={styles.title}>Tu comunidad educativa, conectada.</Text>
        <Text style={styles.subtitle}>
          Ingresa de forma segura para continuar.
        </Text>
      </View>

      <View style={styles.card}>
        {errorMessage ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {errorMessage}
          </Text>
        ) : null}

        {mode === null ? (
          <>
            <Pressable
              accessibilityLabel="Continuar con Google"
              accessibilityRole="button"
              disabled={isGooglePending}
              onPress={() => void continueWithGoogle()}
              style={({ pressed }) => [
                styles.button,
                styles.googleButton,
                pressed && styles.buttonPressed,
                isGooglePending && styles.buttonDisabled,
              ]}
            >
              {isGooglePending ? (
                <ActivityIndicator color={Texto.primario} />
              ) : (
                <Text style={styles.googleButtonText}>
                  Continuar con Google
                </Text>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>o continúa con correo</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={isGooglePending}
              onPress={() => void selectMode("sign-in")}
              style={({ pressed }) => [
                styles.button,
                styles.primaryButton,
                pressed && styles.buttonPressed,
                isGooglePending && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>Iniciar sesión</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={isGooglePending}
              onPress={() => void selectMode("sign-up")}
              style={({ pressed }) => [
                styles.button,
                styles.secondaryButton,
                pressed && styles.buttonPressed,
                isGooglePending && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Crear cuenta</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.formHeading}>
              {step === "verification"
                ? "Verifica tu correo"
                : mode === "sign-in"
                  ? "Inicia sesión"
                  : "Crea tu cuenta"}
            </Text>

            {step === "credentials" ? (
              <>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Correo electrónico</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    editable={!isPending}
                    keyboardType="email-address"
                    onChangeText={setEmailAddress}
                    placeholder="nombre@ejemplo.com"
                    style={styles.input}
                    value={emailAddress}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Contraseña</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete={
                      mode === "sign-in" ? "current-password" : "new-password"
                    }
                    editable={!isPending}
                    onChangeText={setPassword}
                    onSubmitEditing={() => void submitCredentials()}
                    placeholder="Mínimo 15 caracteres"
                    secureTextEntry
                    style={styles.input}
                    value={password}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.formHelp}>
                  Enviamos un código a {emailAddress.trim()}.
                </Text>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Código de verificación</Text>
                  <TextInput
                    autoComplete="one-time-code"
                    editable={!isPending}
                    keyboardType="number-pad"
                    onChangeText={setCode}
                    onSubmitEditing={() => void verifyCode()}
                    placeholder="123456"
                    style={styles.input}
                    value={code}
                  />
                </View>
              </>
            )}

            <Pressable
              accessibilityRole="button"
              disabled={isPending}
              onPress={() =>
                void (step === "credentials"
                  ? submitCredentials()
                  : verifyCode())
              }
              style={({ pressed }) => [
                styles.button,
                styles.primaryButton,
                pressed && styles.buttonPressed,
                isPending && styles.buttonDisabled,
              ]}
            >
              {isPending ? (
                <ActivityIndicator color={Superficie.tarjeta} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {step === "credentials" ? "Continuar" : "Verificar"}
                </Text>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={isPending}
              onPress={() => void selectMode(null)}
              style={({ pressed }) => [
                styles.button,
                styles.secondaryButton,
                pressed && styles.buttonPressed,
                isPending && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Volver</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function HomeScreen() {
  const { userId } = useAuth();
  return (
    <LimiteError key={userId}>
      <NucleoScreen />
    </LimiteError>
  );
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <SafeAreaView style={[styles.screen, styles.loadingScreen]}>
      <ActivityIndicator color={Marca.base} size="large" />
      <Text style={styles.loadingText}>{message}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    transform: [{ scale: 0.99 }],
  },
  card: {
    backgroundColor: Superficie.tarjeta,
    borderColor: Superficie.borde,
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 20,
  },
  connectionCopy: {
    flex: 1,
  },
  connectionDetail: {
    color: Texto.secundario,
    fontSize: 14,
    marginTop: 3,
  },
  connectionDot: {
    backgroundColor: Marca.base,
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  connectionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  connectionTitle: {
    color: Texto.primario,
    fontSize: 16,
    fontWeight: "700",
  },
  dividerLine: {
    backgroundColor: Superficie.borde,
    flex: 1,
    height: 1,
  },
  dividerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginVertical: 4,
  },
  dividerText: {
    color: Texto.secundario,
    fontSize: 13,
  },
  error: {
    // Igual que `ErrorMensaje` en NucleoUI: fondo solido y texto blanco. El
    // par anterior -- fondo rosa claro con texto rojo -- no aparecia en
    // `Theme.ts` y ademas daba menos contraste que este, que es el unico
    // par de error con razon AA anotada.
    backgroundColor: Semantico.error,
    borderRadius: 12,
    color: Texto.sobreColor,
    padding: 12,
  },
  eyebrow: {
    color: Marca.base,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2.4,
  },
  field: {
    gap: 7,
  },
  fieldLabel: {
    color: Texto.primario,
    fontSize: 14,
    fontWeight: "700",
  },
  formHeading: {
    color: Texto.primario,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 4,
  },
  formHelp: {
    color: Texto.secundario,
    fontSize: 14,
    lineHeight: 20,
  },
  googleButton: {
    backgroundColor: Superficie.tarjeta,
    borderColor: Superficie.borde,
    borderWidth: 1,
  },
  googleButtonText: {
    color: Texto.primario,
    fontSize: 16,
    fontWeight: "700",
  },
  hero: {
    gap: 12,
    marginBottom: 32,
  },
  input: {
    backgroundColor: Superficie.fondo,
    borderColor: Superficie.borde,
    borderRadius: 12,
    borderWidth: 1,
    color: Texto.primario,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  loadingScreen: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: Texto.secundario,
    fontSize: 16,
    marginTop: 14,
  },
  primaryButton: {
    backgroundColor: Marca.base,
  },
  primaryButtonText: {
    color: Texto.sobreColor,
    fontSize: 16,
    fontWeight: "700",
  },
  refreshingBanner: {
    alignItems: "center",
    backgroundColor: Marca.claro,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    left: 24,
    padding: 10,
    position: "absolute",
    right: 24,
    top: 24,
    zIndex: 1,
  },
  refreshingText: {
    color: Texto.primario,
    fontSize: 14,
    fontWeight: "600",
  },
  screen: {
    backgroundColor: Superficie.fondo,
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  secondaryButton: {
    backgroundColor: Marca.claro,
    borderColor: Superficie.borde,
    borderWidth: 1,
  },
  secondaryButtonText: {
    color: Texto.primario,
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    color: Texto.secundario,
    fontSize: 17,
    lineHeight: 25,
  },
  title: {
    color: Texto.primario,
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -1,
    lineHeight: 42,
  },
});
