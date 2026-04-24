import SportsbetFormScraper from './backend/src/scrapers/sportsbet-form-scraper.js';

console.log('🧪 Testing Sportsbet Form Scraper\n');

const testUrl = 'https://www.sportsbetform.com.au/436044/3308955/';

(async () => {
  try {
    console.log(`Testing URL: ${testUrl}\n`);
    
    const result = await SportsbetFormScraper.scrapeAndLoad(testUrl);
    
    console.log('\n📊 Results:');
    console.log(`   Race ID: ${result.raceId}`);
    console.log(`   Runners loaded: ${result.runnersLoaded}`);
    console.log(`   Runner IDs: ${result.runnerIds.join(', ')}`);
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  process.exit(0);
})();
