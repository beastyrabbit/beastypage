import catGenerator from '../core/catGeneratorV2.js';
import spriteMapper from '../core/spriteMapper.js';
import mapperApi from '../convex/mapper-api.js';
import { decodeCatShare } from '../core/catShare.js';

const CONFIG = {
    CANVAS_SIZE: 700,
    SPRITE_SIZE: 120,
    SPRITE_BIG: 700
};

const VALID_SPRITES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18];

const SPRITE_NAMES = {
    0: 'Kitten (0)',
    1: 'Kitten (1)',
    2: 'Kitten (2)',
    3: 'Adolescent (3)',
    4: 'Adolescent (4)',
    5: 'Adolescent (5)',
    6: 'Adult (6)',
    7: 'Adult (7)',
    8: 'Adult (8)',
    9: 'Longhair Adult (9)',
    10: 'Longhair Adult (10)',
    11: 'Longhair Adult (11)',
    12: 'Senior (12)',
    13: 'Senior (13)',
    14: 'Senior (14)',
    15: 'Paralyzed Adult (15)',
    16: 'Paralyzed Longhair Adult (16)',
    17: 'Paralyzed Young (17)',
    18: 'Sick Adult (18)',
    19: 'Sick Young (19)',
    20: 'Newborn (20)'
};

class SingleCatViewer {
    constructor() {
        this.buildingCanvas = document.getElementById('buildingCanvas');
        this.parameterTable = document.getElementById('parameterTable');
        this.spritesSection = document.getElementById('spritesSection');
        this.spritesGrid = document.getElementById('spritesGrid');
        this.toast = document.getElementById('toast');
        this.errorEl = document.getElementById('viewerError');
        this.copyCatBigBtn = document.getElementById('copyCatBig');
        this.copyCatNoTintBtn = document.getElementById('copyCatNoTint');
        this.buildingGlow = document.querySelector('.building-glow');
        if (this.buildingGlow) {
            this.buildingGlow.classList.remove('active');
            this.buildingGlow.style.display = 'none';
        }

        this.currentParams = null;
        this.renderedCanvas = null;
        this.shareData = null;

        this.resizeHandler = () => {
            window.requestAnimationFrame(() => this.updateCanvasSize(true));
        };

        window.addEventListener('resize', this.resizeHandler);

        this.init().catch(err => {
            console.error('SingleCatViewer init failed:', err);
            this.showError('Failed to load shared cat.');
        });
    }

    async init() {
        await spriteMapper.init();
        this.shareData = await this.loadShareData();
        if (!this.shareData || !this.shareData.params) {
            this.showError('Missing or invalid cat data in URL.');
            return;
        }

        this.currentParams = this.shareData.params;

        this.updateCanvasSize();
        await this.renderCat();
        setTimeout(() => this.updateCanvasSize(true), 50);
        this.renderParameterTable();
        await this.renderSpriteVariations();
        this.setupButtons();
    }

    async loadShareData() {
        const params = new URLSearchParams(window.location.search);
        const mapperId = params.get('id');
        if (mapperId) {
            try {
                return await this.fetchMapperPayload(mapperId);
            } catch (error) {
                console.error('Failed to load shared cat by id:', error);
            }
        }

        const encoded = params.get('cat');
        if (encoded) {
            try {
                return decodeCatShare(decodeURIComponent(encoded));
            } catch (error) {
                console.error('Failed to decode legacy shared cat data:', error);
            }
        }

        return null;
    }

    async fetchMapperPayload(id) {
        const record = await mapperApi.get(id);

        if (!record?.cat_data) {
            throw new Error('Shared cat data missing.');
        }

        return record.cat_data;
    }
    async renderCat() {
        if (!this.currentParams) return;
        try {
            const result = await catGenerator.generateCat(this.currentParams);
            this.renderedCanvas = result.canvas;
            this.updateCanvasSize();
            this.drawToCanvas(result.canvas);
        } catch (error) {
            console.error('Failed to render cat:', error);
            this.showError('Unable to render the provided cat.');
        }
    }

    drawToCanvas(sourceCanvas) {
        if (!sourceCanvas || !this.buildingCanvas) return;
        const ctx = this.buildingCanvas.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        const size = this.buildingCanvas.width || CONFIG.CANVAS_SIZE;
        ctx.clearRect(0, 0, size, size);
        try {
            ctx.drawImage(sourceCanvas, 0, 0, size, size);
        } catch (error) {
            console.error('Failed to draw canvas:', error);
        }
    }

    updateCanvasSize(redraw = false) {
        if (!this.buildingCanvas) return;
        const display = document.getElementById('catDisplay');
        if (!display) return;
        const size = display.offsetWidth || CONFIG.CANVAS_SIZE;
        if (size <= 0) return;
        if (this.buildingCanvas.width !== size) {
            this.buildingCanvas.width = size;
            this.buildingCanvas.height = size;
        }
        if (redraw && this.renderedCanvas) {
            this.drawToCanvas(this.renderedCanvas);
        }
    }

