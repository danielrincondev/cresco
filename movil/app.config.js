/**
 * app.json más la ruta a google-services.json, que Firebase necesita para que
 * los avisos lleguen a Android (FCM).
 *
 * El archivo no se versiona: `.gitignore` lo agrupa con las credenciales. En
 * EAS llega como variable de tipo archivo (`GOOGLE_SERVICES_JSON`, secreta, en
 * los entornos development y preview); en la máquina de quien compila, se lee
 * de `movil/google-services.json`.
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
  },
});
