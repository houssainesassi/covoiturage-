-- =============================================================================
-- Wasalni — HISTORICAL DEMO DATA (fictional, for testing & demonstration)
--
-- * Requires migration 20261107000007_demo_data.sql.
-- * Idempotent: deterministic ids + ON CONFLICT DO NOTHING (safe to re-run).
-- * Every row is flagged is_demo = true. Demo profiles have NO auth account,
--   NO phone number and cannot sign in. All trips are in the past and are
--   'completed' or 'cancelled' — they never appear in searches.
-- * No notifications, no messages, no payments are created.
-- Remove everything with supabase/seed/demo_cleanup.sql.
-- =============================================================================
do $$
declare
  drivers text[] := array['Amine B.','Sami K.','Walid H.','Nizar T.','Rania M.','Hela S.','Karim J.','Yassine G.','Mehdi A.','Sonia R.','Fares D.','Imen Z.','Bilel C.','Olfa N.'];
  passengers text[] := array['Ahmed L.','Mariem F.','Skander O.','Ines B.','Oussama E.','Asma H.','Hamza Y.','Nour K.','Firas M.','Emna T.','Seif S.','Yosra A.','Achref R.','Chaima W.','Aziz G.','Rim D.','Khalil J.','Salma Z.','Malek I.','Wiem C.'];
  brands text[] := array['Peugeot','Renault','Kia','Hyundai','Volkswagen','Dacia','Toyota','Citroën','Fiat','Seat','Peugeot','Kia','Suzuki','Hyundai'];
  models text[] := array['301','Symbol','Rio','Accent','Polo','Logan','Corolla','C-Elysée','Tipo','Ibiza','Partner','Picanto','Swift','i20'];
  vtypes public.vehicle_type[] := array['sedan','sedan','hatchback','sedan','hatchback','sedan','sedan','sedan','sedan','hatchback','van','hatchback','hatchback','hatchback']::public.vehicle_type[];
  colors text[] := array['Blanc','Gris','Noir','Bleu','Rouge','Argent','Blanc','Gris','Noir','Blanc','Blanc','Rouge','Bleu','Gris'];
  -- origin, destination, road km, minutes, price per seat (TND)
  routes text[] := array[
    'tunis|el-fahs|62|60|7', 'tunis|zaghouan|57|55|6', 'tunis|nabeul|67|60|8',
    'tunis|hammamet|65|55|8', 'tunis|sousse|143|105|15', 'tunis|sfax|270|180|25',
    'tunis|kairouan|155|120|15', 'tunis|bizerte|66|60|7', 'zaghouan|el-fahs|30|30|4',
    'el-fahs|sousse|120|100|13', 'nabeul|sousse|100|80|11', 'tunis|monastir|162|120|17'];
  descs text[] := array[
    'Trajet d''exemple (démo). Départ près de la station de louage.',
    'Trajet d''exemple (démo). Petits bagages uniquement, merci.',
    'Trajet d''exemple (démo). Arrêt possible en route sur demande.',
    'Trajet d''exemple (démo). Climatisation, départ ponctuel.',
    'رحلة تجريبية (مثال). الانطلاق من وسط المدينة.'];
  hours int[] := array[6,7,7,8,9,12,14,16,17,18];
  i int; j int; h int; n_trips int := 80;
  v_driver uuid; v_vehicle uuid; v_trip uuid; v_pass uuid; v_booking uuid;
  r text[]; o public.locations%rowtype; d public.locations%rowtype;
  v_dep timestamptz; v_status public.trip_status; v_seats int; v_taken int; v_bseats int; v_bstatus public.booking_status;
  v_price numeric;
