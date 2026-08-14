UPDATE leads SET phone = CASE
  WHEN phone LIKE '+4949%' THEN '+49' || substring(phone from 6)
  WHEN phone LIKE '004949%' THEN '0049' || substring(phone from 7)
  WHEN phone LIKE '4949%' THEN '49' || substring(phone from 5)
END
WHERE id IN (
  SELECT l.id FROM leads l
  JOIN lead_folder_items i ON i.lead_id = l.id
  WHERE i.folder_id = '9475d53d-ad13-479b-8e7a-f6deb22daf33'
    AND (l.phone LIKE '+4949%' OR l.phone LIKE '004949%' OR l.phone LIKE '4949%')
);