begin;

update iluminate.led_strip_profiles
   set name = case id
     when 'global:ws2812b-5v-30' then 'WS2812B · 5 V · 30 px/m · 1 LED/cut'
     when 'global:ws2812b-5v-60' then 'WS2812B · 5 V · 60 px/m · 1 LED/cut'
     when 'global:ws2811-12v-20' then 'WS2811 · 12 V · 20 px/m · 60 LED/m · 3 LEDs/cut'
     when 'global:ws2815-12v-60' then 'WS2815 · 12 V · 60 px/m · 1 LED/cut'
     when 'global:sk6812-rgbw-5v-60' then 'SK6812 RGBW · 5 V · 60 px/m · 1 LED/cut'
     when 'global:ws2811-cob-24v-10' then 'COB WS2811 · 24 V · 10 px/m · 100 mm/cut'
     else name
   end,
       updated_at = now()
 where id in (
   'global:ws2812b-5v-30',
   'global:ws2812b-5v-60',
   'global:ws2811-12v-20',
   'global:ws2815-12v-60',
   'global:sk6812-rgbw-5v-60',
   'global:ws2811-cob-24v-10'
 );

commit;
