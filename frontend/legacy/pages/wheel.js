// Name generation helpers
const prefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 
                  'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 
                  'Phi', 'Chi', 'Psi', 'Omega', 'Cosmic', 'Stellar', 'Quantum', 'Nebula', 'Void', 'Astral'];
const suffixes = ['Prime', 'Nova', 'Flux', 'Core', 'Nexus', 'Pulse', 'Wave', 'Spark', 'Echo', 'Glow',
                  'Blaze', 'Storm', 'Drift', 'Surge', 'Shift', 'Phase', 'Vortex', 'Matrix', 'Prism', 'Cipher'];

function generateUniqueName(index) {
    const prefixIndex = index % prefixes.length;
    const suffixIndex = Math.floor(index / prefixes.length) % suffixes.length;
    const number = Math.floor(index / (prefixes.length * suffixes.length)) + 1;
    return `${prefixes[prefixIndex]}-${suffixes[suffixIndex]}-${number}`;
}

// BACK TO ORIGINAL CONFIGURATION
const prizes = [
    { name: 'Moondust', chance: 40, color: '#8b8b7a' }, // grey with gold tint
    { name: 'Starborn', chance: 25, color: '#6b8e4e' }, // muted green with gold
    { name: 'Lunara', chance: 15, color: '#9b7c5d' }, // muted purple-gold
    { name: 'Celestara', chance: 10, color: '#7a8ca5' }, // muted blue-grey
    { name: 'Divinara', chance: 6, color: '#c97743' }, // burnt orange
    { name: 'Holo Nova', chance: 3, color: '#f4e4c1' }, // pale gold
    { name: 'Singularity', chance: 1, color: '#d4af37' } // pure gold
];

// Create wheel items with actual chance percentages
// Visual segments now match real odds - no more artificial adjustment
const items = prizes.map((prize, index) => {
    console.log(`Item ${index}: ${prize.name} - ${prize.chance}%`);
    return {
        label: prize.name,
        weight: prize.chance, // Visual matches actual odds
        backgroundColor: prize.color,
        labelColor: '#ffffff'
    };
});

