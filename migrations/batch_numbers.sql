-- Migration: Add batch_number column to products
ALTER TABLE products ADD COLUMN batch_number TEXT DEFAULT NULL;

-- ── GLP Research ──────────────────────────────────────────────────────────────
UPDATE products SET batch_number = 'GLP-202606-001' WHERE id = 2;   -- AOD-9604 10mg
UPDATE products SET batch_number = 'GLP-202606-002' WHERE id = 7;   -- CAGRILINTIDE 10mg
UPDATE products SET batch_number = 'GLP-202606-003' WHERE id = 18;  -- FRAG 176-191 10mg
UPDATE products SET batch_number = 'GLP-202606-004' WHERE id = 31;  -- LIPO-C 10mg
UPDATE products SET batch_number = 'GLP-202606-005' WHERE id = 42;  -- PL-1S 30mg
UPDATE products SET batch_number = 'GLP-202606-006' WHERE id = 43;  -- PL-2T 30mg
UPDATE products SET batch_number = 'GLP-202606-007' WHERE id = 44;  -- PL-2T 60mg
UPDATE products SET batch_number = 'GLP-202606-008' WHERE id = 45;  -- PL-2T 100mg
UPDATE products SET batch_number = 'GLP-202606-009' WHERE id = 46;  -- PL-2T 120mg
UPDATE products SET batch_number = 'GLP-202606-010' WHERE id = 47;  -- PL-3R 10mg
UPDATE products SET batch_number = 'GLP-202606-011' WHERE id = 48;  -- PL-3R 20mg
UPDATE products SET batch_number = 'GLP-202606-012' WHERE id = 49;  -- PL-3R 30mg
UPDATE products SET batch_number = 'GLP-202606-013' WHERE id = 50;  -- PL-3R 60mg
UPDATE products SET batch_number = 'GLP-202606-014' WHERE id = 51;  -- PL-3R 120mg
UPDATE products SET batch_number = 'GLP-202606-015' WHERE id = 62;  -- TESAMORELIN 10mg
UPDATE products SET batch_number = 'GLP-202606-016' WHERE id = 63;  -- TESAMORELIN 20mg
UPDATE products SET batch_number = 'GLP-202606-017' WHERE id = 64;  -- TESAMORELIN 30mg

-- ── Longevity Research ────────────────────────────────────────────────────────
UPDATE products SET batch_number = 'LNG-202606-001' WHERE id = 14;  -- EPITHALON 10mg
UPDATE products SET batch_number = 'LNG-202606-002' WHERE id = 15;  -- EPITHALON 50mg
UPDATE products SET batch_number = 'LNG-202606-003' WHERE id = 17;  -- FOXO4-DRI 10mg
UPDATE products SET batch_number = 'LNG-202606-004' WHERE id = 24;  -- GLUTATHIONE 1500mg
UPDATE products SET batch_number = 'LNG-202606-005' WHERE id = 36;  -- MOTS-C 10mg
UPDATE products SET batch_number = 'LNG-202606-006' WHERE id = 37;  -- MOTS-C 30mg
UPDATE products SET batch_number = 'LNG-202606-007' WHERE id = 38;  -- MOTS-C 50mg
UPDATE products SET batch_number = 'LNG-202606-008' WHERE id = 39;  -- NAD+ 500mg
UPDATE products SET batch_number = 'LNG-202606-009' WHERE id = 40;  -- NAD+ 1000mg
UPDATE products SET batch_number = 'LNG-202606-010' WHERE id = 58;  -- SS-31 10mg
UPDATE products SET batch_number = 'LNG-202606-011' WHERE id = 59;  -- SS-31 50mg

-- ── Neural & Cognitive ────────────────────────────────────────────────────────
UPDATE products SET batch_number = 'NEU-202606-001' WHERE id = 13;  -- DSIP 10mg
UPDATE products SET batch_number = 'NEU-202606-002' WHERE id = 28;  -- KISSPEPTIN 10mg
UPDATE products SET batch_number = 'NEU-202606-003' WHERE id = 41;  -- NEUROREGULATORY BLEND 30mg
UPDATE products SET batch_number = 'NEU-202606-004' WHERE id = 52;  -- PT-141 10mg
UPDATE products SET batch_number = 'NEU-202606-005' WHERE id = 55;  -- SELANK 10mg
UPDATE products SET batch_number = 'NEU-202606-006' WHERE id = 56;  -- SEMAX 10mg
UPDATE products SET batch_number = 'NEU-202606-007' WHERE id = 66;  -- VIP 10mg

