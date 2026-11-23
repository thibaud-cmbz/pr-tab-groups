// @ts-check
import path from 'node:path';

/**
 * web-ext configuration, discovered automatically in the project root.
 * See https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/#setting-option-defaults-in-a-configuration-file
 */
export default {
  sourceDir: 'src',
  artifactsDir: 'web-ext-artifacts',
  build: {
    overwriteDest: true,
  },
  run: {
    // Persistent development profile inside the project. It must be an absolute
    // path: web-ext treats a value without a slash as a profile *name* (`-P`).
    // It also has to live outside /tmp, which the Firefox snap cannot read.
    firefoxProfile: path.join(import.meta.dirname, '.web-ext-profile'),
    profileCreateIfMissing: true,
    keepProfileChanges: true,
    startUrl: ['about:debugging#/runtime/this-firefox'],
  },
};
