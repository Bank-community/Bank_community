const fs = require('fs'); 
const html = fs.readFileSync('index.html', 'utf8'); 
let depth = 0; 
const lines = html.split('\n'); 
for(let i=0; i<lines.length; i++) { 
    const line = lines[i]; 
    const opens = (line.match(/<div/gi) || []).length; 
    const closes = (line.match(/<\/div>/gi) || []).length; 
    depth += (opens - closes); 
    if (line.includes('id="tab-home"') || line.includes('class="top-rankers-section') || line.includes('tab-loan') || line.includes('tab-profile') || line.includes('</main>') || line.includes('</footer>')) 
        console.log((i+1) + ': ' + line.trim() + ' | Depth: ' + depth); 
}
