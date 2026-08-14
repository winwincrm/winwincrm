WITH new_client AS (
  INSERT INTO public.bookkeeping_clients (office_id, name_ciphertext, name_iv, name_tag)
  VALUES ('a2d7b652-902d-4b5d-9665-54d83b528847', 'wlb/RyLxlS3MMSX5qsU=', 'Ce++N1Y7Q42TSU2g', 'zJtgssoGitaXbyt8LXeH/Q==')
  RETURNING id
)
INSERT INTO public.bookkeeping_deposits (office_id, client_id, deposit_date, amount_ciphertext, amount_iv, amount_tag)
SELECT 'a2d7b652-902d-4b5d-9665-54d83b528847', id, '2026-06-01', 'W2jNZxs=', 'OYG+ajriNvjh1C/j', '1PKJ8OQ459YXtjlbCSjvdw==' FROM new_client;

WITH new_client AS (
  INSERT INTO public.bookkeeping_clients (office_id, name_ciphertext, name_iv, name_tag)
  VALUES ('a2d7b652-902d-4b5d-9665-54d83b528847', 'Ag+Gjv+nf9QK6/Mlunj5TGA=', '/uI822YWUc5Adfhn', 'uC+p8YxVmY1t/gI01lK//A==')
  RETURNING id
)
INSERT INTO public.bookkeeping_deposits (office_id, client_id, deposit_date, amount_ciphertext, amount_iv, amount_tag)
SELECT 'a2d7b652-902d-4b5d-9665-54d83b528847', id, '2026-06-01', 'gGUfqT8=', 'GqiVHlio7P5JaBqB', 'j4Fa1bcdvb4Fs+c1LQNp8g==' FROM new_client;