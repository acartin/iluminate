# ESP32 FastLED Spike

This spike validates that an ESP32 can interpret a real `partitura.v1` JSON shape with FastLED.

Scope:

- Three logical controller outputs are always present in the partitura.
- Unused outputs use `pixelCount: 0`.
- The first test uses only `output 1`, mapped locally to GPIO 25.
- One 100 LED WS2812B strip is split into four 25 LED segments.
- The `normal` scene runs in loop with four clips:
  - segment 1: `solid`
  - segment 2: `chase`
  - segment 3: `pulse`
  - segment 4: `toggle`
- The `calibration` scene is the temporary default scene for hardware comparison.

Arduino IDE setup:

1. Install board support for ESP32.
2. Install libraries:
   - `FastLED`
   - `ArduinoJson`
3. Open `esp32-fastled-spike.ino`.
4. Connect a 100 LED WS2812B strip data line to GPIO 25.
5. Flash the sketch.

This is not the production firmware. It intentionally skips WiFi, polling, persistence and OTA. Its job is to prove that the contract can be parsed and rendered on the device.

Output mapping for this spike:

```text
output 1 -> GPIO 25
output 2 -> GPIO 32, unused when pixelCount is 0
output 3 -> GPIO 26, unused when pixelCount is 0
```

Expected visual result:

Calibration scene:

- 0-1s: red.
- 1-2s: green.
- 2-3s: blue.
- 3-4s: white.
- 4-5s: 25% gray.
- 5-6s: 50% gray.
- 6-7s: yellow.
- 7-8s: cyan.
- 8-9s: magenta.
- 9-10s: off.

Normal scene:

- LEDs 0-24: solid green.
- LEDs 25-49: red chase.
- LEDs 50-74: blue pulse.
- LEDs 75-99: white blink.
