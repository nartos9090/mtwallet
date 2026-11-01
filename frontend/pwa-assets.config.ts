import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

/**
 * App icons, generated from public/logo.svg on every build and dev start
 * (vite-plugin-pwa `pwaAssets`), then linked from the manifest and the page
 * head. Android's maskable icon and Apple's touch icon can't be transparent,
 * so they get the app's dark background (and the preset's 30% padding, which
 * keeps the logo inside Android's circular crop).
 */
const background = '#0a0a0a'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...preset,
    maskable: { ...preset.maskable, resizeOptions: { background } },
    apple: { ...preset.apple, resizeOptions: { background } },
  },
  images: ['public/logo.svg'],
})
