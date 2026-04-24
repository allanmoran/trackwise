# KB Enrichment with Jockey & Trainer Data

## Problem
The Betfair CSV import provides horse names, odds, and race results, but **lacks jockey and trainer information**. The KB needs this data to build performance models by jockey/trainer.

## Solution
A two-step enrichment process:

### Step 1: Import Betfair Historical Data
```bash
npm run import-betfair
# or: npx tsx scripts/import-betfair-csv.ts [optional-csv-url]
```

This populates the KB with:
- ✓ Horse names
- ✓ Race dates, tracks, race numbers
- ✓ Win/Loss/Place results
- ✓ Betfair Starting Prices (BSP)
- ✗ Jockey/trainer info (logged as "Unknown")

### Step 2: Enrich with Jockey & Trainer Data

#### 2a. Gather Jockey/Trainer Data

Find racing form guides from these sources:

**Option A: RaceNet Australia**
- Go to https://www.racenet.com.au/form-guide/horse-racing
- Search for your track and race
- Note down jockey and trainer for each horse

**Option B: Sportsbet Form Guide**
- Visit https://www.sportsbetform.com.au/
- Look up form guides by date and track
- Extract jockey/trainer info

**Option C: Racing.com**
- Go to https://www.racing.com/
- Search race meetings
- Extract runner details (may require manual entry)

#### 2b. Create CSV File

Create a CSV file with the following format:

```csv
date,track,race_num,horse_name,jockey,trainer
2026-04-07,Sale,1,LAUBERHORN,Beau Mertens,Mick Price & Michael Kent Jnr
2026-04-07,Sale,1,INTERROGATE,Daniel Stackhouse,Anthony & Sam Freedman
2026-04-07,Sale,2,GALACTIC FORCE,Luke Nolen,Peter Moody & Katherine Coleman
2026-04-07,Ascot,1,Desert Dancing,Jamie Kbler,Sean & Brodie Barrass
```

**Rules:**
- Headers: `date,track,race_num,horse_name,jockey,trainer`
- Date format: `YYYY-MM-DD`
- Horse name must match Betfair import exactly (case-insensitive matching)
- Jockey/trainer: Use full names as they appear in form guides
- One row per runner with jockey/trainer info

**Template:** Use `jockey-trainer-template.csv` as a starting point.

#### 2c. Run Enrichment

```bash
npm run enrich-kb jockey-trainer-data.csv
# or: npx tsx scripts/enrich-betfair-with-jockey-trainer.ts jockey-trainer-data.csv
```

This will:
1. Read your jockey/trainer CSV
2. Find matching runners in the KB
3. Update their jockey/trainer fields
4. Re-log enriched records to the knowledge base

**Example output:**
```
[Betfair KB Enrichment]
📥 Reading jockey/trainer CSV: jockey-trainer-data.csv
✓ Loaded 127 jockey/trainer records

📊 Reading Betfair-imported races from KB...
✓ Found 58 races to enrich

🔄 Enriching with jockey/trainer data...
✓ Enriched 127 runners with jockey/trainer data

💾 Re-logging enriched races to KB...
✓ Re-logged 58 enriched races (400+ runners) to KB

✅ KB enrichment complete!
   Jockeys and trainers now properly tracked in knowledge base
```

## Workflow Summary

```
Betfair CSV → Import Script → KB (with "Unknown" jockey/trainer)
                                  ↓
                    Jockey/Trainer CSV (manual entry)
                                  ↓
                    Enrichment Script
                                  ↓
                    KB (complete with jockey/trainer)
                                  ↓
                    KB Stats now track by:
                    - Horse performance
                    - Jockey win rates
                    - Trainer win rates
```

## New: Punters.com.au Data Source (April 2026)

Punters.com.au form guide now provides a rich source of jockey/trainer data:

**Direct Enrichment from Punters:**
1. Go to https://www.punters.com.au/form-guide/
2. Find track/race
3. Extract jockey/trainer names from form cards
4. Enter into jockey-trainer-data.csv
5. Run enrichment script

**Alternative: Bulk Extraction**
- Punters form guide page contains all metadata for a day's races
- Planned: Puppeteer script to auto-extract jockey/trainer CSV
- Status: Under development (Phase 2 of TrackWise)

See [KB-DATA-SOURCES.md](KB-DATA-SOURCES.md) for complete integration guide.

---

## Best Practices

1. **Build the CSV incrementally**: You don't need to enrich all races at once. Start with recent races where data is readily available.

2. **Verify matches**: The enrichment script will only update runners that match both the horse name and the date/track/race_num.

3. **Multiple enrichments**: You can run the enrichment script multiple times with different CSV files. It updates the KB without duplicating records.

4. **Quality matters**: Jockey/trainer names must match racing databases for system to track their performance accurately.

5. **Use Punters as source**: Punters.com.au form guide is reliable for Australian racing jockey/trainer data. Manual extraction is fastest for recent races.

## Data Quality Example

### Good:
- Horse: `LAUBERHORN` → Jockey: `Beau Mertens` → Trainer: `Mick Price & Michael Kent Jnr`
- Consistent trainer naming across multiple races

### Avoid:
- Different trainer names for same person: `M. Price` vs `Michael Price` vs `Mick Price`
- Abbreviations: Use full names for consistency

## Next Steps

Once KB is enriched with jockey/trainer data:

1. **FormHub** will show top jockeys and trainers by win rate
2. **Daily Picks** can suggest horses based on jockey/trainer form
3. **Analysis** can model performance by trainer/jockey separately
4. **Expected Value** calculations improve with larger sample sizes

## Troubleshooting

**Q: Script says "enriched 0 runners"**
- Check horse names match exactly between CSV and Betfair import
- Verify date format is YYYY-MM-DD
- Ensure track name matches (case-sensitive: "Sale" not "sale")

**Q: How do I find jockey/trainer data?**
- RaceNet form guides are most reliable for Australian racing
- Manual entry from Racing.com/Sportsbet is time-consuming but accurate
- Some data may be unavailable for older races

**Q: Can I update jockey/trainer after KB is built?**
- Yes, just create a new CSV with corrections and run enrich-kb again
- It will update matching records without creating duplicates

---

**Status:** 89 races, 418 horses, ready for enrichment with jockey/trainer data.
