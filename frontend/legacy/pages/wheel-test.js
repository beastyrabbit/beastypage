// Wheel Test Page JavaScript

// Rarity configurations for each wheel - reordered to match new layout
const wheelConfigs = {
    1: { // Original (Very Hard) - now first
        name: 'Original',
        rarities: [
            { name: 'Moondust', weight: 79.999, color: '#808080' },
            { name: 'Starborn', weight: 12, color: '#22c55e' },
            { name: 'Lunara', weight: 5, color: '#a855f7' },
            { name: 'Celestara', weight: 2, color: '#3b82f6' },
            { name: 'Divinara', weight: 0.999, color: '#f97316' },
            { name: 'Holo Nova', weight: 0.001, color: '#e0e7ff' },
            { name: 'Singularity', weight: 0.00001, color: '#fbbf24' }
        ]
    },
    2: { // Exponential Drop - now second
        name: 'Exponential Drop',
        rarities: [
            { name: 'Moondust', weight: 65, color: '#808080' },
            { name: 'Starborn', weight: 20, color: '#22c55e' },
            { name: 'Lunara', weight: 9, color: '#a855f7' },
            { name: 'Celestara', weight: 4, color: '#3b82f6' },
            { name: 'Divinara', weight: 1.5, color: '#f97316' },
            { name: 'Holo Nova', weight: 0.4, color: '#e0e7ff' },
            { name: 'Singularity', weight: 0.1, color: '#fbbf24' }
        ]
    },
    3: { // Halving Pattern - now third
        name: 'Halving Pattern',
        rarities: [
            { name: 'Moondust', weight: 50, color: '#808080' },
            { name: 'Starborn', weight: 25, color: '#22c55e' },
            { name: 'Lunara', weight: 12.5, color: '#a855f7' },
            { name: 'Celestara', weight: 6.25, color: '#3b82f6' },
            { name: 'Divinara', weight: 3.125, color: '#f97316' },
            { name: 'Holo Nova', weight: 1.5625, color: '#e0e7ff' },
            { name: 'Singularity', weight: 0.78125, color: '#fbbf24' }
        ]
    },
    4: { // Fibonacci-like - now fourth
        name: 'Fibonacci-like',
        rarities: [
            { name: 'Moondust', weight: 45, color: '#808080' },
            { name: 'Starborn', weight: 27, color: '#22c55e' },
            { name: 'Lunara', weight: 16, color: '#a855f7' },
            { name: 'Celestara', weight: 8, color: '#3b82f6' },
            { name: 'Divinara', weight: 3, color: '#f97316' },
            { name: 'Holo Nova', weight: 0.8, color: '#e0e7ff' },
            { name: 'Singularity', weight: 0.2, color: '#fbbf24' }
        ]
    },
    5: { // Linear Decrease - now fifth
        name: 'Linear Decrease',
        rarities: [
            { name: 'Moondust', weight: 40, color: '#808080' },
            { name: 'Starborn', weight: 25, color: '#22c55e' },
            { name: 'Lunara', weight: 15, color: '#a855f7' },
            { name: 'Celestara', weight: 10, color: '#3b82f6' },
            { name: 'Divinara', weight: 6, color: '#f97316' },
            { name: 'Holo Nova', weight: 3, color: '#e0e7ff' },
            { name: 'Singularity', weight: 1, color: '#fbbf24' }
        ]
    },
    6: { // Custom
        name: 'Custom',
        rarities: [
            { name: 'Moondust', weight: 50, color: '#808080' },
            { name: 'Starborn', weight: 23, color: '#22c55e' },
            { name: 'Lunara', weight: 14, color: '#a855f7' },
            { name: 'Celestara', weight: 8, color: '#3b82f6' },
            { name: 'Divinara', weight: 4, color: '#f97316' },
            { name: 'Holo Nova', weight: 0.8, color: '#e0e7ff' },
            { name: 'Singularity', weight: 0.2, color: '#fbbf24' }
        ]
    }
};

// Store wheel instances and statistics
const wheels = {};
const stats = {};

// Initialize stats for each wheel
for (let i = 1; i <= 6; i++) {
    stats[i] = {
        spins: 0,
        results: {}
    };
    // Initialize result counters
    wheelConfigs[i].rarities.forEach(rarity => {
        stats[i].results[rarity.name] = 0;
    });
}

