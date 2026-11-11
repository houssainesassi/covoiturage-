# Legal review: Waselni Fahs services (Tunisia)

**Status: this is not a legal opinion.** It is a summary of public press sources, written on 2026-11-11 to decide what should stay off. Nothing here confirms that the app complies with the law. A Tunisian lawyer, or the Ministry of Transport, must confirm before launch.

## 1. Carpooling (the current service)

What the sources say:
- Law n°2004-33 of 19 April 2004 (organisation of land transport): **paid** carpooling is treated as "transport clandestin". Free carpooling between individuals is not expressly prohibited ([Business News, 2025](https://businessnews.com.tn/2025/01/10/700-dinars-damende-pour-covoiturage-que-dit-la-loi-tunisienne/1351609/)).
- April 2019: the director general of land transport announced a fine of 700 dinars. The minister then said carpooling "is not prohibited" and that the problem is unauthorised transport, especially when it is paid ([Webdo, 2019](https://www.webdo.tn/fr/actualite/national/min-du-transport-le-covoiturage-nest-pas-interdit-mais/150534/)).
- A revision of Law 33 has been under way since 2025, but no dedicated carpooling framework was found.

**Risk:** the app currently shows a "price per seat", paid in cash to the driver. Even presented as a contribution to costs, this point is **legally uncertain**.

What the code already does: Wasalni says it is a platform that connects people and transports no one, and has no online payment. The new destination pages say "the price is a contribution to the trip's costs". This is a description, not a guarantee.

Decisions that are yours (none has been applied):
1. Cap the price at a cost-sharing level (for example fuel per km ÷ seats), so that drivers cannot make a profit.
2. Or a free-only mode (no price) until there is a lawyer's opinion.
3. Or keep it as it is, at your own risk.

## 2. Car rental (new section, **disabled**)

What the sources say:
- Individuals who rent out cars without a Ministry of Transport licence and without proper insurance are described as the "parallel market" ("black plates") that sits outside the legal framework. Licensed agencies need a minimum fleet and capital ([Business News, 2025](https://businessnews.com.tn/2025/10/28/zakaria-naat-appelle-le-ministere-du-transport-a-classer-le-secteur-de-la-location-de-voitures/1370037/), [La Presse](https://www.lapresse.tn/?p=4330788)).
- Since 2026-01-01, a withholding of 2 dinars per rental day has applied (DGELF note n°7/2026) ([Webdo](https://www.webdo.tn/fr/actualite/national/location-de-voitures-la-taxe-de-deux-dinars-par-jour-expliquee/394824/)).

What the code does:
- `RENTALS_ENABLED=false` by default: the pages return 404 and every link is hidden.
- Migration `20261111000016_car_rentals.sql` is **not applied** to production.
- When it is turned on: **licensed agencies only** (agency name and licence number are required). Every listing starts as `pending` and becomes public only after an admin checks the licence (`/admin/rentals`).
- Price: agreed between the agency and the customer. No price is stored and there is no payment.
- A future symbolic fee: the columns `fee_amount_millimes` and `fee_status` exist, but nothing collects them and no payment provider is connected.

Before turning it on: a lawyer's opinion on (a) a platform publishing agency listings, (b) the advertising rules, (c) the 2-dinar withholding (who declares it).

## 3. Separating the services

| Service | Status in the code | Legally |
| --- | --- | --- |
| Free carpooling between individuals | live | not expressly prohibited (per the press) |
| Carpooling with a price per seat | live (existing) | **uncertain**, risk of "transport clandestin" |
| Car rental, licensed agencies | built, **off** | needs a legal review before switching on |
| Car rental, individuals | **not built** | outside the legal framework (per the press) |
| Online payment or fees | **not built** | not before the legal and commercial terms are set |