    renderParameterTable() {
        if (!this.parameterTable || !this.shareData) return;
        const { params, accessorySlots, scarSlots, tortieSlots, counts } = this.shareData;
        this.parameterTable.innerHTML = '';
        this.parameterTable.classList.add('visible');

        const addRow = (label, value, { formatted = false, always = true } = {}) => {
            const display = formatted ? value : formatValue(value);
            if (!always && (display === 'None' || display === '')) {
                return;
            }
            this.parameterTable.appendChild(createRow(label, display));
        };

        addRow('Colour', params.colour);
        addRow('Pelt', params.peltName);
        addRow('Eyes', formatEyes(params), { formatted: true });
        addRow('Eye Colour 2', params.eyeColour2, { always: true });

        const totalTortieSlots = Math.max(counts.tortie || 0, tortieSlots?.length || 0);
        for (let i = 0; i < totalTortieSlots; i++) {
            const layer = tortieSlots?.[i] || null;
            const value = layer
                ? `${formatValue(layer.mask)} • ${formatValue(layer.pattern)} • ${formatValue(layer.colour)}`
                : 'None';
            addRow(`Tortie ${i + 1}`, value, { formatted: true, always: true });
        }

        addRow('Tint', params.tint);
        addRow('Skin', params.skinColour);
        addRow('White Patches', params.whitePatches);
        addRow('Points', params.points);
        addRow('White Patches Tint', params.whitePatchesTint);
        addRow('Vitiligo', params.vitiligo);

        const totalAccessorySlots = Math.max(counts.accessories || 0, accessorySlots?.length || 0);
        for (let i = 0; i < totalAccessorySlots; i++) {
            const slotValue = accessorySlots?.[i] || 'none';
            addRow(`Accessory ${i + 1}`, slotValue);
        }

        const totalScarSlots = Math.max(counts.scars || 0, scarSlots?.length || 0);
        for (let i = 0; i < totalScarSlots; i++) {
            const slotValue = scarSlots?.[i] || 'none';
            addRow(`Scar ${i + 1}`, slotValue);
        }

        addRow('Shading', formatBoolean(params.shading), { formatted: true });
        addRow('Reverse', formatBoolean(params.reverse), { formatted: true });
        addRow('Dark Forest', formatBoolean(params.darkForest || params.darkMode), { formatted: true });
        addRow('Star Clan', formatBoolean(params.dead), { formatted: true });
        addRow('Sprite', SPRITE_NAMES[params.spriteNumber] || `Sprite ${params.spriteNumber ?? '?'}`, { formatted: true });
    }

    async renderSpriteVariations() {
        if (!this.spritesSection || !this.spritesGrid || !this.currentParams) return;
        this.spritesGrid.innerHTML = '';
        this.spritesSection.style.display = 'block';

        for (const spriteNumber of VALID_SPRITES) {
            const spriteItem = document.createElement('div');
            spriteItem.className = 'sprite-item';
            if (spriteNumber === this.currentParams.spriteNumber) {
                spriteItem.classList.add('highlighted');
            }

            spriteItem.innerHTML = `
                <div class="sprite-name">${SPRITE_NAMES[spriteNumber] || `Sprite ${spriteNumber}`}</div>
                <div class="sprite-canvas-wrapper">
                    <canvas class="sprite-canvas" width="${CONFIG.SPRITE_SIZE}" height="${CONFIG.SPRITE_SIZE}"></canvas>
                </div>
                <div class="sprite-buttons">
                    <button class="sprite-copy-btn" title="Copy (120×120)">
                        <img src="../assets/images/copy-solid.svg" class="copy-icon" alt="Copy">
                    </button>
                    <button class="sprite-copy-big-btn" title="Copy Big (700×700)">
                        <img src="../assets/images/copy-solid.svg" class="copy-icon" alt="Copy">
                        <img src="../assets/images/copy-solid.svg" class="copy-icon" alt="Copy">
                    </button>
                </div>
            `;

            this.spritesGrid.appendChild(spriteItem);

            try {
                const result = await catGenerator.generateCat({ ...this.currentParams, spriteNumber });
                const canvas = spriteItem.querySelector('.sprite-canvas');
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(result.canvas, 0, 0, CONFIG.SPRITE_SIZE, CONFIG.SPRITE_SIZE);

                const copyBtn = spriteItem.querySelector('.sprite-copy-btn');
                const copyBigBtn = spriteItem.querySelector('.sprite-copy-big-btn');

                copyBtn?.addEventListener('click', () => this.copyCanvasToClipboard(result.canvas, CONFIG.SPRITE_SIZE, `Copied ${SPRITE_NAMES[spriteNumber] || `Sprite ${spriteNumber}`}!`));
                copyBigBtn?.addEventListener('click', () => this.copySpriteBig({ ...this.currentParams, spriteNumber }, SPRITE_NAMES[spriteNumber] || `Sprite ${spriteNumber}`));
            } catch (error) {
                console.error(`Failed to render sprite ${spriteNumber}:`, error);
            }
        }
    }

