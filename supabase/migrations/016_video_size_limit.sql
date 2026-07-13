-- Nestly: 016 — screen recordings are big; allow up to 300MB in video-temp
update storage.buckets set file_size_limit = 314572800 where id = 'video-temp';