// Initialize all wheels when page loads
window.addEventListener('load', () => {
    // Check if library is loaded
    if (typeof window.spinWheel === 'undefined' || !window.spinWheel.Wheel) {
        console.error('Spin wheel library not loaded. Make sure spin-wheel.js is included.');
        console.log('spinWheel type:', typeof window.spinWheel);
        return;
    }
    
    console.log('Library loaded, initializing wheels...');
    initializeWheels();
    setupEventListeners();
    updateCustomInputListeners();
});

function initializeWheels() {
    for (let i = 1; i <= 6; i++) {
        createWheel(i);
    }
}

function createWheel(wheelNum) {
    const config = wheelConfigs[wheelNum];
    const container = document.getElementById(`wheel${wheelNum}`);
    
    // Create items for the wheel
    const items = config.rarities.map(rarity => ({
        label: rarity.name,
        weight: rarity.weight,
        backgroundColor: rarity.color,
        labelColor: rarity.color === '#fbbf24' || rarity.color === '#e0e7ff' ? '#000' : '#fff'
    }));

    // Create the wheel
    const wheel = new window.spinWheel.Wheel(container, {
        items: items,
        radius: 0.88,
        itemLabelRadius: 0.93,
        itemLabelRadiusMax: 0.35,
        itemLabelRotation: 0,
        itemLabelAlign: 'center',
        itemLabelColors: items.map(item => item.labelColor),
        itemLabelBaselineOffset: -0.07,
        itemLabelFont: '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        itemBackgroundColors: items.map(item => item.backgroundColor),
        rotationSpeedMax: 500,
        rotationResistance: -100,
        lineWidth: 0,
        borderWidth: 3,
        borderColor: '#333',
        overlayImage: null,
        pointerAngle: 0
    });

    wheels[wheelNum] = wheel;

    // Position the spin button on top of the canvas
    const button = container.querySelector('.spin-btn');
    if (button) {
        // The button is already positioned in CSS
        button.dataset.wheel = wheelNum;
    }

    // Handle spin complete
    wheel.onRest = () => {
        const winner = config.rarities[wheel.getCurrentIndex()];
        updateStats(wheelNum, winner.name);
    };
}

function setupEventListeners() {
    // Spin buttons
    document.querySelectorAll('.spin-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const wheelNum = parseInt(e.target.dataset.wheel);
            performSpin(wheelNum);
        });
    });

    // Custom wheel percentage inputs
    document.querySelectorAll('.custom-rates input').forEach(input => {
        input.addEventListener('input', updateTotalPercentage);
    });
}

function performSpin(wheelNum) {
    const wheel = wheels[wheelNum];
    if (wheel && wheel.rotationSpeed === 0) {
        const force = Math.random() * 300 + 200;
        wheel.spin(force);
    }
}

function updateStats(wheelNum, result) {
    stats[wheelNum].spins++;
    stats[wheelNum].results[result]++;
    
    // Update UI
    const statsDiv = document.getElementById(`stats${wheelNum}`);
    const spinsDiv = statsDiv.querySelector('.spins');
    const resultsDiv = statsDiv.querySelector('.results');
    
    spinsDiv.textContent = `Spins: ${stats[wheelNum].spins}`;
    
    // Update results display
    resultsDiv.innerHTML = '';
    Object.entries(stats[wheelNum].results).forEach(([name, count]) => {
        if (count > 0) {
            const percentage = ((count / stats[wheelNum].spins) * 100).toFixed(2);
            const div = document.createElement('div');
            div.textContent = `${name}: ${count} (${percentage}%)`;
            resultsDiv.appendChild(div);
        }
    });

    updateComparisonTable();
}

function updateCustomInputListeners() {
    const inputs = document.querySelectorAll('.custom-rates input');
    inputs.forEach(input => {
        input.addEventListener('change', updateCustomWheel);
    });
}

function updateTotalPercentage() {
    const inputs = document.querySelectorAll('.custom-rates input');
    let total = 0;
    inputs.forEach(input => {
        total += parseFloat(input.value) || 0;
    });
    
    const totalDisplay = document.getElementById('total-percentage');
    totalDisplay.textContent = `${total.toFixed(3)}%`;
    
    const totalCheck = document.querySelector('.total-check');
    if (Math.abs(total - 100) < 0.01) {
        totalCheck.classList.remove('invalid');
    } else {
        totalCheck.classList.add('invalid');
    }
}

