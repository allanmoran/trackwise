#!/usr/bin/env node
/**
 * Build comprehensive track ID → name mapping
 * Combines data from extract-daily-races.ts and current Sportsbet races
 */

// Start with known mappings from extract-daily-races
const KNOWN_MAPPINGS: Record<string, string> = {
  // From extract-daily-races.ts
  '435951': 'Alice Springs',
  '435956': 'Doomben',
  '435963': 'Benalla',
  '435964': 'Ballina',
  '435965': 'Warrnambool',
  '435966': 'Rockhampton',
  '435967': 'Toowoomba',
  '435975': 'Werribee',
  '435979': 'Morphettville',
  '435955': 'Goulburn',
  '435974': 'Caulfield',
  '436054': 'Bowen',
  '436088': 'Ascot',
  '436089': 'Narrogin',
  '436344': 'Newcastle',

  // From scrape-today-results.ts trackMap
  '435971': 'Cranbourne',
  '435950': 'Darwin',
  '435960': 'Gatton',
  '435967': 'Geelong',
  '435954': 'Gold Coast',
  '435951': 'Launceston',
  '435955': 'Murray Bridge',
  '435956': 'Tamworth',
  '435957': 'Wellington',
  '435973': 'Sandown',
  '435968': 'Moonee Valley',
  '435969': 'Caulfield',
  '435970': 'Flemington',
  '435974': 'Bendigo',
};

// Track IDs found in today's races but NOT in KNOWN_MAPPINGS
const MISSING_IDS = [
  '436045', '436046', '436050', '436170', '436171', '436172',
  '436182', '436183', '436300', '436430', '436440', '436441',
  '436443', '436445', '436446', '436543', '436544', '436545',
  '436546', '436612',
  // Plus others from SPORTSBET_ALL_TRACK_IDS
  '436048', '436055', '436059', '436060', '436061', '436066',
  '436223', '436225', '436227', '436229', '436334', '436338',
  '436343', '436345', '436346'
];

console.log('📊 Track Mapping Status\n');
console.log('✅ KNOWN MAPPINGS: ' + Object.keys(KNOWN_MAPPINGS).length);
Object.entries(KNOWN_MAPPINGS).forEach(([id, name]) => {
  console.log(`   ${id}: ${name}`);
});

console.log('\n❌ MISSING MAPPINGS: ' + MISSING_IDS.length);
console.log('   ' + MISSING_IDS.join(', '));

console.log(`\n📋 Summary:
- Total track IDs in SPORTSBET_ALL_TRACK_IDS: ${Object.keys(KNOWN_MAPPINGS).length + MISSING_IDS.length}
- Mapped: ${Object.keys(KNOWN_MAPPINGS).length}
- Unmapped: ${MISSING_IDS.length}
- Coverage: ${(Object.keys(KNOWN_MAPPINGS).length / (Object.keys(KNOWN_MAPPINGS).length + MISSING_IDS.length) * 100).toFixed(1)}%

🔴 BLOCKER: Cannot map ${MISSING_IDS.length} track IDs without:
1. Scraping sportsbetform.com.au pages for each track
2. Querying Sportsbet API directly
3. Or finding another data source with the track name↔ID mapping

DATABASE IMPACT:
- Pending bets reference: Ascot, Ballina, Bowen, Alice Springs, Caulfield, Geraldton
- From KNOWN_MAPPINGS, we have:
  - Ascot: 436088 ✓
  - Ballina: 435964 (old ID) or unknown 436xxx ID
  - Bowen: 436054 ✓
  - Alice Springs: 435951 ✓
  - Caulfield: 435974 or 435969 (multiple mappings!)
  - Geraldton: ❌ NOT IN ANY MAPPING

NEXT STEPS:
1. Check if database uses old IDs (435xxx) or new IDs (436xxx)
2. Scrape sportsbetform to extract track names for missing IDs
3. Or query actual Sportsbet website for race details
`);
