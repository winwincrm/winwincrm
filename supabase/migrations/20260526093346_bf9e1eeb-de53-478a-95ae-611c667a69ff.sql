INSERT INTO public.leads (first_name,last_name,full_name,email,phone,amount,payload,office_id,assigned_user_id,source,status)
SELECT v.first_name,v.last_name,v.full_name,v.email,v.phone,v.amount,v.payload,
       '1aaf0a2b-0359-4528-a4d7-6def28fba3c3'::uuid,
       '8c181979-840f-44e8-b143-cb0c109526e8'::uuid,
       'Festgeld','new'::lead_status
FROM (VALUES
('Evelyn','Reres','Evelyn Reres','erers51@yahoo.de','491721728818',50000,'{"amount_raw": "50 - 100.000 €", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb),
('Ulrich','Dirian','Ulrich Dirian','ulrich.dirian@gmx.de','01797325062',100000,'{"amount_raw": "100.000 +", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb),
('Petra Maria','Cenk','Petra Maria Cenk','petra.cenk@web.de','015779090347',20000,'{"amount_raw": "20.000 €", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb),
('Michael','Fußwinkel','Michael Fußwinkel','michael-fusswinkel@t-online.de','+491794980629',40000,'{"amount_raw": "40.000 €", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb),
('Eva Maria Sylvia','Mack','Eva Maria Sylvia Mack','cookie134@hotmail.de','015204927615',30000,'{"amount_raw": "30.000 €", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb),
('Karin','Kopf-Kamp','Karin Kopf-Kamp','karinkopfkamp@gmail.com','01743236156',50000,'{"amount_raw": "50 - 100.000 €", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb),
('Claudia','Bröcking-Lipina','Claudia Bröcking-Lipina','claudia.broecking@onlinehome.de','01705148307',20000,'{"amount_raw": "20.000 €", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb),
('Detlef','Hoellfritsch','Detlef Hoellfritsch','detlefhoellfritsch@freenet.de','0304425428',10000,'{"amount_raw": "10.000 €", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb),
('Horst','Rühle','Horst Rühle','horst.ruehle@gmx.de','062217570075',100000,'{"amount_raw": "100.000 +", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb),
('Francisco','Raney','Francisco Raney','raney@gmx.de','070435793',50000,'{"amount_raw": "50 - 100.000 €", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb),
('Gerhard','Netzband','Gerhard Netzband','netzband@aol.com','04915225260556',20000,'{"amount_raw": "20.000 €", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb),
('Theresia','Müller','Theresia Müller','lillapum20@aol.com','03625347521',50000,'{"amount_raw": "50.000 €", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb),
('Norbert','Mehlich','Norbert Mehlich','nomehl@gmx.de','021744860',50000,'{"amount_raw": "50 - 100.000 €", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb),
('Günter','Zaddach','Günter Zaddach','lg.zaddach@web.de','0240858664',10000,'{"amount_raw": "10.000 €", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb),
('Manfred','Schuetz','Manfred Schuetz','manfred-schuetz-schorndorf@t-online.de','0718145085',100000,'{"amount_raw": "100.000 +", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb),
('Yildiz','Engels','Yildiz Engels','engelsrojda@gmail.com','017624141787',100000,'{"amount_raw": "100.000 +", "product": "Festgeld", "import_batch": "Fest.xlsx 2026-05-26"}'::jsonb)
) AS v(first_name,last_name,full_name,email,phone,amount,payload);