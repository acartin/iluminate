#include <ArduinoJson.h>
#include <FastLED.h>

#define DATA_PIN_OUTPUT_1 25
#define DATA_PIN_OUTPUT_2 32
#define DATA_PIN_OUTPUT_3 26

#define MAX_LEDS_OUTPUT_1 100
#define MAX_LEDS_OUTPUT_2 1
#define MAX_LEDS_OUTPUT_3 1
#define BRIGHTNESS 96

CRGB output1[MAX_LEDS_OUTPUT_1];
CRGB output2[MAX_LEDS_OUTPUT_2];
CRGB output3[MAX_LEDS_OUTPUT_3];

StaticJsonDocument<24576> partitura;
uint16_t outputPixelCount[4] = {0, 0, 0, 0};
unsigned long sceneStartedAtMs = 0;

const char PARTITURA_JSON[] = R"json(
{
  "schemaVersion":"partitura.v1",
  "projectId":"default_installation",
  "requiredCoreVersion":"0.1.0",
  "defaultScene":"calibration",
  "chains":[
    {"id":"chain_1","name":"Logical output 1","output":1,"pixelCount":100,"direction":"forward"},
    {"id":"chain_2","name":"Logical output 2","output":2,"pixelCount":0,"direction":"forward"},
    {"id":"chain_3","name":"Logical output 3","output":3,"pixelCount":0,"direction":"forward"}
  ],
  "segments":[
    {"id":"segment_1","name":"Segment 1","chainId":"chain_1","start":0,"length":25,"reverse":false},
    {"id":"segment_2","name":"Segment 2","chainId":"chain_1","start":25,"length":25,"reverse":false},
    {"id":"segment_3","name":"Segment 3","chainId":"chain_1","start":50,"length":25,"reverse":false},
    {"id":"segment_4","name":"Segment 4","chainId":"chain_1","start":75,"length":25,"reverse":false}
  ],
  "zones":[
    {"id":"zone_1","name":"Zone 1","segments":["segment_1"],"distribution":"simultaneous"},
    {"id":"zone_2","name":"Zone 2","segments":["segment_2"],"distribution":"simultaneous"},
    {"id":"zone_3","name":"Zone 3","segments":["segment_3"],"distribution":"simultaneous"},
    {"id":"zone_4","name":"Zone 4","segments":["segment_4"],"distribution":"simultaneous"},
    {"id":"full_strip","name":"Full strip","segments":["segment_1","segment_2","segment_3","segment_4"],"distribution":"simultaneous"}
  ],
  "scenes":[
    {
      "id":"normal",
      "name":"Normal",
      "loop":true,
      "durationMs":4000,
      "tracks":[
        {"id":"track_zone_1","name":"Zone 1 solid","target":{"type":"zone","id":"zone_1"},"clips":[{"id":"clip_zone_1_solid","effect":"solid","startMs":0,"durationMs":4000,"layer":0,"blend":"replace","params":{"color":"#00AA44"}}]},
        {"id":"track_zone_2","name":"Zone 2 chase","target":{"type":"zone","id":"zone_2"},"clips":[{"id":"clip_zone_2_chase","effect":"chase","startMs":0,"durationMs":4000,"layer":1,"blend":"replace","params":{"color":"#FF2020","backgroundColor":"#000000","width":5,"direction":"forward"}}]},
        {"id":"track_zone_3","name":"Zone 3 pulse","target":{"type":"zone","id":"zone_3"},"clips":[{"id":"clip_zone_3_pulse","effect":"pulse","startMs":0,"durationMs":4000,"layer":2,"blend":"replace","params":{"color":"#3366FF","minIntensity":0.15,"maxIntensity":1}}]},
        {"id":"track_zone_4","name":"Zone 4 toggle","target":{"type":"zone","id":"zone_4"},"clips":[{"id":"clip_zone_4_toggle","effect":"toggle","startMs":0,"durationMs":4000,"layer":3,"blend":"replace","params":{"onColor":"#FFFFFF","offColor":"#000000","periodMs":1000,"dutyCycle":0.5,"groupCount":1}}]}
      ]
    },
    {
      "id":"calibration",
      "name":"Calibration",
      "loop":true,
      "durationMs":10000,
      "tracks":[
        {"id":"track_cal_red","name":"Red","target":{"type":"zone","id":"full_strip"},"clips":[{"id":"cal_red","effect":"solid","startMs":0,"durationMs":1000,"layer":0,"blend":"replace","params":{"color":"#FF0000"}}]},
        {"id":"track_cal_green","name":"Green","target":{"type":"zone","id":"full_strip"},"clips":[{"id":"cal_green","effect":"solid","startMs":1000,"durationMs":1000,"layer":0,"blend":"replace","params":{"color":"#00FF00"}}]},
        {"id":"track_cal_blue","name":"Blue","target":{"type":"zone","id":"full_strip"},"clips":[{"id":"cal_blue","effect":"solid","startMs":2000,"durationMs":1000,"layer":0,"blend":"replace","params":{"color":"#0000FF"}}]},
        {"id":"track_cal_white","name":"White","target":{"type":"zone","id":"full_strip"},"clips":[{"id":"cal_white","effect":"solid","startMs":3000,"durationMs":1000,"layer":0,"blend":"replace","params":{"color":"#FFFFFF"}}]},
        {"id":"track_cal_gray_25","name":"Gray 25%","target":{"type":"zone","id":"full_strip"},"clips":[{"id":"cal_gray_25","effect":"solid","startMs":4000,"durationMs":1000,"layer":0,"blend":"replace","params":{"color":"#404040"}}]},
        {"id":"track_cal_gray_50","name":"Gray 50%","target":{"type":"zone","id":"full_strip"},"clips":[{"id":"cal_gray_50","effect":"solid","startMs":5000,"durationMs":1000,"layer":0,"blend":"replace","params":{"color":"#808080"}}]},
        {"id":"track_cal_yellow","name":"Yellow","target":{"type":"zone","id":"full_strip"},"clips":[{"id":"cal_yellow","effect":"solid","startMs":6000,"durationMs":1000,"layer":0,"blend":"replace","params":{"color":"#FFFF00"}}]},
        {"id":"track_cal_cyan","name":"Cyan","target":{"type":"zone","id":"full_strip"},"clips":[{"id":"cal_cyan","effect":"solid","startMs":7000,"durationMs":1000,"layer":0,"blend":"replace","params":{"color":"#00FFFF"}}]},
        {"id":"track_cal_magenta","name":"Magenta","target":{"type":"zone","id":"full_strip"},"clips":[{"id":"cal_magenta","effect":"solid","startMs":8000,"durationMs":1000,"layer":0,"blend":"replace","params":{"color":"#FF00FF"}}]},
        {"id":"track_cal_off","name":"Off","target":{"type":"zone","id":"full_strip"},"clips":[{"id":"cal_off","effect":"off","startMs":9000,"durationMs":1000,"layer":0,"blend":"replace","params":{}}]}
      ]
    }
  ]
}
)json";