-- ── Peptide Hormones ──────────────────────────────────────────────────────────
UPDATE products SET batch_number = 'PHM-202606-001' WHERE id = 8;   -- CJC-1295 + DAC 5mg
UPDATE products SET batch_number = 'PHM-202606-002' WHERE id = 9;   -- CJC-1295 + DAC 10mg
UPDATE products SET batch_number = 'PHM-202606-003' WHERE id = 10;  -- CJC-1295 + IPA 10mg
UPDATE products SET batch_number = 'PHM-202606-004' WHERE id = 11;  -- CJC-1295 + IPA 20mg
UPDATE products SET batch_number = 'PHM-202606-005' WHERE id = 12;  -- CJC-1295 - NO DAC 10mg
UPDATE products SET batch_number = 'PHM-202606-006' WHERE id = 16;  -- FOLLISTATIN 1mg
UPDATE products SET batch_number = 'PHM-202606-007' WHERE id = 21;  -- GHRP-2 10mg
UPDATE products SET batch_number = 'PHM-202606-008' WHERE id = 22;  -- GHRP-2 / GHRP-6 20mg
UPDATE products SET batch_number = 'PHM-202606-009' WHERE id = 23;  -- GHRP-6 10mg
UPDATE products SET batch_number = 'PHM-202606-010' WHERE id = 25;  -- HEXARELIN 10mg
UPDATE products SET batch_number = 'PHM-202606-011' WHERE id = 26;  -- IGF-1 LR3 1mg
UPDATE products SET batch_number = 'PHM-202606-012' WHERE id = 27;  -- IPAMORELIN 10mg
UPDATE products SET batch_number = 'PHM-202606-013' WHERE id = 34;  -- MELANOTAN I 10mg
UPDATE products SET batch_number = 'PHM-202606-014' WHERE id = 35;  -- MELANOTAN II 10mg
UPDATE products SET batch_number = 'PHM-202606-015' WHERE id = 57;  -- SERMORELIN 10mg

-- ── Recovery & Repair ─────────────────────────────────────────────────────────
UPDATE products SET batch_number = 'REC-202606-001' WHERE id = 3;   -- BPC-157 10mg
UPDATE products SET batch_number = 'REC-202606-002' WHERE id = 4;   -- BPC-157 20mg
UPDATE products SET batch_number = 'REC-202606-003' WHERE id = 67;  -- BPC-157 + TB-500 20mg
UPDATE products SET batch_number = 'REC-202606-004' WHERE id = 5;   -- BPC-157 + TB-500 + GHK-CU 70mg
UPDATE products SET batch_number = 'REC-202606-005' WHERE id = 6;   -- BPC-157 + TB-500 + GHK-CU + KPV 80mg
UPDATE products SET batch_number = 'REC-202606-006' WHERE id = 19;  -- GHK-CU 50mg
UPDATE products SET batch_number = 'REC-202606-007' WHERE id = 20;  -- GHK-CU 100mg
UPDATE products SET batch_number = 'REC-202606-008' WHERE id = 29;  -- KPV 10mg
UPDATE products SET batch_number = 'REC-202606-009' WHERE id = 30;  -- KPV 50mg
UPDATE products SET batch_number = 'REC-202606-010' WHERE id = 32;  -- LL-37 10mg
UPDATE products SET batch_number = 'REC-202606-011' WHERE id = 33;  -- LL-37 20mg
UPDATE products SET batch_number = 'REC-202606-012' WHERE id = 60;  -- TB-500 10mg
UPDATE products SET batch_number = 'REC-202606-013' WHERE id = 61;  -- TB-500 20mg
UPDATE products SET batch_number = 'REC-202606-014' WHERE id = 65;  -- THYMOSIN ALPHA-1 10mg

-- ── Research Supplies ─────────────────────────────────────────────────────────
UPDATE products SET batch_number = 'SUP-202606-001' WHERE id = 53;  -- RECONSTITUTION SOLUTION 3ml
UPDATE products SET batch_number = 'SUP-202606-002' WHERE id = 54;  -- RECONSTITUTION SOLUTION 10ml
