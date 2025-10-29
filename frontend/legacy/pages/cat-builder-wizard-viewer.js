import catGenerator from '../core/catGeneratorV2.js';
import spriteMapper from '../core/spriteMapper.js';
import mapperApi from '../convex/mapper-api.js';

class CatBuilderWizardViewer {
    constructor() {
        this.timelineContainer = document.getElementById('timelineEntries');
        this.statusLabel = document.getElementById('timelineStatus');
        this.finalCanvas = document.getElementById('finalCanvas');
        this.copyButton = document.getElementById('copyFinalSprite');
        this.infoTable = document.getElementById('catInfoTable');
        this.toast = document.getElementById('viewerToast');
        this.payload = null;
        this.timelineEntries = [];
        this.activeEntryIndex = null;

        this.init();
    }

    async init() {
        try {
            await spriteMapper.init();
            const payload = await this.loadPayload();
            if (!payload) {
                this.setStatus('Unable to load timeline data.');
                return;
            }
            this.payload = payload;
            await this.renderFinalCat();
            await this.renderTimeline();
            this.setStatus('Timeline ready.');
            this.copyButton?.addEventListener('click', () => this.copyFinalSprite());
        } catch (error) {
            console.error('Failed to initialize timeline viewer:', error);
            this.setStatus('Failed to load timeline.');
        }
    }

    async loadPayload() {
        const params = new URLSearchParams(window.location.search);
        const recordId = params.get('id');
        const encoded = params.get('data');

        if (recordId) {
            try {
                const record = await mapperApi.get(recordId);
                return record?.cat_data || null;
            } catch (error) {
                console.error('Failed to fetch timeline payload:', error);
            }
        }

        if (encoded) {
            try {
                const json = this.decodePayload(encoded);
                return JSON.parse(json);
            } catch (error) {
                console.error('Failed to decode timeline payload:', error);
            }
        }

        return null;
    }