void setup() {
  Serial.begin(115200);
  delay(300);

  DeserializationError error = deserializeJson(partitura, PARTITURA_JSON);
  if (error) {
    Serial.print("Partitura parse failed: ");
    Serial.println(error.c_str());
    return;
  }

  loadOutputPixelCounts();
  if (outputPixelCount[1] > 0) FastLED.addLeds<WS2812B, DATA_PIN_OUTPUT_1, GRB>(output1, min<uint16_t>(outputPixelCount[1], MAX_LEDS_OUTPUT_1));
  if (outputPixelCount[2] > 0) FastLED.addLeds<WS2812B, DATA_PIN_OUTPUT_2, GRB>(output2, min<uint16_t>(outputPixelCount[2], MAX_LEDS_OUTPUT_2));
  if (outputPixelCount[3] > 0) FastLED.addLeds<WS2812B, DATA_PIN_OUTPUT_3, GRB>(output3, min<uint16_t>(outputPixelCount[3], MAX_LEDS_OUTPUT_3));
  FastLED.setBrightness(BRIGHTNESS);
  sceneStartedAtMs = millis();

  Serial.println("ESP32 FastLED partitura spike ready.");
}

void loop() {
  renderDefaultScene();
  FastLED.show();
  delay(16);
}

void loadOutputPixelCounts() {
  for (JsonObject chain : partitura["chains"].as<JsonArray>()) {
    int output = chain["output"] | 0;
    int pixelCount = chain["pixelCount"] | 0;
    if (output >= 1 && output <= 3) outputPixelCount[output] = max(0, pixelCount);
  }
}

