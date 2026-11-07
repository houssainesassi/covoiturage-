-- =============================================================================
-- Migration 5: reference data — the 24 Tunisian governorates and real cities.
-- Coordinates are town centres (WGS84). Drivers refine the exact meeting
-- point on the map when publishing a trip.
-- Home region of the platform: El Fahs (Zaghouan) — highest popularity so it
-- is suggested first.
-- =============================================================================

insert into public.governorates (code, name_fr, name_ar, name_en) values
  ('tunis',       'Tunis',        'تونس',        'Tunis'),
  ('ariana',      'Ariana',       'أريانة',      'Ariana'),
  ('ben-arous',   'Ben Arous',    'بن عروس',     'Ben Arous'),
  ('manouba',     'Manouba',      'منوبة',       'Manouba'),
  ('nabeul',      'Nabeul',       'نابل',        'Nabeul'),
  ('zaghouan',    'Zaghouan',     'زغوان',       'Zaghouan'),
  ('bizerte',     'Bizerte',      'بنزرت',       'Bizerte'),
  ('beja',        'Béja',         'باجة',        'Beja'),
  ('jendouba',    'Jendouba',     'جندوبة',      'Jendouba'),
  ('kef',         'Le Kef',       'الكاف',       'Kef'),
  ('siliana',     'Siliana',      'سليانة',      'Siliana'),
  ('sousse',      'Sousse',       'سوسة',        'Sousse'),
  ('monastir',    'Monastir',     'المنستير',    'Monastir'),
  ('mahdia',      'Mahdia',       'المهدية',     'Mahdia'),
  ('sfax',        'Sfax',         'صفاقس',       'Sfax'),
  ('kairouan',    'Kairouan',     'القيروان',    'Kairouan'),
  ('kasserine',   'Kasserine',    'القصرين',     'Kasserine'),
  ('sidi-bouzid', 'Sidi Bouzid',  'سيدي بوزيد',  'Sidi Bouzid'),
  ('gabes',       'Gabès',        'قابس',        'Gabes'),
  ('medenine',    'Médenine',     'مدنين',       'Medenine'),
  ('tataouine',   'Tataouine',    'تطاوين',      'Tataouine'),
  ('gafsa',       'Gafsa',        'قفصة',        'Gafsa'),
  ('tozeur',      'Tozeur',       'توزر',        'Tozeur'),
  ('kebili',      'Kébili',       'قبلي',        'Kebili')
on conflict (code) do nothing;