    decodePayload(encoded) {
        if (typeof atob === 'function') {
            return decodeURIComponent(escape(atob(encoded)));
        }
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(encoded, 'base64').toString('utf-8');
        }
        throw new Error('Base64 decoding not supported in this environment');
    }

    async renderFinalCat() {
        if (!this.finalCanvas || !this.payload?.finalParams) return;
        try {
            await this.renderCatToCanvas(this.finalCanvas, this.payload.finalParams);
            this.populateInfoTable(this.payload.finalParams);
        } catch (error) {
            console.error('Failed to render final cat:', error);
        }
    }

    async renderTimeline() {
        if (!this.timelineContainer) return;
        this.timelineContainer.innerHTML = '';
        this.statusLabel = null;

        const steps = Array.isArray(this.payload?.steps) ? this.payload.steps : [];
        if (!steps.length) {
            this.timelineContainer.innerHTML = '<div class="timeline-empty">No timeline entries recorded.</div>';
            return;
        }

        this.timelineEntries = [];
        for (const step of steps) {
            const item = document.createElement('div');
            item.className = 'viewer-timeline-item';

            const canvas = document.createElement('canvas');
            canvas.width = 120;
            canvas.height = 120;
            item.appendChild(canvas);

            const info = document.createElement('div');
            const meta = document.createElement('div');
            meta.className = 'viewer-step-meta';
            const title = document.createElement('h3');
            title.className = 'viewer-step-title';
            title.textContent = step.title || this.formatName(step.id);
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'viewer-copy-btn';
            copyBtn.textContent = 'Copy';
            meta.append(title, copyBtn);

            const summary = document.createElement('p');
            summary.className = 'viewer-step-summary';
            summary.textContent = step.summary || 'No summary provided';
            info.append(meta, summary);
            item.appendChild(info);

            this.timelineContainer.appendChild(item);
            await this.renderCatToCanvas(canvas, step.params);

            const entry = { element: item, canvas, params: step.params, title: title.textContent, summary: summary.textContent };
            this.timelineEntries.push(entry);

            item.addEventListener('click', () => this.selectTimelineEntry(entry));
            copyBtn.addEventListener('click', evt => {
                evt.stopPropagation();
                this.copyStageSprite(entry.params);
            });
        }

        // Default to final step in list
        if (this.timelineEntries.length) {
            this.selectTimelineEntry(this.timelineEntries[this.timelineEntries.length - 1]);
        }
    }

    async renderCatToCanvas(canvas, params) {
        if (!canvas || !params) return;
        try {
            const result = await catGenerator.generateCat(params);
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(result.canvas, 0, 0, canvas.width, canvas.height);
        } catch (error) {
            console.error('Failed to render cat to canvas:', error);
        }
    }

    async selectTimelineEntry(entry) {
        const index = this.timelineEntries.indexOf(entry);
        if (index === -1) return;

        this.activeEntryIndex = index;
        for (const item of this.timelineEntries) {
            item.element.classList.toggle('active', item === entry);
        }

        await this.renderCatToCanvas(this.finalCanvas, entry.params);
        this.populateInfoTable(entry.params);
        this.setStatus(`Viewing: ${entry.title}`);
    }

    populateInfoTable(params) {
        if (!this.infoTable || !params) return;
        const rows = [];
        const entries = [
            ['Pose', params.spriteNumber],
            ['Pattern', params.peltName],
            ['Base Colour', params.colour],
            ['Eye Colour', params.eyeColour],
            ['Eye Colour 2', params.eyeColour2 || 'None'],
            ['Skin Colour', params.skinColour],
            ['Tint', params.tint || 'none'],
            ['White Patches', params.whitePatches || 'none'],
            ['Points', params.points || 'none'],
            ['Vitiligo', params.vitiligo || 'none'],
            ['White Patch Tint', params.whitePatchesTint || 'none'],
            ['Accessories', (Array.isArray(params.accessories) && params.accessories.length) ? params.accessories.join(', ') : (params.accessory || 'none')],
            ['Scars', (Array.isArray(params.scars) && params.scars.length) ? params.scars.join(', ') : (params.scar || 'none')],
            ['Tortie Enabled', params.isTortie ? 'Yes' : 'No']
        ];

        if (params.isTortie && Array.isArray(params.tortie)) {
            params.tortie.forEach((layer, index) => {
                if (!layer) return;
                rows.push([`Tortie Layer ${index + 1}`, `${layer.pattern || 'Unknown'} · ${layer.colour || 'Unknown'} · ${layer.mask || 'Unknown'}`]);
            });
        }

        this.infoTable.innerHTML = entries.concat(rows).map(([label, value]) => {
            return `<tr><th>${this.formatName(label)}</th><td>${this.formatName(value)}</td></tr>`;
        }).join('');
    }

    async copyFinalSprite() {
        if (!this.finalCanvas) return;
        if (!navigator.clipboard || !navigator.clipboard.write) {
            this.showToast('Clipboard API not available');
            return;
        }

        try {
            const blob = await new Promise(resolve => this.finalCanvas.toBlob(resolve));
            if (!blob) throw new Error('Failed to create image blob');
            const item = new ClipboardItem({ [blob.type]: blob });
            await navigator.clipboard.write([item]);
            this.showToast('Sprite copied to clipboard!');
        } catch (error) {
            console.error('Failed to copy sprite:', error);
            this.showToast('Unable to copy sprite');
        }
    }

    async copyStageSprite(params) {
        if (!navigator.clipboard || !navigator.clipboard.write) {
            this.showToast('Clipboard API not available');
            return;
        }

        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 700;
            tempCanvas.height = 700;
            await this.renderCatToCanvas(tempCanvas, params);
            const blob = await new Promise(resolve => tempCanvas.toBlob(resolve));
            if (!blob) throw new Error('Failed to create image blob');
            const item = new ClipboardItem({ [blob.type]: blob });
            await navigator.clipboard.write([item]);
            this.showToast('Sprite copied to clipboard!');
        } catch (error) {
            console.error('Failed to copy sprite:', error);
            this.showToast('Unable to copy sprite');
        }
    }

    setStatus(message) {
        if (this.statusLabel) {
            this.statusLabel.textContent = message;
        }
        if (this.toast) {
            this.toast.textContent = message;
            this.toast.classList.add('show');
            clearTimeout(this.toastTimeout);
            this.toastTimeout = setTimeout(() => this.toast.classList.remove('show'), 2200);
        }
    }

    formatName(value) {
        if (!value) return '';
        return value
            .toString()
            .replace(/_/g, ' ')
            .replace(/-/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, char => char.toUpperCase());
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new CatBuilderWizardViewer();
    });
} else {
    new CatBuilderWizardViewer();
}