void renderDefaultScene() {
  clearOutputs();

  JsonObject scene = findScene(partitura["defaultScene"] | "");
  if (scene.isNull()) return;

  uint32_t durationMs = scene["durationMs"] | 1000;
  bool loopScene = scene["loop"] | true;
  uint32_t elapsed = millis() - sceneStartedAtMs;
  uint32_t sceneTime = loopScene ? elapsed % durationMs : min(elapsed, durationMs);

  for (JsonObject track : scene["tracks"].as<JsonArray>()) {
    const char *zoneId = track["target"]["id"] | "";
    for (JsonObject clip : track["clips"].as<JsonArray>()) {
      uint32_t startMs = clip["startMs"] | 0;
      uint32_t duration = clip["durationMs"] | durationMs;
      if (sceneTime < startMs || sceneTime >= startMs + duration) continue;

      float progress = duration > 0 ? constrain((float)(sceneTime - startMs) / (float)duration, 0.0f, 1.0f) : 1.0f;
      renderClipToZone(clip, zoneId, sceneTime - startMs, progress);
    }
  }
}

JsonObject findScene(const char *sceneId) {
  for (JsonObject scene : partitura["scenes"].as<JsonArray>()) {
    if (strcmp(scene["id"] | "", sceneId) == 0) return scene;
  }
  return JsonObject();
}

JsonObject findZone(const char *zoneId) {
  for (JsonObject zone : partitura["zones"].as<JsonArray>()) {
    if (strcmp(zone["id"] | "", zoneId) == 0) return zone;
  }
  return JsonObject();
}

JsonObject findSegment(const char *segmentId) {
  for (JsonObject segment : partitura["segments"].as<JsonArray>()) {
    if (strcmp(segment["id"] | "", segmentId) == 0) return segment;
  }
  return JsonObject();
}

int outputForChain(const char *chainId) {
  for (JsonObject chain : partitura["chains"].as<JsonArray>()) {
    if (strcmp(chain["id"] | "", chainId) == 0) return chain["output"] | 0;
  }
  return 0;
}

void renderClipToZone(JsonObject clip, const char *zoneId, uint32_t localTimeMs, float progress) {
  JsonObject zone = findZone(zoneId);
  if (zone.isNull()) return;

  int total = 0;
  for (const char *segmentId : zone["segments"].as<JsonArray>()) {
    JsonObject segment = findSegment(segmentId);
    total += segment["length"] | 0;
  }

  int globalIndex = 0;
  for (const char *segmentId : zone["segments"].as<JsonArray>()) {
    JsonObject segment = findSegment(segmentId);
    renderClipToSegment(clip, segment, localTimeMs, progress, globalIndex, max(1, total));
    globalIndex += segment["length"] | 0;
  }
}

