-- The Designer is now the single source for physical wiring and zone geometry.
-- Remove the retired chain/segment payload and make legacy full-sign clips explicit.
update iluminate.partituras
set document_json = jsonb_set(
  document_json - 'chain1Pixels' - 'chain2Pixels' - 'chain3Pixels' - 'segments' - 'zones',
  '{scenes}',
  coalesce(
    (
      select jsonb_agg(
        jsonb_set(
          scene,
          '{clips}',
          coalesce(
            (
              select jsonb_agg(
                jsonb_set(
                  jsonb_set(
                    clip,
                    '{target}',
                    to_jsonb(case when clip->>'target' = 'rotulo_completo' then 'full_sign' else clip->>'target' end)
                  ),
                  '{coordinateSpace}',
                  coalesce(clip->'coordinateSpace', '"local"'::jsonb)
                )
              )
              from jsonb_array_elements(coalesce(scene->'clips', '[]'::jsonb)) as clip
            ),
            '[]'::jsonb
          )
        )
      )
      from jsonb_array_elements(coalesce(document_json->'scenes', '[]'::jsonb)) as scene
    ),
    '[]'::jsonb
  )
),
updated_at = now()
where deleted_at is null
  and (
    document_json ? 'chain1Pixels'
    or document_json ? 'chain2Pixels'
    or document_json ? 'chain3Pixels'
    or document_json ? 'segments'
    or document_json ? 'zones'
  );
