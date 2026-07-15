-- Synthetic, non-production data for the isolated 4kistest environment.
-- IDs in the 900000 range are reserved for this repeatable test fixture.

begin;

insert into public.users
  (id, username, "fullName", email, role, "operatingUnit", password, visibility_scope, requires_approver, approver_id, permissions_override)
overriding system value
values
  (900001, 'testadmin', 'Test Environment Administrator', 'testadmin@4kistest.local', 'Administrator', 'NPMO', 'Test4K!2026', 'All OUs', false, null, '{}'::jsonb),
  (900002, 'testfocal', 'Cordillera Test Focal', 'testfocal@4kistest.local', 'Focal - User', 'RPMO CAR', 'Test4K!2026', 'Own OU', true, 900001, '{}'::jsonb),
  (900003, 'testrfo', 'Region I Test User', 'testrfo@4kistest.local', 'RFO - User', 'RPMO 1', 'Test4K!2026', 'Own OU', true, 900001, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.user_roles_config (role_name, permissions_default)
values
  ('Administrator', '{"scope":"all","canApprove":true}'::jsonb),
  ('Focal - User', '{"scope":"own_ou","canApprove":false}'::jsonb),
  ('RFO - User', '{"scope":"own_ou","canApprove":false}'::jsonb)
on conflict (role_name) do nothing;

insert into public.roles_config
  (id, role, module, can_view, can_edit, can_delete, visibility_scope)
select
  9000 + row_number() over (), role_name, module_name,
  true,
  role_name in ('Administrator', 'Focal - User'),
  role_name = 'Administrator',
  case when role_name = 'Administrator' then 'All OUs' else 'Own OU' end
from unnest(array['Administrator', 'Focal - User', 'RFO - User']) role_name
cross join unnest(array[
  'Dashboards', 'Reports', 'Subprojects', 'Activities', 'Program Management',
  'Accomplishment - Financial', 'Accomplishment - Physical', 'IPO Management',
  'Marketing Database', 'Level of Development', 'Commodity Mapping',
  'References', 'System Management'
]) module_name
on conflict (role, module) do nothing;

insert into public.reference_uacs (id, "objectType", particular, "uacsCode", description)
values
  ('TEST-UACS-MOOE-01', 'MOOE', 'Training Expenses', '50202010-00', 'Synthetic training expense code'),
  ('TEST-UACS-CO-01', 'CO', 'Agricultural Machinery', '50604020-00', 'Synthetic machinery code'),
  ('TEST-UACS-PS-01', 'PS', 'Contractual Personnel', '50101020-00', 'Synthetic personnel code')
on conflict (id) do nothing;

insert into public.reference_particulars (id, type, particular)
values
  ('TEST-PART-01', 'MOOE', 'Training materials and meals'),
  ('TEST-PART-02', 'MOOE', 'Monitoring and field validation'),
  ('TEST-PART-03', 'CO', 'Post-harvest equipment')
on conflict (id) do nothing;

insert into public.reference_commodities (id, type, particular)
values
  ('TEST-COM-RICE', 'Crops', 'Heirloom Rice'),
  ('TEST-COM-COFFEE', 'Crops', 'Arabica Coffee'),
  ('TEST-COM-GOAT', 'Livestock', 'Native Goat')
on conflict (id) do nothing;

insert into public.reference_activities (id, component, activity_name, type)
overriding system value
values
  (900001, 'Social Preparation', 'IPO Organizational Strengthening', 'Training'),
  (900002, 'Production and Livelihood', 'Good Agricultural Practices', 'Training'),
  (900003, 'Marketing and Enterprise', 'Market Matching and Test Buy', 'Activity')
on conflict (id) do nothing;

insert into public.ref_equipment_categories (id, category_name, description)
values
  (9001, 'Post-Harvest', 'Synthetic post-harvest equipment category'),
  (9002, 'Farm Machinery', 'Synthetic farm machinery category')
on conflict (id) do nothing;

insert into public.ref_equipment
  (id, name, category, equipment_type, power_source, capacity_rating, unit_cost_estimate, estimated_useful_life_years, maintenance_interval_months, required_operators, safety_gear_required)
values
  (9001, 'Test Coffee Pulper', 'Post-Harvest', 'Pulper', 'Electric', '500 kg/hour', 185000, 8, 6, 2, 'Gloves, eye protection'),
  (9002, 'Test Hand Tractor', 'Farm Machinery', 'Two-wheel tractor', 'Diesel', '12 HP', 220000, 10, 6, 1, 'Boots, hearing protection')
on conflict (id) do nothing;

insert into public.ref_commodities
  (id, name, banner_program, commodity_group, min_elevation_masl, max_elevation_masl, max_slope_percent, ph_min, ph_max, climate_type_suitability, wet_season_start, dry_season_start, harvest_period_days, recommended_soil, fertilizer_npk, watering_method, target_yield_ha)
values
  (9001, 'Test Arabica Coffee', 'High Value Crops', 'Coffee', 800, 1800, 30, 5.0, 6.5, 'Type I and III', 'May', 'November', 1095, 'Well-drained loam', '14-14-14', 'Drip or rainfall', 1.50),
  (9002, 'Test Heirloom Rice', 'Rice', 'Rice', 500, 1600, 20, 5.5, 7.0, 'Type I and III', 'May', 'November', 150, 'Clay loam terraces', '46-0-0', 'Terrace irrigation', 3.20)
on conflict (id) do nothing;

insert into public.ref_infrastructure
  (id, name, category, structure_type, capacity_rating, estimated_useful_life_years, unit_cost_estimate, maintenance_interval_months, required_permits)
values
  (9001, 'Test Coffee Processing Center', 'Post-Harvest Facility', 'Single-storey processing building', '2 tons/day', 20, 3500000, 12, 'Building permit; environmental clearance')
on conflict (id) do nothing;

insert into public.ref_inputs
  (id, input_type, sub_type, name, standard_uom, avg_price_2026, fpa_registration_no, shelf_life_months, application_rate_per_ha, hazchem_rating)
values
  (9001, 'Fertilizer', 'Organic', 'Test Organic Soil Conditioner', 'bag', 650, 'TEST-FPA-001', 24, '10 bags/ha', 'Low'),
  (9002, 'Planting Material', 'Seedling', 'Test Arabica Seedling', 'piece', 35, null, 6, '1100 seedlings/ha', 'None')
on conflict (id) do nothing;

insert into public.ref_livestock
  (id, name, category, breed_type, min_space_sqm_per_head, housing_type, min_temp_celsius, max_temp_celsius, gestation_incubation_days, maturity_days, productive_years, feed_type, target_fcr, water_liters_per_day, target_weight_kg)
values
  (9001, 'Test Native Goat', 'Small Ruminant', 'Upgraded native', 1.50, 'Elevated shed', 18, 32, 150, 300, 6, 'Forage and concentrate', 5.0, 5.0, 35.0)
on conflict (id) do nothing;

insert into public.ref_trainings
  (id, title, category, standard_duration_days, delivery_mode, target_audience, accrediting_body, minimum_participants, required_facilities, key_modules, expected_competency, certification_type)
values
  (9001, 'Test Good Agricultural Practices Training', 'Production', 3, 'Face-to-Face', 'IPO farmer-members', 'DA-ATI', 20, 'Training hall and demo farm', 'Farm planning; crop care; records', 'Apply GAP on a community farm', 'Certificate of Completion'),
  (9002, 'Test Enterprise Development Workshop', 'Enterprise', 2, 'Blended', 'IPO officers and bookkeepers', 'DA-ATI', 15, 'Training hall with internet', 'Costing; pricing; market planning', 'Prepare a simple enterprise plan', 'Certificate of Participation')
on conflict (id) do nothing;

insert into public.gida_areas (id, region, province, municipality, barangay)
overriding system value
values (900001, 'CAR', 'Ifugao', 'Banaue', 'Test Barangay GIDA')
on conflict (id) do nothing;

insert into public.elcac_areas (id, region, province, municipality, barangay)
values ('00000000-0000-4000-8000-000000009001', 'Region I', 'Ilocos Norte', 'Piddig', 'Test Barangay ELCAC')
on conflict (id) do nothing;

insert into public.ipos
  (id, name, location, region, commodities, "levelOfDevelopment", "registrationDate", "isWomenLed", "isWithinGida", "isWithinElcac", "isWithScad", "indigenousCulturalCommunity", "ancestralDomainNo", "registeringBody", "contactPerson", "contactNumber", history, lat, lng, "totalMembers", "totalIpMembers", "totalMaleMembers", "totalFemaleMembers", "totalYouthMembers", "totalSeniorMembers", "total4PsMembers", workflow_status)
values
  (900001, 'Banaue Highland Growers Test IPO', 'Banaue, Ifugao', 'CAR', '[{"type":"Crops","particular":"Heirloom Rice","value":42,"yield":3.1,"marketingPercentage":60,"foodSecurityPercentage":40}]'::jsonb, 3, '2022-03-15', true, true, false, false, 'Tuwali Ifugao', 'CADT-TEST-001', 'DOLE', 'Maria Test', '09170000001', '[{"date":"2026-01-10","event":"Synthetic profile created","user":"Test Environment Administrator"}]'::jsonb, 16.9186, 121.0592, 85, 85, 38, 47, 24, 9, 18, 'APPROVED'),
  (900002, 'Cordillera Coffee Producers Test IPO', 'Atok, Benguet', 'CAR', '[{"type":"Crops","particular":"Arabica Coffee","value":28,"yield":1.4,"marketingPercentage":85,"foodSecurityPercentage":15}]'::jsonb, 4, '2021-08-20', false, true, false, false, 'Kankanaey', 'CADT-TEST-002', 'CDA', 'Juan Test', '09170000002', '[{"date":"2026-01-12","event":"Synthetic profile created","user":"Test Environment Administrator"}]'::jsonb, 16.5722, 120.6994, 64, 61, 35, 29, 16, 7, 11, 'APPROVED'),
  (900003, 'Ilocos Native Goat Raisers Test IPO', 'Piddig, Ilocos Norte', 'Region I', '[{"type":"Livestock","particular":"Native Goat","value":120,"marketingPercentage":75,"foodSecurityPercentage":25}]'::jsonb, 2, '2023-06-01', true, false, true, false, 'Isnag', 'CADT-TEST-003', 'DOLE', 'Ana Test', '09170000003', '[{"date":"2026-01-15","event":"Synthetic profile created","user":"Test Environment Administrator"}]'::jsonb, 18.1667, 120.7167, 52, 49, 21, 31, 14, 5, 16, 'APPROVED')
on conflict (id) do nothing;

insert into public.ipo_history (id, ipo_id, date, event, "user")
overriding system value
values
  (900001, 900001, '2026-01-10', 'Test IPO profile approved', 'Test Environment Administrator'),
  (900002, 900002, '2026-01-12', 'Test IPO profile approved', 'Test Environment Administrator'),
  (900003, 900003, '2026-01-15', 'Test IPO profile approved', 'Test Environment Administrator')
on conflict (id) do nothing;

insert into public.lod_level_configs (id, level, min_score, max_score)
values
  (9001, 1, 0, 19.99), (9002, 2, 20, 39.99), (9003, 3, 40, 59.99),
  (9004, 4, 60, 79.99), (9005, 5, 80, 100)
on conflict (id) do nothing;

insert into public.lod_sections (id, title, description, "order", weight, code)
values
  (9001, 'Test Organizational Capacity', 'Synthetic governance and management section', 1, 50, 'TEST-ORG'),
  (9002, 'Test Enterprise Readiness', 'Synthetic production and market section', 2, 50, 'TEST-ENT')
on conflict (id) do nothing;

insert into public.lod_questions
  (id, section_id, text, weight, "order", description, code, is_calculation_mode, actual_label, total_label)
values
  (9001, 9001, 'Does the test IPO maintain current organizational records?', 10, 1, 'Check minutes and membership records', 'TEST-ORG-01', false, null, null),
  (9002, 9002, 'What share of planned production was delivered?', 10, 1, 'Synthetic delivery ratio', 'TEST-ENT-01', true, 'Delivered volume', 'Planned volume')
on conflict (id) do nothing;

insert into public.lod_choices (id, question_id, text, points, "order")
values
  (9001, 9001, 'No records', 0, 1),
  (9002, 9001, 'Partially updated', 5, 2),
  (9003, 9001, 'Complete and updated', 10, 3)
on conflict (id) do nothing;

insert into public.lod_assessments
  (id, ipo_id, year, total_score, computed_level, remarks, assessed_by, assessor_name)
values
  (9001, 900001, 2026, 55, 3, 'Synthetic mid-level assessment', 'testadmin', 'Test Environment Administrator'),
  (9002, 900002, 2026, 75, 4, 'Synthetic advanced assessment', 'testadmin', 'Test Environment Administrator'),
  (9003, 900003, 2026, 35, 2, 'Synthetic developing assessment', 'testadmin', 'Test Environment Administrator')
on conflict (id) do nothing;

insert into public.lod_answers
  (id, assessment_id, question_id, choice_id, points_earned, remarks, actual_value, total_value)
values
  (9001, 9001, 9001, 9003, 10, 'Complete test records', null, null),
  (9002, 9001, 9002, null, 7.5, '75 percent delivery', 75, 100),
  (9003, 9002, 9001, 9003, 10, 'Complete test records', null, null),
  (9004, 9003, 9001, 9002, 5, 'Partial test records', null, null)
on conflict (id) do nothing;

insert into public.subprojects
  (id, uid, name, status, location, "indigenousPeopleOrganization", details, "startDate", "estimatedCompletionDate", "actualCompletionDate", "fundType", "fundingYear", ipo_id, "subprojectCommodities", "packageType", remarks, lat, lng, history, tier, "operatingUnit", "encodedBy", "actualPWD", "actualMuslim", "actualLGBTQ", "actualSoloParent", "actualSenior", "actualYouth", workflow_status)
values
  (900001, 'SP-TEST-2026-001', 'Heirloom Rice Production Support Test Project', 'Ongoing', 'Banaue, Ifugao', 'Banaue Highland Growers Test IPO', '[{"id":900101,"type":"Inputs","particulars":"Organic soil conditioner","deliveryDate":"2026-04-15","unitOfMeasure":"bag","pricePerUnit":650,"numberOfUnits":200,"objectType":"MOOE","expenseParticular":"Agricultural inputs","uacsCode":"50202010-00","obligationMonth":"March","disbursementMonth":"April","actualDeliveryDate":"2026-04-18","actualNumberOfUnits":200,"actualObligationAmount":130000,"actualDisbursementAmount":100000,"obligations":[{"id":1,"amount":130000,"date":"2026-03-20","remarks":"Test obligation"}],"disbursements":[{"id":1,"amount":100000,"date":"2026-04-25","remarks":"Test partial payment"}]}]'::jsonb, '2026-02-01', '2026-11-30', null, 'Current', 2026, 900001, '[{"typeName":"Crops","name":"Heirloom Rice","area":42,"averageYield":3.1,"actualYield":2.8,"marketingPercentage":60,"foodSecurityPercentage":40}]'::jsonb, 'Input Support', 'Synthetic ongoing subproject', 16.9186, 121.0592, '[{"date":"2026-02-01","event":"Test project approved","user":"Test Environment Administrator"}]'::jsonb, 'Tier 1', 'RPMO CAR', 'Test Environment Administrator', 3, 0, 0, 2, 5, 18, 'APPROVED'),
  (900002, 'SP-TEST-2026-002', 'Coffee Processing Center Test Project', 'Proposed', 'Atok, Benguet', 'Cordillera Coffee Producers Test IPO', '[{"id":900201,"type":"Infrastructure","particulars":"Coffee processing center","deliveryDate":"2027-03-30","unitOfMeasure":"facility","pricePerUnit":3500000,"numberOfUnits":1,"objectType":"CO","expenseParticular":"Post-harvest facility","uacsCode":"50604020-00","obligationMonth":"September","disbursementMonth":"December"}]'::jsonb, '2026-09-01', '2027-03-30', null, 'Current', 2026, 900002, '[{"typeName":"Crops","name":"Arabica Coffee","area":28,"averageYield":1.4,"marketingPercentage":85,"foodSecurityPercentage":15}]'::jsonb, 'Infrastructure', 'Synthetic proposed subproject', 16.5722, 120.6994, '[]'::jsonb, 'Tier 2', 'RPMO CAR', 'Cordillera Test Focal', 0, 0, 0, 0, 0, 0, 'PENDING'),
  (900003, 'SP-TEST-2025-003', 'Native Goat Multiplier Farm Test Project', 'Completed', 'Piddig, Ilocos Norte', 'Ilocos Native Goat Raisers Test IPO', '[{"id":900301,"type":"Livestock","particulars":"Upgraded native goats","deliveryDate":"2025-07-15","unitOfMeasure":"head","pricePerUnit":8500,"numberOfUnits":30,"objectType":"MOOE","expenseParticular":"Livestock stocks","uacsCode":"50202010-00","obligationMonth":"May","disbursementMonth":"July","actualDeliveryDate":"2025-07-16","actualNumberOfUnits":30,"actualObligationAmount":255000,"actualDisbursementAmount":255000,"isCompleted":true}]'::jsonb, '2025-02-01', '2025-09-30', '2025-09-20', 'Continuing', 2025, 900003, '[{"typeName":"Livestock","name":"Native Goat","area":120,"marketingPercentage":75,"foodSecurityPercentage":25}]'::jsonb, 'Livestock Support', 'Synthetic completed subproject', 18.1667, 120.7167, '[{"date":"2025-09-20","event":"Test project completed","user":"Region I Test User"}]'::jsonb, 'Tier 1', 'RPMO 1', 'Region I Test User', 2, 0, 0, 3, 4, 12, 'APPROVED')
on conflict (id) do nothing;

insert into public.subproject_accomplishments
  (id, subproject_id, detail_id, delivery_date, quantity, remarks, created_by)
overriding system value
values
  (900001, 900001, 900101, '2026-04-18', 200, 'Synthetic full delivery', 'testfocal'),
  (900002, 900003, 900301, '2025-07-16', 30, 'Synthetic completed delivery', 'testrfo')
on conflict (id) do nothing;

insert into public.activities
  (id, uid, type, name, date, "endDate", description, location, facilitator, "participatingIpos", participating_ipo_ids, lat, lng, "participantsMale", "participantsFemale", expenses, component, "fundingYear", "fundType", tier, "operatingUnit", "encodedBy", status, "actualDate", "actualEndDate", "actualParticipantsMale", "actualParticipantsFemale", "actualPWD", "actualSenior", "actualYouth", workflow_status, physical_accomplishment_submitted_at, reference_activity_id)
values
  (900001, 'ACT-TEST-2026-001', 'Training', 'Good Agricultural Practices Test Training', '2026-03-10', '2026-03-12', 'Synthetic three-day production training', 'Banaue, Ifugao', 'DA-ATI Test Facilitator', '["Banaue Highland Growers Test IPO","Cordillera Coffee Producers Test IPO"]'::jsonb, '[900001,900002]'::jsonb, 16.9186, 121.0592, 18, 27, '[{"id":900101,"objectType":"MOOE","expenseParticular":"Training materials and meals","uacsCode":"50202010-00","obligationMonth":"February","disbursementMonth":"March","amount":180000,"actualObligationAmount":180000,"actualDisbursementAmount":175000}]'::jsonb, 'Production and Livelihood', 2026, 'Current', 'Tier 1', 'RPMO CAR', 'Cordillera Test Focal', 'Completed', '2026-03-10', '2026-03-12', 17, 26, 2, 4, 13, 'APPROVED', '2026-03-13 09:00:00+08', 900002),
  (900002, 'ACT-TEST-2026-002', 'Activity', 'Market Matching and Test Buy Activity', '2026-08-15', '2026-08-15', 'Synthetic market matching event', 'Baguio City', null, '["Cordillera Coffee Producers Test IPO"]'::jsonb, '[900002]'::jsonb, 16.4023, 120.5960, 12, 14, '[{"id":900201,"objectType":"MOOE","expenseParticular":"Venue and transport","uacsCode":"50202010-00","obligationMonth":"July","disbursementMonth":"August","amount":95000}]'::jsonb, 'Marketing and Enterprise', 2026, 'Current', 'Tier 1', 'RPMO CAR', 'Cordillera Test Focal', 'Ongoing', null, null, null, null, 0, 0, 0, 'APPROVED', null, 900003),
  (900003, 'ACT-TEST-2026-003', 'Training', 'IPO Organizational Strengthening Test Workshop', '2026-10-05', '2026-10-06', 'Synthetic organizational workshop', 'Laoag City', 'Test Resource Person', '["Ilocos Native Goat Raisers Test IPO"]'::jsonb, '[900003]'::jsonb, 18.1960, 120.5927, 10, 20, '[{"id":900301,"objectType":"MOOE","expenseParticular":"Workshop costs","uacsCode":"50202010-00","obligationMonth":"September","disbursementMonth":"October","amount":120000}]'::jsonb, 'Social Preparation', 2026, 'Current', 'Tier 2', 'RPMO 1', 'Region I Test User', 'Proposed', null, null, null, null, 0, 0, 0, 'PENDING', null, 900001)
on conflict (id) do nothing;

insert into public.activity_monitoring_reports
  (id, activity_id, ipo_id, status, findings, issues, recommendations, reported_by, reported_by_name)
overriding system value
values
  (900001, 900001, 900001, 'Completed', 'Attendance and learning outputs met the test targets.', 'Two participants arrived late.', 'Schedule travel a day earlier for remote participants.', 900002, 'Cordillera Test Focal'),
  (900002, 900002, 900002, 'Ongoing', 'Buyer and IPO completed an initial product presentation.', 'Packaging samples need revision.', 'Finalize labels before the test-buy date.', 900002, 'Cordillera Test Focal')
on conflict (id) do nothing;

insert into public.activity_monitoring_actions
  (id, monitoring_report_id, action_taken, created_by, created_by_name)
overriding system value
values
  (900001, 900001, 'Added travel coordination to the next activity checklist.', 900002, 'Cordillera Test Focal'),
  (900002, 900002, 'Scheduled a packaging clinic with the buyer.', 900002, 'Cordillera Test Focal')
on conflict (id) do nothing;

insert into public.budget_ceilings (id, operating_unit, year, amount)
overriding system value
values
  (900001, 'NPMO', 2026, 25000000),
  (900002, 'RPMO CAR', 2026, 18500000),
  (900003, 'RPMO 1', 2026, 12500000)
on conflict (id) do nothing;

insert into public.financial_obligations
  (id, entity_type, parent_id, item_id, obligation_date, amount, remarks)
overriding system value
values
  (900001, 'subproject', 900001, '900101', '2026-03-20', 130000, 'Synthetic input obligation'),
  (900002, 'activity', 900001, '900101', '2026-02-25', 180000, 'Synthetic training obligation'),
  (900003, 'office_requirement', 900001, null, '2026-01-20', 185000, 'Synthetic equipment obligation')
on conflict (id) do nothing;

insert into public.financial_disbursements
  (id, entity_type, parent_id, item_id, disbursement_date, amount, remarks)
overriding system value
values
  (900001, 'subproject', 900001, '900101', '2026-04-25', 100000, 'Synthetic partial input payment'),
  (900002, 'activity', 900001, '900101', '2026-03-28', 175000, 'Synthetic training payment'),
  (900003, 'office_requirement', 900001, null, '2026-02-15', 185000, 'Synthetic equipment payment')
on conflict (id) do nothing;

insert into public.budget_item_adjustment_history
  (id, source_type, parent_id, item_id, action, before_snapshot, after_snapshot, amount_delta, reason, created_by, created_by_name)
values
  (900001, 'subproject_detail', 900001, '900101', 'edit_adjustment_item', '{"amount":125000}'::jsonb, '{"amount":130000}'::jsonb, 5000, 'Synthetic price update for testing', 'testadmin', 'Test Environment Administrator'),
  (900002, 'activity_expense', 900002, '900201', 'tag_realignment', '{"isRealignment":false}'::jsonb, '{"isRealignment":true}'::jsonb, 0, 'Synthetic realignment scenario', 'testadmin', 'Test Environment Administrator')
on conflict (id) do nothing;

insert into public.staffing_requirements
  (id, uid, "operatingUnit", "uacsCode", "obligationDate", "disbursementDate", "fundType", "fundYear", tier, "encodedBy", "personnelPosition", status, "salaryGrade", "annualSalary", "personnelType", expenses, "hiringStatus", component, workflow_status, obligations)
overriding system value
values
  (900001, 'STAFF-TEST-2026-001', 'NPMO', '50101020-00', '2026-01-15', '2026-01-31', 'Current', 2026, 'Tier 1', 'Test Environment Administrator', 'Test Monitoring Specialist', 'Contractual', 15, 612000, 'Technical', '[{"id":900101,"objectType":"MOOE","expenseParticular":"Contractual personnel services","uacsCode":"50101020-00","obligationDate":"2026-01-15","disbursementDate":"2026-01-31","amount":51000}]'::jsonb, 'Filled', 'Program Management', 'APPROVED', '[{"id":1,"amount":51000,"date":"2026-01-15","remarks":"January test payroll"}]'::jsonb)
on conflict (id) do nothing;

insert into public.office_requirements
  (id, uid, "operatingUnit", "uacsCode", "obligationDate", "disbursementDate", "fundType", "fundYear", tier, "encodedBy", equipment, specs, purpose, "numberOfUnits", "pricePerUnit", status, "physicalDeliveryDate", workflow_status, obligations, "actualObligationAmount", "actualDisbursementAmount")
overriding system value
values
  (900001, 'OFFICE-TEST-2026-001', 'RPMO CAR', '50604020-00', '2026-01-20', '2026-02-15', 'Current', 2026, 'Tier 1', 'Cordillera Test Focal', 'Test Coffee Pulper', 'Electric, 500 kg/hour', 'Shared demonstration and processing', 1, 185000, 'Completed', '2026-02-10', 'APPROVED', '[{"id":1,"amount":185000,"date":"2026-01-20","remarks":"Test purchase order"}]'::jsonb, 185000, 185000)
on conflict (id) do nothing;

insert into public.other_program_expenses
  (id, uid, "operatingUnit", "uacsCode", "obligationDate", "disbursementDate", "fundType", "fundYear", tier, "encodedBy", particulars, amount, "obligatedAmount", status, workflow_status, obligations, "disbursementMar", "actualDisbursementMar")
overriding system value
values
  (900001, 'OPE-TEST-2026-001', 'NPMO', '50202010-00', '2026-03-05', '2026-03-25', 'Current', 2026, 'Tier 1', 'Test Environment Administrator', 'Test monitoring and coordination expense', 250000, 250000, 'Ongoing', 'APPROVED', '[{"id":1,"amount":250000,"date":"2026-03-05","remarks":"Test obligation"}]'::jsonb, 250000, 180000)
on conflict (id) do nothing;

insert into public.marketing_partners
  (id, uid, "companyName", "ownerName", "contactNumber", email, location, region, "buyerType", "paymentMethods", "commodityNeeds", "linkedIpoNames", remarks, "encodedBy", history, "marketingLinkages", workflow_status)
overriding system value
values
  (900001, 'MKT-TEST-2026-001', 'North Luzon Test Foods Corporation', 'Pedro Sample', '09170001001', 'buyer1@example.test', 'Baguio City', 'CAR', 'Private Company', '["Bank Transfer","Check"]'::jsonb, '[{"id":900101,"commodityType":"Crops","commodityName":"Arabica Coffee","qualityStandard":"Grade 1 green beans","volumeJan":500,"volumeFeb":500,"volumeMar":500,"volumeApr":500,"volumeMay":500,"volumeJun":500,"volumeJul":500,"volumeAug":500,"volumeSep":500,"volumeOct":500,"volumeNov":500,"volumeDec":500}]'::jsonb, '["Cordillera Coffee Producers Test IPO"]'::jsonb, 'Synthetic buyer used for market-linkage testing', 'Test Environment Administrator', '[{"date":"2026-05-01","event":"Test buyer encoded","user":"Test Environment Administrator"}]'::jsonb, '[{"id":900101,"region":"CAR","ipoName":"Cordillera Coffee Producers Test IPO","commodityNeedId":900101,"commodityName":"Arabica Coffee","commodityType":"Crops","negotiationStatus":"Pending Test Buy","unitOfMeasure":"KG","agreedQuantityValue":500,"agreedQuantityTimeframe":"Monthly","agreedPricePerKg":210,"agreementType":"Verbal","agreementDate":"2026-06-10","testBuyConducted":false}]'::jsonb, 'APPROVED'),
  (900002, 'MKT-TEST-2026-002', 'Ilocos Test Institutional Kitchen', 'Laura Sample', '09170001002', 'buyer2@example.test', 'Laoag City', 'Region I', 'Government', '["Bank Transfer"]'::jsonb, '[{"id":900201,"commodityType":"Livestock","commodityName":"Native Goat","qualityStandard":"Healthy 25-30 kg live weight","volumeJan":10,"volumeFeb":10,"volumeMar":10,"volumeApr":10,"volumeMay":10,"volumeJun":10,"volumeJul":10,"volumeAug":10,"volumeSep":10,"volumeOct":10,"volumeNov":10,"volumeDec":10}]'::jsonb, '["Ilocos Native Goat Raisers Test IPO"]'::jsonb, 'Synthetic institutional buyer', 'Region I Test User', '[]'::jsonb, '[]'::jsonb, 'APPROVED')
on conflict (id) do nothing;

insert into public.deadlines (id, name, date)
overriding system value
values
  (900001, 'Test Q3 Financial Report', '2026-10-10'),
  (900002, 'Test Year-End Physical Accomplishment', '2027-01-15')
on conflict (id) do nothing;

insert into public.planning_schedules (id, name, "startDate", "endDate")
overriding system value
values
  (900001, 'Test FY 2027 Planning Workshop', '2026-08-03', '2026-08-07'),
  (900002, 'Test Midyear Review', '2026-07-20', '2026-07-22')
on conflict (id) do nothing;

insert into public.award_ranking_settings (settings_key, settings, updated_by, updated_by_name)
values
  ('test_award_weights', '{"financial":35,"physical":35,"reportorial":20,"participation":10}'::jsonb, 900001, 'Test Environment Administrator')
on conflict (settings_key) do nothing;

insert into public.award_manual_scores
  (id, fund_year, period, operating_unit, reportorial_required, reportorial_submitted, national_activities_required, national_activities_attended, remarks, updated_by, updated_by_name)
values
  (900001, 2026, 'Q2', 'RPMO CAR', 6, 5, 3, 3, 'Synthetic award score', 900001, 'Test Environment Administrator'),
  (900002, 2026, 'Q2', 'RPMO 1', 6, 6, 3, 2, 'Synthetic award score', 900001, 'Test Environment Administrator')
on conflict (id) do nothing;

insert into public.dcf_policy_settings (settings_key, settings, updated_by, updated_by_name)
values
  ('dcf_editing_policy', '{"version":1,"testFixture":true,"monthLock":{"enabled":false,"dateSource":"server","graceDays":5,"blockPastMonthsAfterGrace":true,"blockFutureMonths":true,"overrideRoles":["Super Admin","Administrator"],"requireOverrideReason":true},"roleRules":{}}'::jsonb, 900001, 'Test Environment Administrator')
on conflict (settings_key) do nothing;

insert into public.report_display_settings (report_key, settings, updated_by, updated_by_name)
values
  ('test_default', '{"showTargets":true,"showActuals":true,"showVariance":true,"showRemarks":true}'::jsonb, 900001, 'Test Environment Administrator')
on conflict (report_key) do nothing;

insert into public.bar1_report_snapshots
  (id, operating_unit, fund_year, fund_type, tier, snapshot_date, report_data)
values
  ('00000000-0000-4000-8000-000000009101', 'RPMO CAR', 2026, 'Current', 'Tier 1', '2026-06-30', '{"testFixture":true,"allotment":18500000,"obligations":495000,"disbursements":455000,"physicalAccomplishment":67.5}'::jsonb)
on conflict (id) do nothing;

insert into public.google_drive_connections
  (id, connected_by, google_account_email, encrypted_refresh_token, scopes, root_folder_id, root_folder_name, status, disconnected_at)
values
  ('00000000-0000-4000-8000-000000009201', 900001, 'disconnected-test@example.test', 'NOT_A_REAL_TOKEN', array['https://www.googleapis.com/auth/drive.file'], 'TEST-ROOT-FOLDER', '4KIS Test Fixture Files', 'disconnected', now())
on conflict (id) do nothing;

insert into public.ipo_drive_folders
  (id, ipo_id, connection_id, folder_id, folder_name, created_by, module, folder_year, module_folder_id, year_folder_id, operating_unit, operating_unit_folder_id)
overriding system value
values
  (900001, 900001, '00000000-0000-4000-8000-000000009201', 'TEST-IPO-FOLDER-001', 'Banaue Highland Growers Test IPO', 900001, 'IPO Management', 2026, 'TEST-MODULE-IPO', 'TEST-YEAR-2026', 'RPMO CAR', 'TEST-OU-CAR')
on conflict (id) do nothing;

insert into public.ipo_drive_files
  (id, ipo_id, connection_id, folder_id, file_id, file_name, mime_type, file_size, uploaded_by, uploaded_by_name, module, folder_year, module_folder_id, year_folder_id, preview_supported, operating_unit, operating_unit_folder_id)
overriding system value
values
  (900001, 900001, '00000000-0000-4000-8000-000000009201', 'TEST-IPO-FOLDER-001', 'TEST-IPO-FILE-001', 'TEST IPO Profile.pdf', 'application/pdf', 102400, 900001, 'Test Environment Administrator', 'IPO Management', 2026, 'TEST-MODULE-IPO', 'TEST-YEAR-2026', false, 'RPMO CAR', 'TEST-OU-CAR')
on conflict (id) do nothing;

insert into public.activity_drive_folders
  (id, activity_id, connection_id, folder_id, folder_name, module, folder_year, operating_unit, component, activity_name, activity_type, module_folder_id, year_folder_id, operating_unit_folder_id, component_folder_id, created_by)
overriding system value
values
  (900001, 900001, '00000000-0000-4000-8000-000000009201', 'TEST-ACT-FOLDER-001', 'Good Agricultural Practices Test Training', 'Activities', 2026, 'RPMO CAR', 'Production and Livelihood', 'Good Agricultural Practices Test Training', 'Training', 'TEST-MODULE-ACT', 'TEST-YEAR-2026', 'TEST-OU-CAR', 'TEST-COMP-PROD', 900002)
on conflict (id) do nothing;

insert into public.activity_drive_files
  (id, activity_id, connection_id, folder_id, folder_name, module, folder_year, operating_unit, component, activity_name, activity_type, module_folder_id, year_folder_id, operating_unit_folder_id, component_folder_id, file_id, file_name, mime_type, file_size, preview_supported, uploaded_by, uploaded_by_name)
overriding system value
values
  (900001, 900001, '00000000-0000-4000-8000-000000009201', 'TEST-ACT-FOLDER-001', 'Good Agricultural Practices Test Training', 'Activities', 2026, 'RPMO CAR', 'Production and Livelihood', 'Good Agricultural Practices Test Training', 'Training', 'TEST-MODULE-ACT', 'TEST-YEAR-2026', 'TEST-OU-CAR', 'TEST-COMP-PROD', 'TEST-ACT-FILE-001', 'TEST Attendance Sheet.pdf', 'application/pdf', 51200, false, 900002, 'Cordillera Test Focal')
on conflict (id) do nothing;

insert into public.subproject_drive_folders
  (id, subproject_id, connection_id, folder_id, folder_name, module, folder_year, operating_unit, ipo_name, subproject_name, module_folder_id, year_folder_id, operating_unit_folder_id, ipo_folder_id, created_by)
overriding system value
values
  (900001, 900001, '00000000-0000-4000-8000-000000009201', 'TEST-SP-FOLDER-001', 'Heirloom Rice Production Support Test Project', 'Subprojects', 2026, 'RPMO CAR', 'Banaue Highland Growers Test IPO', 'Heirloom Rice Production Support Test Project', 'TEST-MODULE-SP', 'TEST-YEAR-2026', 'TEST-OU-CAR', 'TEST-IPO-FOLDER-001', 900002)
on conflict (id) do nothing;

insert into public.subproject_drive_files
  (id, subproject_id, connection_id, folder_id, folder_name, module, folder_year, operating_unit, ipo_name, subproject_name, module_folder_id, year_folder_id, operating_unit_folder_id, ipo_folder_id, file_id, file_name, mime_type, file_size, preview_supported, uploaded_by, uploaded_by_name)
overriding system value
values
  (900001, 900001, '00000000-0000-4000-8000-000000009201', 'TEST-SP-FOLDER-001', 'Heirloom Rice Production Support Test Project', 'Subprojects', 2026, 'RPMO CAR', 'Banaue Highland Growers Test IPO', 'Heirloom Rice Production Support Test Project', 'TEST-MODULE-SP', 'TEST-YEAR-2026', 'TEST-OU-CAR', 'TEST-IPO-FOLDER-001', 'TEST-SP-FILE-001', 'TEST Delivery Receipt.pdf', 'application/pdf', 76800, false, 900002, 'Cordillera Test Focal')
on conflict (id) do nothing;

insert into public.trash_bin (id, entity_type, original_id, data, deleted_by)
values
  (900001, 'activity', 899999, '{"name":"Deleted Synthetic Draft Activity","testFixture":true}'::jsonb, 'testadmin')
on conflict (id) do nothing;

insert into public.user_logs
  (id, description, username, operating_unit, entity_type, entity_id, user_role, action_metadata)
overriding system value
values
  (900001, 'Seeded the isolated 4kistest environment with synthetic data', 'testadmin', 'NPMO', 'system', '4kistest-seed', 'Administrator', '{"testFixture":true,"productionDataCopied":false}'::jsonb),
  (900002, 'Reviewed the synthetic GAP training monitoring report', 'testfocal', 'RPMO CAR', 'activity_monitoring_report', '900001', 'Focal - User', '{"testFixture":true}'::jsonb)
on conflict (id) do nothing;

commit;