void renderClipToSegment(JsonObject clip, JsonObject segment, uint32_t localTimeMs, float progress, int baseIndex, int total) {
  const char *chainId = segment["chainId"] | "";
  int output = outputForChain(chainId);
  int start = segment["start"] | 0;
  int length = segment["length"] | 0;
  bool reverse = segment["reverse"] | false;

  for (int offset = 0; offset < length; offset++) {
    int effectIndex = baseIndex + offset;
    int physicalIndex = start + (reverse ? length - 1 - offset : offset);
    CRGB color = colorForClip(clip, localTimeMs, progress, effectIndex, total);
    setPixel(output, physicalIndex, color);
  }
}

CRGB colorForClip(JsonObject clip, uint32_t localTimeMs, float progress, int index, int total) {
  const char *effect = clip["effect"] | "off";
  JsonObject params = clip["params"];

  if (strcmp(effect, "solid") == 0) return parseHexColor(params["color"] | "#000000");

  if (strcmp(effect, "fade") == 0) {
    CRGB from = parseHexColor(params["fromColor"] | "#000000");
    CRGB to = parseHexColor(params["toColor"] | "#FFFFFF");
    return blend(from, to, (uint8_t)(progress * 255));
  }

  if (strcmp(effect, "pulse") == 0) {
    CRGB color = parseHexColor(params["color"] | "#FFFFFF");
    float minIntensity = params["minIntensity"] | 0.0f;
    float maxIntensity = params["maxIntensity"] | 1.0f;
    float wave = (sin(progress * TWO_PI - HALF_PI) + 1.0f) / 2.0f;
    color.nscale8((uint8_t)((minIntensity + (maxIntensity - minIntensity) * wave) * 255));
    return color;
  }

  if (strcmp(effect, "chase") == 0) {
    int width = max(1, params["width"] | 5);
    int head = round(progress * max(0, total - 1));
    bool reverse = strcmp(params["direction"] | "forward", "reverse") == 0;
    int directedIndex = reverse ? total - 1 - index : index;
    bool active = directedIndex >= head && directedIndex < head + width;
    return active ? parseHexColor(params["color"] | "#FFFFFF") : parseHexColor(params["backgroundColor"] | "#000000");
  }

  if (strcmp(effect, "toggle") == 0) {
    uint32_t periodMs = max<uint32_t>(1, params["periodMs"] | 1000);
    float dutyCycle = constrain(params["dutyCycle"] | 0.5f, 0.0f, 1.0f);
    float phase = (float)(localTimeMs % periodMs) / (float)periodMs;
    return phase < dutyCycle ? parseHexColor(params["onColor"] | "#FFFFFF") : parseHexColor(params["offColor"] | "#000000");
  }

  return CRGB::Black;
}

CRGB parseHexColor(const char *value) {
  if (!value || strlen(value) != 7 || value[0] != '#') return CRGB::Black;
  char component[3] = {0, 0, 0};
  component[0] = value[1]; component[1] = value[2];
  uint8_t r = strtoul(component, nullptr, 16);
  component[0] = value[3]; component[1] = value[4];
  uint8_t g = strtoul(component, nullptr, 16);
  component[0] = value[5]; component[1] = value[6];
  uint8_t b = strtoul(component, nullptr, 16);
  return CRGB(r, g, b);
}

void clearOutputs() {
  fill_solid(output1, MAX_LEDS_OUTPUT_1, CRGB::Black);
  fill_solid(output2, MAX_LEDS_OUTPUT_2, CRGB::Black);
  fill_solid(output3, MAX_LEDS_OUTPUT_3, CRGB::Black);
}

void setPixel(int output, int index, CRGB color) {
  if (output == 1 && index >= 0 && index < min<uint16_t>(outputPixelCount[1], MAX_LEDS_OUTPUT_1)) output1[index] = color;
  if (output == 2 && index >= 0 && index < min<uint16_t>(outputPixelCount[2], MAX_LEDS_OUTPUT_2)) output2[index] = color;
  if (output == 3 && index >= 0 && index < min<uint16_t>(outputPixelCount[3], MAX_LEDS_OUTPUT_3)) output3[index] = color;
}
