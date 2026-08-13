/**
 * Sansabet Browser Outcomes Analyzer
 * 
 * Opens any match in browser and extracts ALL available outcomes
 * by intercepting the API responses.
 * 
 * Usage:
 *   node browser_outcomes_analyzer.js <match_code> [options]
 * 
 * Examples:
 *   node browser_outcomes_analyzer.js 4271 --live
 *   node browser_outcomes_analyzer.js 4271 --headless=false
 *   node browser_outcomes_analyzer.js 4271 --output=results.json
 * 
 * The script will:
 *   1. Navigate to the live page
 *   2. Click on the match to trigger API call
 *   3. Capture GetByParIDs API response with all markets
 *   4. Parse and display all outcomes with tip IDs
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Tip ID to market name mapping (based on Sansabet API)
const TIP_NAMES = {
    1: '1 (Home Win)',
    2: '2 (Away Win)',
    10: 'X (Draw)',
    72: '1X',
    83: 'X2',
    84: '12',
    85: 'DNB 1',
    90: 'DNB 2',
    103: 'Total Over',
    105: 'Total Under',
    106: 'BTTS Yes',
    107: 'BTTS No',
    112: 'Odd',
    113: 'Even',
    114: 'HTS Yes',
    115: 'HTS No',
    116: 'ATS Yes',
    118: 'ATS No',
    131: '1 (1st Half)',
    132: 'X (1st Half)',
    133: '2 (1st Half)',
    157: '1X (1st Half)',
    158: 'X2 (1st Half)',
    159: '12 (1st Half)',
    168: 'IT1 Over',
    169: 'IT1 Under',
    170: 'IT2 Over',
    171: 'IT2 Under',
    178: 'BTTS 1st Half Yes',
    179: 'BTTS 1st Half No',
    193: '1 (2nd Half)',
    194: 'X (2nd Half)',
    195: '2 (2nd Half)',
    198: 'HT/FT',
    201: 'Correct Score',
    319: 'Handicap H1',
    320: 'Handicap H2',
    324: 'Asian Handicap',
    688: '1 (Next Goal)',
    689: 'X (Next Goal)',
    690: '2 (Next Goal)',
};

class SansabetOutcomesAnalyzer {
    constructor(options = {}) {
        this.headless = options.headless !== false;
        this.outputFile = options.output || null;
        this.screenshotDir = options.screenshotDir || '/tmp/sansabet_analyzer';
        this.browser = null;
        this.page = null;
        this.context = null;
        this.capturedData = null;
        
        this.results = {
            matchCode: null,
            matchInfo: {},
            markets: [],
            allOutcomes: [],
            timestamp: new Date().toISOString(),
            errors: []
        };
    }

    async launch() {
        console.log('🚀 Launching browser...');
        
        this.browser = await chromium.launch({
            headless: this.headless,
            slowMo: this.headless ? 0 : 50,
            args: [
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage'
            ]
        });

        this.context = await this.browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            locale: 'en-US'
        });

        // Remove webdriver flag
        await this.context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        this.page = await this.context.newPage();
        this.page.setDefaultTimeout(30000);
        
        // Intercept API responses
        this.page.on('response', async response => {
            const url = response.url();
            if (url.includes('GetByParIDs')) {
                try {
                    const data = await response.json();
                    if (data && data.length > 0) {
                        this.capturedData = data[0];
                        console.log('   📡 Captured API response for match');
                    }
                } catch (e) {}
            }
        });
        
        // Create screenshot directory
        if (!fs.existsSync(this.screenshotDir)) {
            fs.mkdirSync(this.screenshotDir, { recursive: true });
        }
        
        console.log('✅ Browser launched');
    }

    async navigateAndCapture(matchCode) {
        this.results.matchCode = matchCode;
        
        console.log(`🌐 Loading Sansabet live page...`);
        await this.page.goto('https://sansabet.com/live', { waitUntil: 'networkidle', timeout: 30000 });
        await this.page.waitForTimeout(4000);
        
        // Find match info and ParID from page
        console.log(`🔍 Looking for match with code: ${matchCode}`);
        
        const matchInfo = await this.page.evaluate((code) => {
            const rows = document.querySelectorAll('tr.result-row');
            for (const row of rows) {
                const codeCell = row.querySelector('td:nth-child(3)');
                if (codeCell && codeCell.textContent?.trim() === code) {
                    // Extract ParID from row class (lbag_XXXXX)
                    const parIdMatch = row.className.match(/lbag_(\d+)/);
                    const cells = row.querySelectorAll('td');
                    return {
                        found: true,
                        parId: parIdMatch ? parIdMatch[1] : null,
                        league: cells[0]?.textContent?.trim(),
                        time: cells[1]?.textContent?.trim(),
                        code: cells[2]?.textContent?.trim(),
                        teams: cells[3]?.innerText?.split('\n')[0]?.trim()
                    };
                }
            }
            // If not found, get first match
            if (rows.length > 0) {
                const row = rows[0];
                const parIdMatch = row.className.match(/lbag_(\d+)/);
                const cells = row.querySelectorAll('td');
                return {
                    found: false,
                    parId: parIdMatch ? parIdMatch[1] : null,
                    league: cells[0]?.textContent?.trim(),
                    time: cells[1]?.textContent?.trim(),
                    code: cells[2]?.textContent?.trim(),
                    teams: cells[3]?.innerText?.split('\n')[0]?.trim()
                };
            }
            return { found: false };
        }, matchCode);
        
        if (!matchInfo.parId) {
            console.log(`   ❌ Could not find ParID for match`);
            return false;
        }
        
        if (matchInfo.found) {
            console.log(`   ✅ Found match ${matchCode}, ParID: ${matchInfo.parId}`);
        } else {
            console.log(`   ⚠️ Match ${matchCode} not found, using first: ${matchInfo.code}, ParID: ${matchInfo.parId}`);
            this.results.matchCode = matchInfo.code;
        }
        
        this.results.matchInfo = {
            teams: matchInfo.teams,
            league: matchInfo.league,
            time: matchInfo.time,
            code: matchInfo.code,
            parId: matchInfo.parId
        };
        
        // Click on match to open detail view (shows ALL markets)
        console.log(`   🖱️ Opening detail view...`);
        await this.page.click('tr.result-row td:nth-child(4)');
        await this.page.waitForTimeout(3000);
        
        // Extract outcomes from DOM (what user actually sees in detail view)
        console.log(`   🔍 Extracting outcomes from browser DOM...`);
        await this.extractFromPage();
        
        // Also fetch API for comparison
        console.log(`   📡 Fetching API data for comparison...`);
        const apiData = await this.page.evaluate(async (parId) => {
            try {
                const response = await fetch(`https://apilive.sansabet.com/api/LiveOdds/GetByParIDs?SLID=0&ParIDs=${parId}`);
                const data = await response.json();
                return data;
            } catch (e) {
                return { error: e.message };
            }
        }, matchInfo.parId);
        
        if (apiData && apiData.length > 0 && !apiData.error) {
            this.capturedData = apiData[0];
            this.parseApiData();
            
            // Compare DOM vs API
            const domTipIds = new Set(this.results.allOutcomes.map(o => o.tipId));
            const apiTipIds = new Set();
            if (this.capturedData.M) {
                for (const m of this.capturedData.M) {
                    for (const s of (m.S || [])) {
                        apiTipIds.add(s.N);
                    }
                }
            }
            
            const hiddenTips = [...apiTipIds].filter(t => !domTipIds.has(t));
            this.results.comparison = {
                domOutcomes: this.results.allOutcomes.length,
                apiOutcomes: apiTipIds.size,
                hiddenTipIds: hiddenTips,
                hiddenCount: hiddenTips.length
            };
            
            console.log(`   ✅ DOM: ${domTipIds.size} tip IDs, API: ${apiTipIds.size} tip IDs`);
            console.log(`   ⚠️  Hidden from browser: ${hiddenTips.length} tip IDs`);
        }
        
        return true;
    }

    async extractFromPage() {
        const pageData = await this.page.evaluate(() => {
            const result = {
                matchInfo: {},
                odds: []
            };
            
            // Get match info from the clicked row
            const activeRow = document.querySelector('tr.result-row');
            if (activeRow) {
                const cells = activeRow.querySelectorAll('td');
                result.matchInfo.league = cells[0]?.textContent?.trim();
                result.matchInfo.time = cells[1]?.textContent?.trim();
                result.matchInfo.code = cells[2]?.textContent?.trim();
                result.matchInfo.teams = cells[3]?.textContent?.trim();
            }
            
            // Get all odds from page
            document.querySelectorAll('td[class*="tip_"]').forEach(td => {
                const text = td.textContent?.trim();
                const tidMatch = td.className.match(/TID(\d+)-(\d+)-([\d_]+)/);
                if (text && /^[\d.,]+$/.test(text) && tidMatch) {
                    result.odds.push({
                        matchCode: tidMatch[1],
                        tipId: parseInt(tidMatch[2]),
                        line: tidMatch[3]?.replace('_', '.'),
                        odds: parseFloat(text.replace(',', '.'))
                    });
                }
            });
            
            return result;
        });
        
        // Set match info
        if (pageData.matchInfo.teams) {
            this.results.matchInfo = pageData.matchInfo;
        }
        
        // Group outcomes by market
        const marketGroups = {};
        const allOutcomes = [];
        
        for (const o of pageData.odds) {
            // Filter to only the requested match
            if (o.matchCode !== this.results.matchCode) continue;
            
            const tipName = TIP_NAMES[o.tipId] || `Tip ${o.tipId}`;
            const marketGroup = this.getMarketGroup(o.tipId);
            
            const outcome = {
                tipId: o.tipId,
                tipName,
                odds: o.odds,
                line: o.line !== '0.00' ? o.line : null,
                marketGroup
            };
            
            allOutcomes.push(outcome);
            
            if (!marketGroups[marketGroup]) {
                marketGroups[marketGroup] = [];
            }
            marketGroups[marketGroup].push(outcome);
        }
        
        this.results.allOutcomes = allOutcomes;
        this.results.markets = Object.entries(marketGroups).map(([name, outcomes]) => ({
            name,
            outcomesCount: outcomes.length,
            outcomes
        }));
    }

    parseApiData() {
        if (!this.capturedData) return;
        
        const match = this.capturedData;
        
        // Extract match info
        this.results.matchInfo = {
            teams: match.H?.ParNaziv,
            league: match.H?.LigaNaziv,
            code: match.H?.Sifra,
            country: match.H?.NG,
            sport: match.H?.S,
            status: match.P?.N,
            score: match.R?.G || match.R?.S || match.R?.P,
            time: match.P?.T ? `${match.P.T.M}:${match.P.T.S}` : null
        };
        
        console.log(`\n📋 Match: ${this.results.matchInfo.teams}`);
        console.log(`   League: ${this.results.matchInfo.league}`);
        console.log(`   Score: ${this.results.matchInfo.score || 'N/A'}`);
        
        // Parse markets
        const allOutcomes = [];
        const marketGroups = {};
        
        if (match.M && match.M.length > 0) {
            match.M.forEach(market => {
                const baseline = market.B || null;
                const marketStatus = market.MS;
                
                if (market.S && market.S.length > 0) {
                    market.S.forEach(selection => {
                        const tipId = selection.N;
                        const odds = selection.O;
                        const tipName = TIP_NAMES[tipId] || `Tip ${tipId}`;
                        
                        // Determine market group
                        let marketGroup = this.getMarketGroup(tipId);
                        
                        const outcome = {
                            tipId,
                            tipName,
                            odds,
                            line: baseline,
                            marketGroup,
                            status: marketStatus
                        };
                        
                        allOutcomes.push(outcome);
                        
                        if (!marketGroups[marketGroup]) {
                            marketGroups[marketGroup] = [];
                        }
                        marketGroups[marketGroup].push(outcome);
                    });
                }
            });
        }
        
        this.results.allOutcomes = allOutcomes;
        this.results.markets = Object.entries(marketGroups).map(([name, outcomes]) => ({
            name,
            outcomesCount: outcomes.length,
            outcomes
        }));
    }

    getMarketGroup(tipId) {
        // Group tip IDs by market type
        if ([1, 2, 10].includes(tipId)) return '1X2';
        if ([72, 83, 84].includes(tipId)) return 'Double Chance';
        if ([85, 90].includes(tipId)) return 'Draw No Bet';
        if ([103, 105].includes(tipId)) return 'Total Goals';
        if ([106, 107].includes(tipId)) return 'Both Teams To Score';
        if ([112, 113].includes(tipId)) return 'Odd/Even';
        if ([114, 115, 116, 118].includes(tipId)) return 'Team To Score';
        if ([131, 132, 133, 157, 158, 159].includes(tipId)) return '1st Half';
        if ([168, 169].includes(tipId)) return 'Team 1 Total';
        if ([170, 171].includes(tipId)) return 'Team 2 Total';
        if ([178, 179].includes(tipId)) return '1st Half BTTS';
        if ([193, 194, 195].includes(tipId)) return '2nd Half';
        if ([198].includes(tipId)) return 'HT/FT';
        if ([201].includes(tipId)) return 'Correct Score';
        if ([319, 320, 324].includes(tipId)) return 'Handicap';
        if ([688, 689, 690].includes(tipId)) return 'Next Goal';
        return 'Other';
    }

    async analyze(matchCode) {
        try {
            await this.launch();
            
            const success = await this.navigateAndCapture(matchCode);
            if (!success) {
                throw new Error('Failed to find match');
            }
            
            // Parse captured API data
            this.parseApiData();
            
            // Take screenshot
            await this.page.screenshot({ 
                path: path.join(this.screenshotDir, 'match_view.png'),
                fullPage: true 
            });
            
            // Save results
            if (this.outputFile) {
                fs.writeFileSync(this.outputFile, JSON.stringify(this.results, null, 2));
                console.log(`\n💾 Results saved to: ${this.outputFile}`);
            }
            
            console.log(`\n📸 Screenshots saved to: ${this.screenshotDir}`);
            
            return this.results;
            
        } catch (e) {
            console.error(`\n❌ Analysis failed: ${e.message}`);
            this.results.errors.push({ fatal: e.message, stack: e.stack });
            throw e;
        } finally {
            if (!this.headless) {
                console.log('\n⏸️  Browser left open for inspection. Press Ctrl+C to close.');
                await new Promise(() => {});
            } else {
                await this.close();
            }
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 Browser closed');
        }
    }

    printSummary() {
        console.log('\n' + '='.repeat(70));
        console.log('📊 ANALYSIS SUMMARY');
        console.log('='.repeat(70));
        
        console.log(`\nMatch: ${this.results.matchInfo.teams || '?'}`);
        console.log(`League: ${this.results.matchInfo.league || '?'}`);
        console.log(`Code: ${this.results.matchCode}`);
        console.log(`Score: ${this.results.matchInfo.score || 'N/A'}`);
        
        console.log(`\nMarkets found: ${this.results.markets.length}`);
        console.log(`Total unique outcomes: ${this.results.allOutcomes.length}`);
        
        console.log('\nMarkets breakdown:');
        for (const market of this.results.markets) {
            console.log(`\n  [${market.name}] (${market.outcomesCount} outcomes)`);
            market.outcomes.slice(0, 6).forEach(o => {
                const line = o.line ? ` [${o.line}]` : '';
                console.log(`    tip_${o.tipId} ${o.tipName} @ ${o.odds}${line}`);
            });
            if (market.outcomesCount > 6) {
                console.log(`    ... +${market.outcomesCount - 6} more`);
            }
        }
        
        if (this.results.errors.length > 0) {
            console.log(`\n⚠️ Errors: ${this.results.errors.length}`);
        }
        
        console.log('\n' + '='.repeat(70));
    }
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
Sansabet Browser Outcomes Analyzer
==================================

Opens a match in browser and extracts ALL available outcomes by intercepting API.

Usage:
  node browser_outcomes_analyzer.js <match_code> [options]

Examples:
  node browser_outcomes_analyzer.js 4271
  node browser_outcomes_analyzer.js 4271 --headless=false
  node browser_outcomes_analyzer.js 4271 --output=results.json

Options:
  --headless=false    Show browser window (default: true/headless)
  --output=<file>     Save results to JSON file
  --screenshot-dir=<dir>  Screenshot directory (default: /tmp/sansabet_analyzer)

Note: Match code is the 4-digit number shown in the match list (e.g., 4271)
`);
        process.exit(1);
    }
    
    const matchCode = args[0];
    const options = {
        headless: !args.includes('--headless=false'),
        output: args.find(a => a.startsWith('--output='))?.split('=')[1],
        screenshotDir: args.find(a => a.startsWith('--screenshot-dir='))?.split('=')[1]
    };
    
    (async () => {
        const analyzer = new SansabetOutcomesAnalyzer(options);
        
        try {
            await analyzer.analyze(matchCode);
            analyzer.printSummary();
            
            // Print JSON results
            console.log('\n📄 JSON Results:');
            console.log(JSON.stringify(analyzer.results, null, 2));
            
        } catch (e) {
            console.error('Fatal error:', e.message);
            process.exit(1);
        }
    })();
}

module.exports = { SansabetOutcomesAnalyzer };
