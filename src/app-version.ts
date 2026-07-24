// Keep this in sync with package.json and desktop/package.json when releasing.
// The standalone runtime copies only src/, so importing package.json would show
// the runtime package version instead of the shipped app version.
export const APP_VERSION = '1.0.13'
