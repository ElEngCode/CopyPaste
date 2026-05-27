# Provider Notes

- Product mode: Browser Auto Planning MVP.
- No API provider integrations in this phase.
- No stealth automation policy:
  - no navigator.webdriver override
  - no CAPTCHA bypass
  - no fingerprint spoofing
  - no stealth plugins
- Browser sessions use visible real Chrome/Edge profiles (not bundled Chromium).

Selector configuration:
- Runtime selectors are loaded from `selectors.json` in Electron `userData`.
- If missing, defaults are created automatically.
- If corrupted, file is moved to `selectors.broken.json` and defaults are recreated.
- Selectors can be edited in-app from `Settings -> Advanced` and reset to defaults.
