// Metro config: the app reuses Praxio's shared logic from ../app/src/lib (Decision Engine,
// progress, project evaluation, scoring) instead of copying it.
//
// The only browser-specific file in that folder is app/src/lib/supabase.js (it reads Vite's
// import.meta.env and stores the session in localStorage). Every import of it is redirected to
// src/supabaseClient.js, which uses Expo env vars and AsyncStorage.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const webApp = path.resolve(projectRoot, '../app');
const sharedLib = path.join(webApp, 'src', 'lib');
const webClient = path.join(sharedLib, 'supabase.js');
const mobileClient = path.join(projectRoot, 'src', 'supabaseClient.js');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  ...(config.watchFolders ?? []),
  sharedLib,
  // Plain-JS modules shared with the edge functions (market schema, academic validation).
  path.join(webApp, 'supabase', 'functions'),
];

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('supabase.js') && context.originModulePath.startsWith(sharedLib)) {
    const target = path.resolve(path.dirname(context.originModulePath), moduleName);
    if (target === webClient) return { type: 'sourceFile', filePath: mobileClient };
  }
  return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