insert into public.locations (slug, governorate_code, name_fr, name_ar, name_en, kind, is_capital, lat, lng, popularity) values
  -- Zaghouan governorate (home region: El Fahs) — all six delegations
  ('el-fahs',            'zaghouan',  'El Fahs',            'الفحص',           'El Fahs',            'city', false, 36.3744,  9.9064, 100),
  ('zaghouan',           'zaghouan',  'Zaghouan',           'زغوان',           'Zaghouan',           'city', true,  36.4029, 10.1429,  95),
  ('bir-mcherga',        'zaghouan',  'Bir Mcherga',        'بئر مشارقة',      'Bir Mcherga',        'city', false, 36.5167, 10.0167,  60),
  ('nadhour',            'zaghouan',  'Nadhour',            'الناظور',         'Nadhour',            'city', false, 36.1167, 10.0917,  55),
  ('saouaf',             'zaghouan',  'Saouaf',             'صواف',            'Saouaf',             'city', false, 36.2333, 10.1833,  50),
  ('zriba',              'zaghouan',  'Zriba',              'الزريبة',         'Zriba',              'city', false, 36.3333, 10.2333,  50),

  -- Tunis
  ('tunis',              'tunis',     'Tunis',              'تونس',            'Tunis',              'city', true,  36.8065, 10.1815,  92),
  ('la-marsa',           'tunis',     'La Marsa',           'المرسى',          'La Marsa',           'city', false, 36.8782, 10.3247,  60),
  ('carthage',           'tunis',     'Carthage',           'قرطاج',           'Carthage',           'city', false, 36.8528, 10.3233,  45),
  ('la-goulette',        'tunis',     'La Goulette',        'حلق الوادي',      'La Goulette',        'city', false, 36.8181, 10.3050,  40),
  ('le-bardo',           'tunis',     'Le Bardo',           'باردو',           'Le Bardo',           'city', false, 36.8092, 10.1406,  45),
  ('aeroport-tunis-carthage', 'tunis', 'Aéroport Tunis-Carthage', 'مطار تونس قرطاج', 'Tunis-Carthage Airport', 'airport', false, 36.8510, 10.2272, 70),

  -- Ariana
  ('ariana',             'ariana',    'Ariana',             'أريانة',          'Ariana',             'city', true,  36.8625, 10.1956,  65),
  ('la-soukra',          'ariana',    'La Soukra',          'سكرة',            'La Soukra',          'city', false, 36.8750, 10.2500,  40),
  ('ettadhamen',         'ariana',    'Ettadhamen',         'التضامن',         'Ettadhamen',         'city', false, 36.8400, 10.1000,  35),

  -- Ben Arous (on the El Fahs – Tunis road)
  ('ben-arous',          'ben-arous', 'Ben Arous',          'بن عروس',         'Ben Arous',          'city', true,  36.7531, 10.2189,  60),
  ('mohamedia',          'ben-arous', 'Mohamedia',          'المحمدية',        'Mohamedia',          'city', false, 36.6767, 10.1561,  45),
  ('fouchana',           'ben-arous', 'Fouchana',           'فوشانة',          'Fouchana',           'city', false, 36.6986, 10.1694,  40),
  ('hammam-lif',         'ben-arous', 'Hammam Lif',         'حمام الأنف',      'Hammam Lif',         'city', false, 36.7300, 10.3400,  45),
  ('rades',              'ben-arous', 'Radès',              'رادس',            'Rades',              'city', false, 36.7681, 10.2753,  40),
  ('ezzahra',            'ben-arous', 'Ezzahra',            'الزهراء',         'Ezzahra',            'city', false, 36.7439, 10.3083,  35),
  ('megrine',            'ben-arous', 'Mégrine',            'مقرين',           'Megrine',            'city', false, 36.7686, 10.2339,  35),
  ('mornag',             'ben-arous', 'Mornag',             'مرناق',           'Mornag',             'city', false, 36.6858, 10.2886,  35),

  -- Manouba
  ('manouba',            'manouba',   'Manouba',            'منوبة',           'Manouba',            'city', true,  36.8101, 10.0956,  50),
  ('oued-ellil',         'manouba',   'Oued Ellil',         'وادي الليل',      'Oued Ellil',         'city', false, 36.8333, 10.0417,  30),
  ('tebourba',           'manouba',   'Tebourba',           'طبربة',           'Tebourba',           'city', false, 36.8297,  9.8406,  30),

  -- Nabeul
  ('nabeul',             'nabeul',    'Nabeul',             'نابل',            'Nabeul',             'city', true,  36.4561, 10.7376,  65),
  ('hammamet',           'nabeul',    'Hammamet',           'الحمامات',        'Hammamet',           'city', false, 36.4000, 10.6167,  65),
  ('kelibia',            'nabeul',    'Kélibia',            'قليبية',          'Kelibia',            'city', false, 36.8475, 11.0939,  45),
  ('korba',              'nabeul',    'Korba',              'قربة',            'Korba',              'city', false, 36.5786, 10.8586,  35),
  ('grombalia',          'nabeul',    'Grombalia',          'قرمبالية',        'Grombalia',          'city', false, 36.6000, 10.5000,  35),
  ('menzel-temime',      'nabeul',    'Menzel Temime',      'منزل تميم',       'Menzel Temime',      'city', false, 36.7811, 10.9881,  35),
  ('soliman',            'nabeul',    'Soliman',            'سليمان',          'Soliman',            'city', false, 36.6956, 10.4914,  30),
  ('dar-chaabane',       'nabeul',    'Dar Chaâbane',       'دار شعبان',       'Dar Chaabane',       'city', false, 36.4700, 10.7500,  25),

  -- Bizerte
  ('bizerte',            'bizerte',   'Bizerte',            'بنزرت',           'Bizerte',            'city', true,  37.2744,  9.8739,  65),
  ('menzel-bourguiba',   'bizerte',   'Menzel Bourguiba',   'منزل بورقيبة',    'Menzel Bourguiba',   'city', false, 37.1536,  9.7856,  40),
  ('mateur',             'bizerte',   'Mateur',             'ماطر',            'Mateur',             'city', false, 37.0400,  9.6650,  35),
  ('ras-jebel',          'bizerte',   'Ras Jebel',          'رأس الجبل',       'Ras Jebel',          'city', false, 37.2150, 10.1200,  30),

  -- Béja
  ('beja',               'beja',      'Béja',               'باجة',            'Beja',               'city', true,  36.7256,  9.1817,  50),
  ('medjez-el-bab',      'beja',      'Medjez el-Bab',      'مجاز الباب',      'Medjez el-Bab',      'city', false, 36.6500,  9.6128,  35),
  ('testour',            'beja',      'Testour',            'تستور',           'Testour',            'city', false, 36.5511,  9.4431,  30),

  -- Jendouba
  ('jendouba',           'jendouba',  'Jendouba',           'جندوبة',          'Jendouba',           'city', true,  36.5011,  8.7802,  45),
  ('tabarka',            'jendouba',  'Tabarka',            'طبرقة',           'Tabarka',            'city', false, 36.9544,  8.7580,  45),
  ('ain-draham',         'jendouba',  'Aïn Draham',         'عين دراهم',       'Ain Draham',         'city', false, 36.7792,  8.6875,  30),
  ('bou-salem',          'jendouba',  'Bou Salem',          'بوسالم',          'Bou Salem',          'city', false, 36.6111,  8.9700,  25),
  ('ghardimaou',         'jendouba',  'Ghardimaou',         'غار الدماء',      'Ghardimaou',         'city', false, 36.4500,  8.4333,  25),

  -- Le Kef
  ('le-kef',             'kef',       'Le Kef',             'الكاف',           'El Kef',             'city', true,  36.1826,  8.7148,  45),
  ('dahmani',            'kef',       'Dahmani',            'الدهماني',        'Dahmani',            'city', false, 35.9450,  8.8300,  20),
  ('tajerouine',         'kef',       'Tajerouine',         'تاجروين',         'Tajerouine',         'city', false, 35.8917,  8.5528,  20),

  -- Siliana (neighbours of El Fahs to the west)
  ('siliana',            'siliana',   'Siliana',            'سليانة',          'Siliana',            'city', true,  36.0849,  9.3708,  50),
  ('bou-arada',          'siliana',   'Bou Arada',          'بوعرادة',         'Bou Arada',          'city', false, 36.3528,  9.6217,  45),
  ('el-aroussa',         'siliana',   'El Aroussa',         'العروسة',         'El Aroussa',         'city', false, 36.3811,  9.4544,  35),
  ('gaafour',            'siliana',   'Gaâfour',            'قعفور',           'Gaafour',            'city', false, 36.3222,  9.3256,  30),
  ('makthar',            'siliana',   'Makthar',            'مكثر',            'Makthar',            'city', false, 35.8597,  9.2058,  25),

  -- Sousse
  ('sousse',             'sousse',    'Sousse',             'سوسة',            'Sousse',             'city', true,  35.8256, 10.6360,  85),
  ('msaken',             'sousse',    'M''saken',           'مساكن',           'Msaken',             'city', false, 35.7333, 10.5833,  40),
  ('hammam-sousse',      'sousse',    'Hammam Sousse',      'حمام سوسة',       'Hammam Sousse',      'city', false, 35.8608, 10.5936,  40),
  ('akouda',             'sousse',    'Akouda',             'أكودة',           'Akouda',             'city', false, 35.8692, 10.5653,  30),
  ('kalaa-kebira',       'sousse',    'Kalâa Kebira',       'القلعة الكبرى',   'Kalaa Kebira',       'city', false, 35.8667, 10.5333,  30),
  ('enfidha',            'sousse',    'Enfidha',            'النفيضة',         'Enfidha',            'city', false, 36.1333, 10.3833,  45),
  ('bouficha',           'sousse',    'Bouficha',           'بوفيشة',          'Bouficha',           'city', false, 36.3000, 10.4500,  35),
  ('port-el-kantaoui',   'sousse',    'Port El Kantaoui',   'القنطاوي',        'Port El Kantaoui',   'city', false, 35.8919, 10.5975,  30),
  ('aeroport-enfidha',   'sousse',    'Aéroport Enfidha-Hammamet', 'مطار النفيضة الحمامات', 'Enfidha-Hammamet Airport', 'airport', false, 36.0758, 10.4386, 40),

  -- Monastir
  ('monastir',           'monastir',  'Monastir',           'المنستير',        'Monastir',           'city', true,  35.7643, 10.8113,  65),
  ('moknine',            'monastir',  'Moknine',            'المكنين',         'Moknine',            'city', false, 35.6333, 10.9000,  35),
  ('ksar-hellal',        'monastir',  'Ksar Hellal',        'قصر هلال',        'Ksar Hellal',        'city', false, 35.6431, 10.8911,  35),
  ('jemmal',             'monastir',  'Jemmal',             'جمال',            'Jemmal',             'city', false, 35.6233, 10.7597,  30),
  ('teboulba',           'monastir',  'Téboulba',           'طبلبة',           'Teboulba',           'city', false, 35.6450, 10.9600,  25),
  ('ksibet-el-mediouni', 'monastir',  'Ksibet el-Médiouni', 'قصيبة المديوني',  'Ksibet el-Mediouni', 'city', false, 35.6856, 10.8428,  20),
  ('sahline',            'monastir',  'Sahline',            'الساحلين',        'Sahline',            'city', false, 35.7500, 10.7167,  20),
  ('aeroport-monastir',  'monastir',  'Aéroport Monastir Habib-Bourguiba', 'مطار المنستير الحبيب بورقيبة', 'Monastir Habib Bourguiba Airport', 'airport', false, 35.7581, 10.7547, 40),

  -- Mahdia
  ('mahdia',             'mahdia',    'Mahdia',             'المهدية',         'Mahdia',             'city', true,  35.5047, 11.0622,  55),
  ('el-jem',             'mahdia',    'El Jem',             'الجم',            'El Jem',             'city', false, 35.3000, 10.7167,  40),
  ('ksour-essef',        'mahdia',    'Ksour Essef',        'قصور الساف',      'Ksour Essef',        'city', false, 35.4181, 10.9947,  25),
  ('chebba',             'mahdia',    'Chebba',             'الشابة',          'Chebba',             'city', false, 35.2372, 11.1150,  25),

  -- Sfax
  ('sfax',               'sfax',      'Sfax',               'صفاقس',           'Sfax',               'city', true,  34.7406, 10.7603,  80),
  ('sakiet-ezzit',       'sfax',      'Sakiet Ezzit',       'ساقية الزيت',     'Sakiet Ezzit',       'city', false, 34.8000, 10.7500,  30),
  ('sakiet-eddaier',     'sfax',      'Sakiet Eddaïer',     'ساقية الدائر',    'Sakiet Eddaier',     'city', false, 34.8000, 10.7833,  25),
  ('mahres',             'sfax',      'Mahrès',             'المحرس',          'Mahres',             'city', false, 34.5333, 10.5000,  25),
  ('jebeniana',          'sfax',      'Jebeniana',          'جبنيانة',         'Jebeniana',          'city', false, 35.0333, 10.9000,  25),
  ('kerkennah',          'sfax',      'Kerkennah',          'قرقنة',           'Kerkennah',          'city', false, 34.7128, 11.1950,  25),
  ('agareb',             'sfax',      'Agareb',             'عقارب',           'Agareb',             'city', false, 34.7414, 10.5250,  20),
  ('bir-ali-ben-khalifa','sfax',      'Bir Ali Ben Khalifa','بئر علي بن خليفة','Bir Ali Ben Khalifa','city', false, 34.7339, 10.1000,  20),

  -- Kairouan (south of El Fahs)
  ('kairouan',           'kairouan',  'Kairouan',           'القيروان',        'Kairouan',           'city', true,  35.6781, 10.0963,  70),
  ('haffouz',            'kairouan',  'Haffouz',            'حفوز',            'Haffouz',            'city', false, 35.6333,  9.6667,  25),
  ('sbikha',             'kairouan',  'Sbikha',             'السبيخة',         'Sbikha',             'city', false, 35.9333, 10.0167,  30),

  -- Kasserine
  ('kasserine',          'kasserine', 'Kasserine',          'القصرين',         'Kasserine',          'city', true,  35.1676,  8.8365,  45),
  ('sbeitla',            'kasserine', 'Sbeïtla',            'سبيطلة',          'Sbeitla',            'city', false, 35.2333,  9.1167,  30),
  ('feriana',            'kasserine', 'Fériana',            'فريانة',          'Feriana',            'city', false, 34.9500,  8.5667,  20),
  ('thala',              'kasserine', 'Thala',              'تالة',            'Thala',              'city', false, 35.5667,  8.6667,  20),

  -- Sidi Bouzid
  ('sidi-bouzid',        'sidi-bouzid','Sidi Bouzid',       'سيدي بوزيد',      'Sidi Bouzid',        'city', true,  35.0382,  9.4849,  45),
  ('regueb',             'sidi-bouzid','Regueb',            'الرقاب',          'Regueb',             'city', false, 34.8592,  9.7864,  20),
  ('meknassy',           'sidi-bouzid','Meknassy',          'المكناسي',        'Meknassy',           'city', false, 34.6000,  9.6000,  20),

  -- Gabès
  ('gabes',              'gabes',     'Gabès',              'قابس',            'Gabes',              'city', true,  33.8815, 10.0982,  55),
  ('el-hamma',           'gabes',     'El Hamma',           'الحامة',          'El Hamma',           'city', false, 33.8833,  9.8000,  25),
  ('mareth',             'gabes',     'Mareth',             'مارث',            'Mareth',             'city', false, 33.6333, 10.3000,  25),

  -- Médenine
  ('medenine',           'medenine',  'Médenine',           'مدنين',           'Medenine',           'city', true,  33.3549, 10.5055,  45),
  ('houmt-souk',         'medenine',  'Djerba Houmt Souk',  'جربة حومة السوق', 'Djerba Houmt Souk',  'city', false, 33.8756, 10.8575,  55),
  ('midoun',             'medenine',  'Djerba Midoun',      'جربة ميدون',      'Djerba Midoun',      'city', false, 33.8083, 10.9917,  35),
  ('zarzis',             'medenine',  'Zarzis',             'جرجيس',           'Zarzis',             'city', false, 33.5039, 11.1122,  40),
  ('ben-gardane',        'medenine',  'Ben Gardane',        'بن قردان',        'Ben Gardane',        'city', false, 33.1378, 11.2197,  30),
  ('aeroport-djerba',    'medenine',  'Aéroport Djerba-Zarzis', 'مطار جربة جرجيس', 'Djerba-Zarzis Airport', 'airport', false, 33.8750, 10.7755, 35),

  -- Tataouine
  ('tataouine',          'tataouine', 'Tataouine',          'تطاوين',          'Tataouine',          'city', true,  32.9297, 10.4518,  35),
  ('ghomrassen',         'tataouine', 'Ghomrassen',         'غمراسن',          'Ghomrassen',         'city', false, 33.0592, 10.3403,  15),

  -- Gafsa
  ('gafsa',              'gafsa',     'Gafsa',              'قفصة',            'Gafsa',              'city', true,  34.4250,  8.7842,  45),
  ('metlaoui',           'gafsa',     'Métlaoui',           'المتلوي',         'Metlaoui',           'city', false, 34.3214,  8.4014,  25),
  ('redeyef',            'gafsa',     'Redeyef',            'الرديف',          'Redeyef',            'city', false, 34.3833,  8.1500,  15),
  ('moulares',           'gafsa',     'Moularès',           'أم العرائس',      'Moulares',           'city', false, 34.4833,  8.2667,  15),

  -- Tozeur
  ('tozeur',             'tozeur',    'Tozeur',             'توزر',            'Tozeur',             'city', true,  33.9197,  8.1335,  35),
  ('nefta',              'tozeur',    'Nefta',              'نفطة',            'Nefta',              'city', false, 33.8731,  7.8778,  20),

  -- Kébili
  ('kebili',             'kebili',    'Kébili',             'قبلي',            'Kebili',             'city', true,  33.7044,  8.9690,  30),
  ('douz',               'kebili',    'Douz',               'دوز',             'Douz',               'city', false, 33.4572,  9.0203,  25)
on conflict (slug) do nothing;
