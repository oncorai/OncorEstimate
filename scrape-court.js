const https = require('https');

const cases = [
  {case: 'CV2024-009193', recording: '20260019343'},
  {case: 'CV2024-015106', recording: '20260028137'},
  {case: 'CV2024-015222', recording: '20260042884'},
  {case: 'CV2024-021097', recording: '20260056871'},
  {case: 'CV2024-015300', recording: '20260056872'},
  {case: 'CV2024-021097', recording: '20260071439'},
  {case: 'CV2022-093703', recording: '20260072486'},
  {case: 'CV2023-052201', recording: '20260093355'},
  {case: 'CV2024-024202', recording: '20260104580'},
  {case: 'CV2024-020429', recording: '20260129147'}
];

function fetchCase(caseNum) {
  return new Promise((resolve) => {
    const url = `https://www.superiorcourt.maricopa.gov/docket/CivilCourtCases/caseInfo.asp?caseNumber=${caseNum}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

(async () => {
  console.log('Recording,Case Number,Defendant,Sheriff Sale Amount');
  
  for (const c of cases) {
    const html = await fetchCase(c.case);
    
    // Normalize whitespace
    const normalized = html.replace(/\s+/g, ' ');
    
    // Find all defendants
    let defendant = '';
    const defMatches = normalized.match(/col-lg-4"> ([^<]+) <\/div> <div[^>]*>Relationship<\/div> <div[^>]*> Defendant/gi);
    if (defMatches && defMatches[0]) {
      const nameMatch = defMatches[0].match(/col-lg-4"> ([^<]+) </i);
      if (nameMatch) defendant = nameMatch[1].trim();
    }
    
    // Extract sheriff sale amount  
    let saleAmount = '';
    const saleMatch = normalized.match(/SHERIFFS? SALE \/ \$([\d,\.]+)/i);
    if (saleMatch) {
      saleAmount = '$' + saleMatch[1];
    }
    
    console.log(`${c.recording},${c.case},"${defendant}",${saleAmount}`);
  }
})();