function updateCustomWheel() {
    const moondust = parseFloat(document.getElementById('rate-moondust').value) || 0;
    const starborn = parseFloat(document.getElementById('rate-starborn').value) || 0;
    const lunara = parseFloat(document.getElementById('rate-lunara').value) || 0;
    const celestara = parseFloat(document.getElementById('rate-celestara').value) || 0;
    const divinara = parseFloat(document.getElementById('rate-divinara').value) || 0;
    const holoNova = parseFloat(document.getElementById('rate-holo-nova').value) || 0;
    const singularity = parseFloat(document.getElementById('rate-singularity').value) || 0;
    
    // Update config
    wheelConfigs[6].rarities[0].weight = moondust;
    wheelConfigs[6].rarities[1].weight = starborn;
    wheelConfigs[6].rarities[2].weight = lunara;
    wheelConfigs[6].rarities[3].weight = celestara;
    wheelConfigs[6].rarities[4].weight = divinara;
    wheelConfigs[6].rarities[5].weight = holoNova;
    wheelConfigs[6].rarities[6].weight = singularity;
    
    // Recreate the wheel
    createWheel(6);
    
    updateTotalPercentage();
}

// Global control functions
function resetAllStats() {
    for (let i = 1; i <= 6; i++) {
        stats[i].spins = 0;
        wheelConfigs[i].rarities.forEach(rarity => {
            stats[i].results[rarity.name] = 0;
        });
        
        // Update UI
        const statsDiv = document.getElementById(`stats${i}`);
        statsDiv.querySelector('.spins').textContent = 'Spins: 0';
        statsDiv.querySelector('.results').innerHTML = '';
    }
    updateComparisonTable();
}

function spinAll() {
    for (let i = 1; i <= 6; i++) {
        performSpin(i);
    }
}

function bulkSpin(count) {
    // Show simulation modal
    showSimulationResults(count);
}

// Global simulation function that simulates all wheels
function simulateSpins(count) {
    showSimulationResults(count);
}

// Individual wheel simulation - doesn't spin wheels, just calculates probabilities
function simulateWheelSpins(wheelNum, count) {
    const config = wheelConfigs[wheelNum];
    const results = {};
    
    // Initialize results
    config.rarities.forEach(rarity => {
        results[rarity.name] = 0;
    });
    
    // Calculate cumulative weights
    const cumulativeWeights = [];
    let totalWeight = 0;
    config.rarities.forEach(rarity => {
        totalWeight += rarity.weight;
        cumulativeWeights.push(totalWeight);
    });
    
    // Simulate spins
    for (let i = 0; i < count; i++) {
        const random = Math.random() * totalWeight;
        for (let j = 0; j < cumulativeWeights.length; j++) {
            if (random < cumulativeWeights[j]) {
                results[config.rarities[j].name]++;
                break;
            }
        }
    }
    
    return results;
}