// Debug: Log segment sizes
console.log('=== WHEEL SEGMENT SIZES ===');
items.forEach((item, index) => {
    const degrees = (prizes[index].chance / 100) * 360;
    console.log(`${prizes[index].name}: ${prizes[index].chance}% (${degrees.toFixed(1)}°)`);
});

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    // Create the wheel
    const container = document.querySelector('#wheel-container');
    
    // Calculate responsive wheel radius based on container size
    const containerSize = Math.min(container.clientWidth, container.clientHeight);
    const wheelRadius = Math.floor((containerSize - 56) / 2); // Account for padding
    
    console.log('=== CREATING WHEEL WITH ITEMS ===');
    console.log('Container size:', containerSize);
    console.log('Wheel radius:', wheelRadius);
    console.log('Total items:', items.length);
    console.log('Items:', items);
    
    const wheel = new spinWheel.Wheel(container, {
        items: items,
        radius: wheelRadius,
        itemLabelRadius: 0.85,
        itemLabelRadiusMax: 0.3,
        itemLabelRotation: 0,
        itemLabelAlign: 'right',
        itemLabelColors: ['#ffffff'],
        itemLabelBaselineOffset: -0.07,
        itemLabelFont: 'Arial',
        itemLabelFontSizeMax: Math.min(28, Math.floor(wheelRadius / 14)), // Scale font with wheel size
        itemBackgroundColors: items.map(item => item.backgroundColor),
        rotationSpeedMax: 300,
        rotationResistance: -50,
        lineWidth: 3,
        lineColor: 'rgba(255, 255, 255, 0.8)',
        borderWidth: 4,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        image: null,
        overlayImage: null,
        isInteractive: false,
        pointerAngle: 0
    });
    
    // Button element
    const spinButton = document.getElementById('spinButton');
    let isSpinning = false;
    
    // Cryptographically secure random selection system
    // Generate secure random integer 0-99 (avoiding modulo bias)
    function getSecureRandomInt100() {
        const array = new Uint8Array(1);
        let value;
        do {
            crypto.getRandomValues(array);
            value = array[0];
        } while (value >= 200); // Reject values >= 200 to avoid modulo bias
        return value % 100; // Returns 0-99
    }
    
    // Simple cumulative threshold system
    function selectPrizeSecure() {
        const random = getSecureRandomInt100(); // 0-99
        
        console.log(`Secure random: ${random}/99`);
        
        // Direct threshold checks (much simpler than ranges)
        if (random < 40) return { prize: prizes[0], index: 0, random }; // 0-39: Moondust (40%)
        if (random < 65) return { prize: prizes[1], index: 1, random }; // 40-64: Starborn (25%) 
        if (random < 80) return { prize: prizes[2], index: 2, random }; // 65-79: Lunara (15%)
        if (random < 90) return { prize: prizes[3], index: 3, random }; // 80-89: Celestara (10%)
        if (random < 96) return { prize: prizes[4], index: 4, random }; // 90-95: Divinara (6%)
        if (random < 99) return { prize: prizes[5], index: 5, random }; // 96-98: Holo Nova (3%)
        return { prize: prizes[6], index: 6, random }; // 99: Singularity (1%)
    }
    
    console.log('=== USING CRYPTOGRAPHICALLY SECURE RNG ===');
    
    // Function to select prize based on slot ranges
    function selectPrize(forceIndex = null) {
        if (forceIndex !== null) {
            console.log(`DEBUG: Forcing selection of index ${forceIndex} (${prizes[forceIndex].name})`);
            return { prize: prizes[forceIndex], index: forceIndex };
        }
        
        // Use cryptographically secure selection  
        return selectPrizeSecure();
    }
    
    // Function to perform spin with optional forced prize
    function performSpin(forceIndex = null) {
        if (isSpinning) return;
        
        isSpinning = true;
        spinButton.disabled = true;
        
        // Select the prize
        const selection = selectPrize(forceIndex);
        const selectedPrize = selection.prize;
        console.log('Selected:', selectedPrize.name, 'at index', selection.index);
        
        // Store selected prize and cheated status for use in onRest
        wheel._selectedPrize = selectedPrize;
        wheel._wasCheated = forceIndex !== null;
        
        // Set up the onRest event handler
        wheel.onRest = (event) => {
            console.log('=== SPIN COMPLETE ===');
            console.log('Pre-selected winner:', wheel._selectedPrize.name);
            console.log('Wheel stopped at index:', event.currentIndex);
            console.log('Wheel visually shows:', prizes[event.currentIndex].name);
            
            // Show the pre-selected prize (not where wheel visually landed)
            showWinPopup(wheel._selectedPrize);
            
            // Tiered special effects for rare prizes
            if (wheel._selectedPrize.name === 'Singularity') {
                confettiExplosion(); // Ultimate rarity - massive explosion
            } else if (wheel._selectedPrize.name === 'Holo Nova') {
                confettiShower(); // Second rarest - intense shower
            } else if (wheel._selectedPrize.name === 'Divinara') {
                confettiBurst(); // Third rarest - moderate burst
            }
        };
        
        // Spin to the selected item
        const duration = 4000 + Math.random() * 2000; // 4-6 seconds
        const numberOfRevolutions = 5 + Math.floor(Math.random() * 5); // 5-10 full rotations
        
        console.log(`=== SPINNING TO INDEX ${selection.index} ===`);
        console.log(`Prize at this index: ${prizes[selection.index].name}`);
        console.log(`Spin duration: ${duration}ms, Revolutions: ${numberOfRevolutions}`);
        
        // spinToItem(itemIndex, duration, spinToCenter, numberOfRevolutions, direction, easingFunction)
        wheel.spinToItem(selection.index, duration, false, numberOfRevolutions, 1);
    }
    
    // Spin button click handler
    spinButton.addEventListener('click', function() {
        performSpin();
    });
    
    // Canvas-confetti effects using exact patterns from examples
    
    function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }
    
    // Divinara (6%): Simple firework effect - 15 second continuous burst
    function confettiBurst() {
        const duration = 15 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { 
            startVelocity: 30, 
            spread: 360, 
            ticks: 60, 
            zIndex: 10000,
            colors: ['#c97743', '#b86e3c', '#e8d5b7', '#f2eadf']
        };

        const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) {
                return clearInterval(interval);
            }
            const particleCount = 50 * (timeLeft / duration);
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
    }
    
    // Holo Nova (3%): Firework + stars + snow
    function confettiShower() {
        // 1. Firework effect
        const duration = 15 * 1000;
        const animationEnd = Date.now() + duration;
        const fireworkDefaults = { 
            startVelocity: 30, 
            spread: 360, 
            ticks: 60, 
            zIndex: 10000,
            colors: ['#f4e4c1', '#e9d8b4', '#d8c08f']
        };

        const fireworkInterval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) {
                return clearInterval(fireworkInterval);
            }
            const particleCount = 50 * (timeLeft / duration);
            confetti({ ...fireworkDefaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...fireworkDefaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);

        // 2. Stars effect - 3 quick bursts
        const starDefaults = {
            spread: 360,
            ticks: 50,
            gravity: 0,
            decay: 0.94,
            startVelocity: 30,
            zIndex: 10000,
            colors: ['#f4e4c1', '#ffd700', '#fff8e1']
        };
        
        function shoot() {
            confetti({ ...starDefaults, particleCount: 40, scalar: 1.2, shapes: ['star'] });
            confetti({ ...starDefaults, particleCount: 10, scalar: 0.75, shapes: ['circle'] });
        }
        
        setTimeout(shoot, 0);
        setTimeout(shoot, 100);
        setTimeout(shoot, 200);

        // 3. Snow effect - continuous falling
        const snowDuration = 15 * 1000;
        const snowAnimationEnd = Date.now() + snowDuration;
        let skew = 1;

        (function frame() {
            const timeLeft = snowAnimationEnd - Date.now();
            const ticks = Math.max(200, 500 * (timeLeft / snowDuration));
            skew = Math.max(0.8, skew - 0.001);

            confetti({
                zIndex: 10000,
                particleCount: 1,
                startVelocity: 0,
                ticks: ticks,
                origin: {
                    x: Math.random(),
                    y: (Math.random() * skew) - 0.2
                },
                colors: ['#ffffff'],
                shapes: ['circle'],
                gravity: randomInRange(0.4, 0.6),
                scalar: randomInRange(0.4, 1),
                drift: randomInRange(-0.4, 0.4)
            });

            if (timeLeft > 0) {
                requestAnimationFrame(frame);
            }
        }());
    }
    
    // Singularity (1%): Ultimate everything - firework + stars + gold snow + school pride
    function confettiExplosion() {
        // 1. Firework effect
        const duration = 15 * 1000;
        const animationEnd = Date.now() + duration;
        const fireworkDefaults = { 
            startVelocity: 30, 
            spread: 360, 
            ticks: 60, 
            zIndex: 10000,
            colors: ['#d4af37', '#ffd700', '#c9a227', '#f5e6c8']
        };

        const fireworkInterval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) {
                return clearInterval(fireworkInterval);
            }
            const particleCount = 50 * (timeLeft / duration);
            confetti({ ...fireworkDefaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...fireworkDefaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);

        // 2. Stars effect - 3 quick bursts with gold
        const starDefaults = {
            spread: 360,
            ticks: 50,
            gravity: 0,
            decay: 0.94,
            startVelocity: 30,
            zIndex: 10000,
            colors: ['#d4af37', '#ffd700', '#fff700', '#ffe135']
        };
        
        function shootStars() {
            confetti({ ...starDefaults, particleCount: 40, scalar: 1.2, shapes: ['star'] });
            confetti({ ...starDefaults, particleCount: 10, scalar: 0.75, shapes: ['circle'] });
        }
        
        setTimeout(shootStars, 0);
        setTimeout(shootStars, 100);
        setTimeout(shootStars, 200);

        // 3. Gold snow effect - continuous falling gold particles
        const snowDuration = 15 * 1000;
        const snowAnimationEnd = Date.now() + snowDuration;
        let skew = 1;

        (function frame() {
            const timeLeft = snowAnimationEnd - Date.now();
            const ticks = Math.max(200, 500 * (timeLeft / snowDuration));
            skew = Math.max(0.8, skew - 0.001);

            confetti({
                zIndex: 10000,
                particleCount: 1,
                startVelocity: 0,
                ticks: ticks,
                origin: {
                    x: Math.random(),
                    y: (Math.random() * skew) - 0.2
                },
                colors: ['#d4af37', '#ffd700', '#f5e6c8'],
                shapes: ['circle'],
                gravity: randomInRange(0.4, 0.6),
                scalar: randomInRange(0.4, 1),
                drift: randomInRange(-0.4, 0.4)
            });

            if (timeLeft > 0) {
                requestAnimationFrame(frame);
            }
        }());

        // 4. School pride - continuous side-shooting for 15 seconds
        const prideEnd = Date.now() + (15 * 1000);
        const prideColors = ['#800020', '#d4af37', '#ffd700'];

        (function frame() {
            confetti({
                zIndex: 10000,
                particleCount: 2,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: prideColors
            });
            confetti({
                zIndex: 10000,
                particleCount: 2,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: prideColors
            });

            if (Date.now() < prideEnd) {
                requestAnimationFrame(frame);
            }
        }());
    }
    
    // Show win popup
    function showWinPopup(prize) {
        console.log('showWinPopup called with:', prize);
        const popup = document.getElementById('winPopup');
        const popupPrize = document.getElementById('popupPrize');
        const popupTitle = document.getElementById('popupTitle');
        
        if (!popup || !popupPrize) {
            console.error('Popup elements not found');
            return;
        }
        
        const specialClass = prize.name === 'Holo Nova' ? 'holo-nova' : '';
        
        // Check if this was a cheated spin
        if (wheel._wasCheated) {
            popupPrize.innerHTML = `
                <div style="background: linear-gradient(45deg, #dc2626, #f97316); color: white; padding: 8px 16px; border-radius: 8px; margin-bottom: 15px; font-weight: 600; box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4);">
                    ⚠️ CHEATED - Result was forced!
                </div>
                <span style="color: ${prize.color}" class="${specialClass}">${prize.name}</span>
            `;
            if (popupTitle) {
                popupTitle.innerHTML = 'You Won! <span style="color: #f97316; font-size: 0.8em;">(Cheated)</span>';
            }
        } else {
            popupPrize.innerHTML = `<span style="color: ${prize.color}" class="${specialClass}">${prize.name}</span>`;
            if (popupTitle) {
                popupTitle.textContent = 'You Won!';
            }
        }
        
        popup.classList.add('show');
        console.log('Popup should be visible now');
        
        // Reset cheated flag
        wheel._wasCheated = false;
    }
    
    // Setup close button
    document.getElementById('closePopup').addEventListener('click', function() {
        const popup = document.getElementById('winPopup');
        popup.classList.remove('show');
        
        // Re-enable spin button
        spinButton.disabled = false;
        isSpinning = false;
    });
    
    // Global function to force a specific prize
    window.forcePrize = function(index) {
        if (index < 0 || index >= prizes.length) {
            console.error('Invalid prize index');
            return;
        }
        console.log(`=== FORCING ${prizes[index].name.toUpperCase()} WIN ===`);
        performSpin(index);
    };
    
    // Debug function to force Singularity (kept for backward compatibility)
    window.forceSingularity = function() {
        const singularityIndex = prizes.findIndex(p => p.name === 'Singularity');
        forcePrize(singularityIndex);
    };
    
    // Show exact probabilities  
    window.showProbabilities = function() {
        console.log('=== PROBABILITIES (0-99 System) ===');
        let cumulative = 0;
        prizes.forEach((prize, index) => {
            const start = cumulative;
            cumulative += prize.chance;
            console.log(`[${index}] ${prize.name}: ${prize.chance}% (random ${start}-${cumulative-1})`);
        });
        console.log(`Total: ${cumulative}%`);
    };
    
    // Test probability distribution using secure RNG
    window.testProbabilities = function(runs = 100000) {
        console.log(`=== TESTING ${runs.toLocaleString()} SPINS ===`);
        const results = {};
        prizes.forEach(p => results[p.name] = 0);
        
        for (let i = 0; i < runs; i++) {
            const selection = selectPrizeSecure();
            results[selection.prize.name]++;
            
            if (selection.prize.name === 'Singularity') {
                console.log(`🎉 SINGULARITY HIT! Run #${i + 1}, random: ${selection.random}`);
            }
        }
        
        console.log(`
=== RESULTS ===`);
        prizes.forEach(p => {
            const actual = (results[p.name] / runs * 100).toFixed(3);
            console.log(`${p.name}: Expected ${p.chance}%, Got ${actual}%`);
        });
    };
    
    // End of wheel functionality
});

// Copy functionality removed - no copy button exists on wheel page

// ESC to go back (unless typing)
document.addEventListener('keydown', (e) => {
    const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || 
                     document.activeElement.isContentEditable;
    if (!isTyping && e.key === 'Escape') {
        window.location.href = 'index.html';
    }
});