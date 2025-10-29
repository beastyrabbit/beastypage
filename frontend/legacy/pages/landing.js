// Landing page interactions

// No longer using cache manager or service worker - sprite sheets handle everything

// Initialize critical modules at app startup to prevent component lifecycle issues
import spriteMapper from '../core/spriteMapper.js';
import spriteSheetLoader from '../core/spriteSheetLoader.js';

// Defer spriteMapper initialization to avoid browser timing restrictions
// The browser's network stack needs to be ready before we can make fetch requests
// Using both DOMContentLoaded and setTimeout as fallback for maximum compatibility
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Additional small delay to ensure browser is fully ready
        setTimeout(() => {
            spriteMapper.init().then(() => {
                console.log('SpriteMapper initialized after DOM ready');
            }).catch(error => {
                console.error('Failed to initialize SpriteMapper:', error);
            });
        }, 10);
    });
} else {
    // DOM already loaded, but still defer to next tick
    setTimeout(() => {
        spriteMapper.init().then(() => {
            console.log('SpriteMapper initialized (DOM was already ready)');
        }).catch(error => {
            console.error('Failed to initialize SpriteMapper:', error);
        });
    }, 10);
}

async function preloadSprites() {
    const button = document.getElementById('preloadButton');
    const progressDiv = document.getElementById('downloadProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    if (button) {
        button.textContent = 'Loading sprite sheets...';
        button.disabled = true;
    }
    
    if (progressDiv) {
        progressDiv.style.display = 'block';
    }
    
    try {
        // Initialize sprite sheet loader
        await spriteSheetLoader.init();
        
        // Preload common sprite sheets
        await spriteSheetLoader.preloadCommonSheets();
        
        if (progressBar) progressBar.style.width = '100%';
        if (progressText) progressText.textContent = '100%';
        
        if (button) {
            button.textContent = 'Sprite sheets loaded!';
            setTimeout(() => {
                button.textContent = 'Preload Sprites';
                button.disabled = false;
                if (progressDiv) progressDiv.style.display = 'none';
            }, 2000);
        }
    } catch (error) {
        console.error('Failed to preload sprites:', error);
        if (button) {
            button.textContent = 'Preload failed';
            button.disabled = false;
        }
    }
}

// Set up button event listeners
document.addEventListener('DOMContentLoaded', () => {
    const preloadButton = document.getElementById('preloadButton');
    
    if (preloadButton) {
        preloadButton.addEventListener('click', preloadSprites);
    }
});

// Subtle card mouse-follow highlight
const cards = document.querySelectorAll("[data-card]");
cards.forEach((card) => {
  card.addEventListener("pointermove", (e) => {
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty("--mx", x + "%");
    card.style.setProperty("--my", y + "%");
  });
});

// Copy buttons with toast notification
const copyButtons = document.querySelectorAll("[data-copy]");
const toast = document.getElementById("toast");

copyButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const txt = btn.getAttribute("data-copy");
    try {
      await navigator.clipboard.writeText(txt);
      
      // Show toast notification
      if (toast) {
        toast.classList.add("show");
        setTimeout(() => {
          toast.classList.remove("show");
        }, 2000);
      }
      
      // Update button state temporarily
      btn.setAttribute("aria-live", "polite");
      btn.setAttribute("title", "Copied!");
      setTimeout(() => {
        btn.setAttribute("title", "Copy link");
      }, 2000);
    } catch (err) {
      console.warn("Copy failed:", err);
    }
  });
});

// ESC to go back (unless typing)
document.addEventListener('keydown', (e) => {
  const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || 
                   document.activeElement.isContentEditable;
  if (!isTyping && e.key === 'Escape' && window.history.length > 1) {
    window.history.back();
  }
});