// Show simulation results in a modal
function showSimulationResults(count) {
    const modal = document.createElement('div');
    modal.className = 'simulation-modal';
    modal.innerHTML = `
        <div class="simulation-content">
            <h2>Simulation Results (${count.toLocaleString()} spins per wheel)</h2>
            <button class="close-modal" onclick="this.closest('.simulation-modal').remove()">×</button>
            <div class="simulation-grid"></div>
        </div>
    `;
    
    const grid = modal.querySelector('.simulation-grid');
    
    // Run simulations for each wheel
    for (let i = 1; i <= 6; i++) {
        const results = simulateWheelSpins(i, count);
        const config = wheelConfigs[i];
        
        const wheelDiv = document.createElement('div');
        wheelDiv.className = 'simulation-wheel';
        wheelDiv.innerHTML = `<h3>${config.name}</h3>`;
        
        const table = document.createElement('table');
        table.className = 'simulation-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Rarity</th>
                    <th>Expected</th>
                    <th>Got</th>
                    <th>Actual %</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        
        const tbody = table.querySelector('tbody');
        config.rarities.forEach(rarity => {
            const expected = (rarity.weight * count / 100).toFixed(1);
            const got = results[rarity.name];
            const actualPercent = ((got / count) * 100).toFixed(3);
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><span class="rarity-dot ${rarity.name.toLowerCase().replace(' ', '-')}"></span> ${rarity.name}</td>
                <td>${expected}</td>
                <td>${got}</td>
                <td>${actualPercent}%</td>
            `;
            tbody.appendChild(row);
        });
        
        wheelDiv.appendChild(table);
        grid.appendChild(wheelDiv);
    }
    
    document.body.appendChild(modal);
}

// Add simulation buttons to global controls
document.addEventListener('DOMContentLoaded', () => {
    const globalControls = document.querySelector('.global-controls');
    
    // Remove old bulk spin buttons and add new simulation buttons
    globalControls.innerHTML = `
        <button onclick="resetAllStats()">Reset All Stats</button>
        <button onclick="spinAll()">Spin All Wheels</button>
        <button onclick="showSimulationResults(100)">Simulate 100</button>
        <button onclick="showSimulationResults(500)">Simulate 500</button>
        <button onclick="showSimulationResults(1000)">Simulate 1,000</button>
        <button onclick="showSimulationResults(10000)">Simulate 10,000</button>
        <button onclick="exportStats()">Export Stats</button>
    `;
});

function updateComparisonTable() {
    const table = document.getElementById('comparisonTable');
    if (!table) return;
    
    let html = '<table><thead><tr><th>Wheel</th><th>Spins</th>';
    
    // Add headers for each rarity
    const rarityNames = wheelConfigs[1].rarities.map(r => r.name);
    rarityNames.forEach(name => {
        html += `<th>${name}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    // Add data for each wheel
    for (let i = 1; i <= 6; i++) {
        if (stats[i].spins > 0) {
            html += `<tr><td>${wheelConfigs[i].name}</td><td>${stats[i].spins}</td>`;
            rarityNames.forEach(name => {
                const count = stats[i].results[name] || 0;
                const percentage = stats[i].spins > 0 ? ((count / stats[i].spins) * 100).toFixed(2) : '0.00';
                html += `<td>${count} (${percentage}%)</td>`;
            });
            html += '</tr>';
        }
    }
    
    html += '</tbody></table>';
    table.innerHTML = html;
}

function exportStats() {
    const data = {
        timestamp: new Date().toISOString(),
        wheels: {}
    };
    
    for (let i = 1; i <= 6; i++) {
        data.wheels[wheelConfigs[i].name] = {
            config: wheelConfigs[i].rarities.map(r => ({ name: r.name, weight: r.weight })),
            stats: stats[i]
        };
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wheel-test-stats-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Add modal styles dynamically
const style = document.createElement('style');
style.textContent = `
.simulation-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
    overflow: auto;
}

.simulation-content {
    background: var(--bg-secondary);
    border-radius: 20px;
    padding: 30px;
    max-width: 1200px;
    width: 100%;
    max-height: 90vh;
    overflow: auto;
    position: relative;
}

.simulation-content h2 {
    color: var(--accent);
    margin-bottom: 20px;
}

.close-modal {
    position: absolute;
    top: 15px;
    right: 15px;
    background: transparent;
    border: none;
    color: var(--text);
    font-size: 30px;
    cursor: pointer;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.close-modal:hover {
    color: var(--accent);
}

.simulation-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 20px;
}

.simulation-wheel {
    background: var(--glass);
    padding: 20px;
    border-radius: 15px;
}

.simulation-wheel h3 {
    color: var(--accent);
    margin-bottom: 15px;
    font-size: 1.1em;
}

.simulation-table {
    width: 100%;
    border-collapse: collapse;
}

.simulation-table th,
.simulation-table td {
    padding: 8px;
    text-align: left;
    border-bottom: 1px solid var(--glass-border);
}

.simulation-table th {
    background: rgba(255, 255, 255, 0.05);
    font-weight: 600;
    color: var(--accent);
}

.simulation-table tr:hover {
    background: rgba(255, 255, 255, 0.02);
}

.rarity-dot {
    width: 10px;
    height: 10px;
    display: inline-block;
    border-radius: 50%;
    margin-right: 5px;
}
`;
document.head.appendChild(style);