begin
  -- Demo profiles (display-only, no auth account, no private data)
  for i in 1..array_length(drivers, 1) loop
    insert into public.profiles (id, full_name, bio, is_demo, pref_smoking, pref_music, pref_chatty, created_at)
    values (md5('wasalni-demo-driver-' || i)::uuid, drivers[i], 'Profil de démonstration — compte fictif.', true,
            i % 5 = 0, i % 3 <> 0, i % 2 = 0, now() - make_interval(days => 200 + i))
    on conflict (id) do nothing;
    insert into public.vehicles (id, owner_id, type, brand, model, color, year, seats, is_demo, created_at)
    values (md5('wasalni-demo-vehicle-' || i)::uuid, md5('wasalni-demo-driver-' || i)::uuid, vtypes[i], brands[i], models[i], colors[i],
            2012 + (i * 7) % 12, case when vtypes[i] = 'van' then 6 else 4 end, true, now() - make_interval(days => 200 + i))
    on conflict (id) do nothing;
  end loop;
  for i in 1..array_length(passengers, 1) loop
    insert into public.profiles (id, full_name, bio, is_demo, created_at)
    values (md5('wasalni-demo-passenger-' || i)::uuid, passengers[i], 'Profil de démonstration — compte fictif.', true, now() - make_interval(days => 190 + i))
    on conflict (id) do nothing;
  end loop;

  for i in 1..n_trips loop
    r := string_to_array(routes[1 + (i - 1) % 12], '|');
    -- alternate direction
    if ((i - 1) / 12) % 2 = 0 then
      select * into o from public.locations where slug = r[1];
      select * into d from public.locations where slug = r[2];
    else
      select * into o from public.locations where slug = r[2];
      select * into d from public.locations where slug = r[1];
    end if;
    if o.id is null or d.id is null then continue; end if;

    j := 1 + abs(hashtext('drv' || i)) % array_length(drivers, 1);
    v_driver := md5('wasalni-demo-driver-' || j)::uuid;
    v_vehicle := md5('wasalni-demo-vehicle-' || j)::uuid;
    v_trip := md5('wasalni-demo-trip-' || i)::uuid;
    h := hours[1 + abs(hashtext('h' || i)) % 10];
    -- between ~5 days and ~6 months ago, Tunis local time
    v_dep := ((date_trunc('day', now() at time zone 'Africa/Tunis') - make_interval(days => 5 + abs(hashtext('day' || i)) % 175)
              + make_interval(hours => h, mins => (abs(hashtext('m' || i)) % 4) * 15)) at time zone 'Africa/Tunis');
    v_status := case when i % 9 = 0 then 'cancelled' else 'completed' end;
    v_seats := case when (select seats from public.vehicles where id = v_vehicle) >= 6 then 5 else 3 + (i % 2) end;
    v_price := r[5]::numeric + (abs(hashtext('p' || i)) % 3) * 0.5;

    insert into public.trips (id, driver_id, vehicle_id, origin_id, destination_id, origin_address, destination_address,
      origin_lat, origin_lng, destination_lat, destination_lng, departure_at, seats_total, seats_available,
      price_per_seat, distance_km, duration_min, luggage_size, description, status, cancelled_at, cancellation_reason,
      completed_at, created_at, is_demo)
    values (v_trip, v_driver, v_vehicle, o.id, d.id, 'Centre-ville, ' || o.name_fr, 'Centre-ville, ' || d.name_fr,
      o.lat + 0.002, o.lng + 0.002, d.lat - 0.002, d.lng - 0.002, v_dep, v_seats, v_seats,
      v_price, r[3]::numeric, r[4]::int, 'medium', descs[1 + i % 5], v_status,
      case when v_status = 'cancelled' then v_dep - interval '1 day' end,
      case when v_status = 'cancelled' then 'Exemple : imprévu du conducteur' end,
      case when v_status = 'completed' then v_dep + make_interval(mins => r[4]::int) end,
      v_dep - make_interval(days => 2 + i % 6), true)
    on conflict (id) do nothing;
    if not found then continue; end if; -- already seeded

    v_taken := 0;
    for j in 1..(1 + abs(hashtext('nb' || i)) % 4) loop
      v_pass := md5('wasalni-demo-passenger-' || (1 + abs(hashtext('ps' || i || '-' || j)) % array_length(passengers, 1)))::uuid;
      v_booking := md5('wasalni-demo-booking-' || i || '-' || j)::uuid;
      v_bseats := case when abs(hashtext('bs' || i || j)) % 5 = 0 then 2 else 1 end;
      if v_status = 'cancelled' then v_bstatus := 'cancelled';
      elsif abs(hashtext('st' || i || j)) % 8 = 0 then v_bstatus := 'rejected';
      elsif abs(hashtext('st' || i || j)) % 8 = 1 then v_bstatus := 'cancelled';
      elsif v_taken + v_bseats <= v_seats then v_bstatus := 'completed';
      else v_bstatus := 'rejected';
      end if;
      -- one booking per passenger per trip
      if exists (select 1 from public.bookings where trip_id = v_trip and passenger_id = v_pass) then continue; end if;
      insert into public.bookings (id, trip_id, passenger_id, seats, price_per_seat, status, message, responded_at,
        cancelled_by, cancelled_at, cancellation_reason, completed_at, created_at, is_demo)
      values (v_booking, v_trip, v_pass, v_bseats, v_price, v_bstatus,
        case when j = 1 then 'Bonjour, une place svp (exemple).' end,
        v_dep - interval '1 day',
        case when v_bstatus = 'cancelled' then (case when v_status = 'cancelled' then v_driver else v_pass end) end,
        case when v_bstatus = 'cancelled' then v_dep - interval '20 hours' end,
        case when v_bstatus = 'cancelled' and v_status <> 'cancelled' then 'Exemple : changement de programme' end,
        case when v_bstatus = 'completed' then v_dep + make_interval(mins => r[4]::int) end,
        v_dep - make_interval(days => 1 + j), true)
      on conflict (id) do nothing;
      if v_bstatus = 'completed' then
        v_taken := v_taken + v_bseats;
        -- passenger → driver review (most trips)
        if abs(hashtext('rv' || i || j)) % 10 < 7 then
          insert into public.reviews (id, trip_id, reviewer_id, reviewee_id, reviewee_role, rating, comment, created_at, is_demo)
          values (md5('wasalni-demo-review-d-' || i || '-' || j)::uuid, v_trip, v_pass, v_driver, 'driver',
            case when abs(hashtext('rt' || i || j)) % 10 < 7 then 5 when abs(hashtext('rt' || i || j)) % 10 < 9 then 4 else 3 end,
            (array['Conducteur ponctuel et prudent (avis d''exemple).','Trajet agréable, je recommande (exemple).','Voiture propre, bonne ambiance (exemple).','RAS, merci ! (exemple)','سائق محترم ورحلة مريحة (مثال).'])[1 + abs(hashtext('c' || i || j)) % 5],
            v_dep + interval '1 day', true)
          on conflict do nothing;
        end if;
        -- driver → passenger review (some trips)
        if abs(hashtext('rp' || i || j)) % 10 < 4 then
          insert into public.reviews (id, trip_id, reviewer_id, reviewee_id, reviewee_role, rating, comment, created_at, is_demo)
          values (md5('wasalni-demo-review-p-' || i || '-' || j)::uuid, v_trip, v_driver, v_pass, 'passenger',
            4 + abs(hashtext('rq' || i || j)) % 2, 'Passager ponctuel (avis d''exemple).', v_dep + interval '1 day', true)
          on conflict do nothing;
        end if;
      end if;
    end loop;
    update public.trips set seats_available = case when v_status = 'cancelled' then seats_total else seats_total - least(v_taken, seats_total) end
    where id = v_trip;
  end loop;

  -- Counters for demo profiles
  update public.profiles p set
    trips_driven = (select count(*) from public.trips t where t.driver_id = p.id and t.status = 'completed'),
    trips_taken = (select count(*) from public.bookings b where b.passenger_id = p.id and b.status = 'completed')
  where p.is_demo;
end;
$$;