    setupButtons() {
        this.copyCatBigBtn?.addEventListener('click', () => this.copyCurrentCat());
        this.copyCatNoTintBtn?.addEventListener('click', () => this.copyCurrentCat(true));
        this.copyPageUrlBtn?.addEventListener('click', () => this.copyPageUrl());
    }

    async copyCurrentCat(noTint = false) {
        if (!this.currentParams) return;
        const params = noTint
            ? { ...this.currentParams, darkForest: false, darkMode: false, dead: false }
            : this.currentParams;
        try {
            const result = await catGenerator.generateCat(params);
            await this.copyCanvasToClipboard(result.canvas, CONFIG.SPRITE_BIG, noTint ? 'Copied cat (no tint)!' : 'Copied cat (700×700)!');
        } catch (error) {
            console.error('Failed to copy cat:', error);
            this.showError('Copy failed. Your browser may not support clipboard images.');
        }
    }

    async copySpriteBig(params, spriteName) {
        try {
            const result = await catGenerator.generateCat(params);
            await this.copyCanvasToClipboard(result.canvas, CONFIG.SPRITE_BIG, `Copied ${spriteName} (${CONFIG.SPRITE_BIG}×${CONFIG.SPRITE_BIG})!`);
        } catch (error) {
            console.error('Failed to copy sprite (big):', error);
            this.showError('Failed to copy sprite.');
        }
    }

    async copyCanvasToClipboard(canvas, size, successMessage) {
        let targetCanvas = canvas;
        if (size && canvas.width !== size) {
            const resized = document.createElement('canvas');
            resized.width = size;
            resized.height = size;
            const ctx = resized.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(canvas, 0, 0, size, size);
            targetCanvas = resized;
        }

        try {
            const blob = await new Promise((resolve, reject) => targetCanvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas produced no data')), 'image/png'));

            if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
                const item = new ClipboardItem({ 'image/png': blob });
                await navigator.clipboard.write([item]);
                this.showToast(successMessage);
                return;
            }

            this.downloadBlob(blob, 'shared-cat.png');
            this.showToast('Image downloaded.');
        } catch (error) {
            console.error('Failed to copy canvas:', error);
            this.showError('Copy failed. Your browser may not support clipboard images.');
        }
    }

    async copyPageUrl() {
        const url = window.location.href;
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            this.fallbackCopyText(url);
            return;
        }
        try {
            await navigator.clipboard.writeText(url);
            this.showToast('Page URL copied!');
        } catch (error) {
            console.error('Failed to copy page URL:', error);
            this.fallbackCopyText(url);
        }
    }

    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'shared-cat.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }


    fallbackCopyText(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            const success = document.execCommand('copy');
            if (success) {
                this.showToast('Page URL copied!');
            } else {
                window.prompt('Copy this URL', text);
            }
        } catch (error) {
            window.prompt('Copy this URL', text);
        } finally {
            document.body.removeChild(textarea);
        }
    }

    showToast(message) {
        if (!this.toast) return;
        this.toast.textContent = message;
        this.toast.classList.add('show');
        setTimeout(() => {
            this.toast.classList.remove('show');
        }, 2000);
    }

    showError(message) {
        if (this.errorEl) {
            this.errorEl.textContent = message;
            this.errorEl.style.display = 'block';
        }
    }
}

function createRow(label, value) {
    const row = document.createElement('div');
    row.className = 'parameter-row';
    row.innerHTML = `
        <span class="param-name">${label}</span>
        <span class="param-value">${value}</span>
    `;
    return row;
}

function formatValue(value) {
    if (value === undefined || value === null || value === '' || value === 'none') {
        return 'None';
    }
    if (typeof value === 'boolean') {
        return value ? 'Yes' : 'No';
    }
    const str = value.toString().replace(/_/g, ' ').replace(/^\d+\s*-\s*/, '');
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function formatBoolean(value) {
    return value ? 'Yes' : 'No';
}

function formatEyes(params) {
    const primary = formatValue(params.eyeColour);
    const secondary = params.eyeColour2 && params.eyeColour2 !== params.eyeColour
        ? formatValue(params.eyeColour2)
        : null;
    return secondary ? `${primary} / ${secondary}` : primary;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new SingleCatViewer());
} else {
    new SingleCatViewer();
}
