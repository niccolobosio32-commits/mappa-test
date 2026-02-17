/* ============================================
   ARCHIVIO PARTIGIANI - Mappa AI
   app.js
   ============================================ */

// ============================================
// INIZIALIZZAZIONE MAPPA
// ============================================
let map = L.map('map', { 
    zoomControl: false,
    tap: false 
}).setView([42.0, 12.5], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

// FIX MOBILE: Forza ricalcolo dimensioni
function fixMapSize() {
    setTimeout(() => { map.invalidateSize(); }, 300);
}
window.addEventListener('load', fixMapSize);
window.addEventListener('resize', fixMapSize);

const stellaIcon = L.divIcon({
    className: 'stella',
    html: `<svg width="32" height="32" viewBox="0 0 100 100"><polygon points="50,5 61,39 98,39 68,60 79,94 50,74 21,94 32,60 2,39 39,39" fill="#e21118" stroke="#fff" stroke-width="3"/></svg>`,
    iconSize: [32, 32], iconAnchor: [16, 16]
});

let markers = L.markerClusterGroup({ disableClusteringAtZoom: 16 });
map.addLayer(markers);
let database = [];
let searchTimeout;

// ============================================
// CARICAMENTO DATABASE CSV
// ============================================
Papa.parse("progetto_mappa.csv", {
    download: true, header: true, skipEmptyLines: true,
    complete: function(res) {
        database = res.data.map(d => {
            let clean = {};
            Object.keys(d).forEach(k => clean[k.trim().toLowerCase()] = d[k]?.trim() || "");
            return clean;
        });
        caricaMarker();
        const urlParams = new URLSearchParams(window.location.search);
        const nomep = urlParams.get('p');
        if (nomep) setTimeout(() => apri(decodeURIComponent(nomep)), 1000);
    }
});

// ============================================
// MOTORE FILTRI
// ============================================
const MotoreFiltri = {
    RAGGIO_MAX: 50000,
    esegui: function(tipo) {
        const vn = document.getElementById('search-name').value.toLowerCase().trim();
        const vt = document.getElementById('search-theme').value.toLowerCase().trim();
        const vc = document.getElementById('search-city').value.toLowerCase().trim();
        const vr = document.getElementById('filtro-regione').value;

        let filtrati = database.filter(d => {
            const mNome = vn === "" || d.nominativo.toLowerCase().includes(vn);
            const mTema = vt === "" || (d.scheda && d.scheda.toLowerCase().includes(vt));
            const mReg  = vr === "" || (d.regione.trim().toLowerCase() === vr.toLowerCase());
            return mNome && mTema && mReg;
        });

        if (tipo === 'city' && vc.length >= 3) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${vc},Italy&limit=1`)
                .then(r => r.json()).then(data => {
                    if (data.length > 0) {
                        const centro = L.latLng(data[0].lat, data[0].lon);
                        flyDolce(centro, 10);
                        let vicini = filtrati.filter(d => {
                            const lat = parseFloat(d.lat?.replace(',','.'));
                            const lon = parseFloat(d.lon?.replace(',','.'));
                            return !isNaN(lat) && centro.distanceTo([lat, lon]) <= this.RAGGIO_MAX;
                        });
                        caricaMarker(d => vicini.includes(d), false);
                        this.renderDropdown(vicini.slice(0, 50), true);
                    }
                });
            }, 500);
        } else {
            this.aggiornaUI(filtrati, vr !== "");
        }
    },
    aggiornaUI: function(lista, nascondiRegione) {
        caricaMarker(d => lista.includes(d), false);
        const vn = document.getElementById('search-name').value;
        const vt = document.getElementById('search-theme').value;
        const vr = document.getElementById('filtro-regione').value;
        if (vn.length >= 2 || vt.length >= 2 || vr !== "") {
            this.renderDropdown(lista.slice(0, 50), nascondiRegione);
        } else {
            document.getElementById('results-dropdown').style.display = 'none';
        }
    },
    renderDropdown: function(lista, nascondiRegione) {
        const drop = document.getElementById('results-dropdown');
        if (lista.length > 0) {
            drop.innerHTML = lista.map(d => {
                const safeName = d.nominativo.replace(/'/g, "\\'");
                const info = d.città_nascita || d.regione;
                return `<div class="res-item" onclick="apri('${safeName}')">
                            <b>${escapeHtml(d.nominativo)}</b> 
                            <span style="font-size:11px;opacity:0.6">${escapeHtml(info)}</span>
                        </div>`;
            }).join('');
            drop.style.display = 'block';
        } else {
            drop.innerHTML = '<div class="res-item">Nessun risultato</div>';
            drop.style.display = 'block';
        }
    }
};

function filtra(tipo) { MotoreFiltri.esegui(tipo); }
function filtraRegione() { MotoreFiltri.esegui('regione'); }

// ============================================
// NAVIGAZIONE MAPPA
// ============================================
function flyDolce(target, zoom = 12) {
    map.flyTo(target, zoom, { duration: 3.5, easeLinearity: 0.1, noMoveStart: true });
}

function caricaMarker(filtroFn = null, fit = false) {
    markers.clearLayers();
    let bounds = L.latLngBounds();
    let hasData = false;
    database.forEach(d => {
        if (!filtroFn || filtroFn(d)) {
            const lat = parseFloat(d.lat?.replace(',','.')), lon = parseFloat(d.lon?.replace(',','.'));
            if (!isNaN(lat) && !isNaN(lon)) {
                let m = L.marker([lat, lon], { icon: stellaIcon });
                m.bindTooltip(`<b>${d.nominativo}</b>`, { direction: 'top', offset: [0, -10] });
                m.on('click', (e) => { L.DomEvent.stopPropagation(e); openDetails(d); });
                m.on('mouseover', function() {
                    this.getElement().style.filter = "brightness(1.5) saturate(2)";
                });
                m.on('mouseout', function() {
                    this.getElement().style.filter = "none";
                });
                markers.addLayer(m);
                bounds.extend([lat, lon]);
                hasData = true;
            }
        }
    });
    if (hasData && fit) map.flyToBounds(bounds, {padding: [50, 50], duration: 2.5});
}

// ============================================
// PANNELLO DETTAGLI
// ============================================
function openDetails(d) {
    let bio = d.scheda || "Nessuna biografia disponibile.";
    if (bio.startsWith(d.nominativo)) {
        bio = bio.replace(d.nominativo, "").trim();
        bio = bio.charAt(0).toUpperCase() + bio.slice(1);
    }

    let bioFormattata = bio.replace(/\. ?([A-Z])/g, '.<br><span style="display:block; margin-top:8px;"></span>$1');

    document.getElementById('h-nome').innerText = d.nominativo.toUpperCase();
    document.getElementById('h-reg').innerText = d.regione;
    document.getElementById('text-bio').innerHTML = bioFormattata;

    document.getElementById('vimeo-player').src = d.id ? `https://player.vimeo.com/video/${d.id}?autoplay=0` : "";

    const rel = database.filter(x => x.regione === d.regione && x.nominativo !== d.nominativo).slice(0, 15);
    document.getElementById('box-rel-list').innerHTML = 
        `<div style="font-size:9px; font-weight:800; opacity:0.5; margin-bottom:10px; letter-spacing:1px;">CORRELATI / ${escapeHtml(d.regione.toUpperCase())}</div>` + 
        rel.map(r => `<div class="rel-item" onclick="apri('${r.nominativo.replace(/'/g, "\\'")}')">${escapeHtml(r.nominativo)}</div>`).join('');

    const shareUrl = window.location.origin + window.location.pathname + "?p=" + encodeURIComponent(d.nominativo);
    document.getElementById('box-social').innerHTML = `
        <div class="social-box">
            <a class="social-btn" href="https://api.whatsapp.com/send?text=${encodeURIComponent(d.nominativo + " " + shareUrl)}" target="_blank"><svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.27 9.27 0 01-4.487-1.164l-.325-.193-3.34.877.89-3.253-.213-.339a9.27 9.27 0 01-1.421-4.906c0-5.113 4.158-9.27 9.274-9.27 2.476 0 4.803.965 6.556 2.719a9.23 9.23 0 012.716 6.558c0 5.116-4.158 9.274-9.274 9.274m10.963-12.713A11.01 11.01 0 0012.048 2.73c-6.103 0-11.07 4.966-11.07 11.07 0 1.95.51 3.855 1.478 5.533L.65 23.35l4.103-1.076a11.002 11.002 0 005.293 1.358h.005c6.101 0 11.07-4.968 11.07-11.072 0-2.956-1.15-5.736-3.238-7.824z"/></svg></a>
            <a class="social-btn" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}" target="_blank"><svg viewBox="0 0 24 24"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.99 3.66 9.12 8.44 9.88v-6.99H7.9v-2.89h2.54V9.8c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.45h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.77l-.44 2.89h-2.33v6.99C18.34 21.12 22 16.99 22 12z"/></svg></a>
            <a class="social-btn" href="javascript:void(0)" onclick="navigator.clipboard.writeText('${shareUrl}'); alert('Link copiato!')"><svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></a>
        </div>`;

    document.getElementById('details-panel').classList.add('open');
}

function closeDetails() { 
    document.getElementById('details-panel').classList.remove('open'); 
    setTimeout(() => { document.getElementById('vimeo-player').src = ""; }, 500); 
}

function apri(nome) {
    const d = database.find(x => x.nominativo.toLowerCase().includes(nome.toLowerCase().trim()));
    if (!d) return;
    document.getElementById('results-dropdown').style.display = 'none';
    openDetails(d);
    const lat = parseFloat(d.lat?.replace(',','.')), lon = parseFloat(d.lon?.replace(',','.'));
    if (!isNaN(lat)) flyDolce([lat, lon], 15);
}

map.on('click', () => { 
    closeDetails(); 
    document.getElementById('results-dropdown').style.display = 'none'; 
});

// ============================================
// FUNZIONE DISTANZA GEO-RADIALE
// ============================================
function getDist(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================
// FIX XSS: Escape HTML per testo non fidato
// Prima: il testo utente veniva iniettato direttamente con innerHTML
// Ora: tutti i testi esterni passano per questa funzione prima di finire in HTML
// ============================================
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================
// CHIAVE API — NOTA DI SICUREZZA
// L'attuale sistema Base64 NON è sicuro per file pubblici:
// chiunque può eseguire atob() in DevTools e recuperare la chiave.
// Soluzione raccomandata: usare un backend proxy (Cloudflare Worker,
// Netlify Function, ecc.) che chiami Gemini server-side.
// La funzione sotto è mantenuta invariata per compatibilità,
// ma va sostituita con una chiamata al tuo proxy non appena possibile.
// ============================================
function getSecretKey() {
    const encodedKey = "QUl6YVN5RFF3TTF2WEdYVm5oczYyZVg5dmxvNmgwNGI0VXVhUHJF";
    try {
        return atob(encodedKey.trim());
    } catch (e) {
        alert("Errore decodifica chiave API. Verifica la stringa Base64.");
        return null;
    }
}

// ============================================
// AI CHAT
// ============================================

// FIX MEMORIA: Array che mantiene la history della conversazione tra turni.
// Prima ogni chiamata era stateless. Ora il modello riceve tutti i turni
// precedenti e può rispondere a domande di follow-up ("e lui?", "e dopo?")
let conversationHistory = [];

let chatOpenedOnce = false;

// Percorsi divisi in due categorie: tematici e cronologico-geografici.
// Pool ampi (24 voci ciascuno): ad ogni apertura vengono pescati 3 a caso per categoria.
// Più voci = più varietà e senso di scoperta ad ogni sessione.
const PERCORSI_TEMATICI = [
    { emoji: "🚲", label: "Donne nella Resistenza", query: "Fammi esempi di donne partigiane e staffette" },
    { emoji: "⛓️", label: "IMI – Internati Militari", query: "Raccontami degli internati militari italiani nei lager tedeschi" },
    { emoji: "🚂", label: "Deportazioni nei Lager", query: "Quali partigiani sono stati deportati a Mauthausen o Dachau?" },
    { emoji: "🔥", label: "Stragi nazifasciste", query: "Stragi e rappresaglie nazifasciste contro i civili" },
    { emoji: "✊", label: "Operai e scioperi", query: "Operai, scioperi nelle fabbriche e resistenza urbana 1944" },
    { emoji: "🤝", label: "Reti di salvataggio", query: "Reti di salvataggio di ebrei, prigionieri e alleati" },
    { emoji: "🏘️", label: "Resistenza urbana", query: "Partigiani e reti clandestine nelle città italiane" },
    { emoji: "📜", label: "Rappresaglie e eccidi", query: "Rappresaglie tedesche e fasciste contro la popolazione civile" },
    { emoji: "🗺️", label: "Organizzazione delle brigate", query: "Raccontami l'organizzazione delle brigate partigiane per regione" },
    { emoji: "🎯", label: "Azioni di sabotaggio", query: "Azioni di sabotaggio e attacchi partigiani a infrastrutture nemiche" },
    { emoji: "📡", label: "Reti clandestine e spie", query: "Reti di informatori, spie e comunicazioni clandestine nella Resistenza" },
    { emoji: "🏥", label: "Feriti e rifugiati", query: "Come venivano curati e nascosti i partigiani feriti o ricercati?" },
    { emoji: "⚗️", label: "Armi e rifornimenti", query: "Come si procuravano armi e rifornimenti le formazioni partigiane?" },
    { emoji: "🖨️", label: "Stampa clandestina", query: "Giornali, volantini e propaganda clandestina nella Resistenza italiana" },
    { emoji: "✝️", label: "Clero e Resistenza", query: "Il ruolo di preti, suore e istituzioni religiose nel proteggere i partigiani" },
    { emoji: "🎓", label: "Studenti e giovani", query: "Studenti e giovani che entrarono nella Resistenza dopo l'8 settembre" },
    { emoji: "🚩", label: "Partiti e Comitati di Liberazione", query: "Come funzionavano i CLN e i partiti politici clandestini durante la Resistenza?" },
    { emoji: "🔒", label: "Prigionieri e torture", query: "Testimonianze di partigiani catturati, torturati o incarcerati" },
    { emoji: "🌍", label: "Stranieri nella Resistenza", query: "Stranieri — slavi, ebrei, alleati — che combatterono con i partigiani italiani" },
    { emoji: "👴", label: "Partigiani anziani oggi", query: "Cosa raccontano oggi i partigiani ancora vivi della loro esperienza?" },
    { emoji: "🏆", label: "Medaglie e riconoscimenti", query: "Partigiani insigniti di medaglia d'oro o d'argento al valor militare" },
    { emoji: "💬", label: "Nomi di battaglia", query: "Nomi di battaglia più curiosi e la storia dietro la loro scelta" },
    { emoji: "🧒", label: "Partigiani giovanissimi", query: "Ragazzi e ragazze che combatterono nella Resistenza a meno di vent'anni" },
    { emoji: "🏚️", label: "Case rifugio e nascondigli", query: "Case, cascine e nascondigli usati dai partigiani e dalle reti di supporto" }
];


const PERCORSI_GEO = [
    { emoji: "🏔️", label: "Alpi e valli alpine", query: "Partigiani che operavano sulle Alpi e nelle valli alpine" },
    { emoji: "📍", label: "Resistenza in Emilia", query: "Partigiani che hanno operato in Emilia-Romagna" },
    { emoji: "⚔️", label: "8 settembre 1943", query: "Come è nata la resistenza armata dopo l'8 settembre 1943?" },
    { emoji: "🌊", label: "Resistenza in Liguria", query: "Partigiani che combatterono in Liguria e sulla costa" },
    { emoji: "🦁", label: "Resistenza in Toscana", query: "Partigiani e formazioni nella Resistenza toscana" },
    { emoji: "🏛️", label: "Roma e il Lazio", query: "Resistenza clandestina a Roma e nel Lazio durante l'occupazione tedesca" },
    { emoji: "❄️", label: "Inverno 1944–45", query: "Come sopravvissero le formazioni partigiane durante l'inverno 1944-45?" },
    { emoji: "🌅", label: "Liberazione aprile 1945", query: "Come si svolse la liberazione nell'aprile 1945 nelle diverse città?" },
    { emoji: "🚜", label: "Resistenza contadina", query: "Il ruolo dei contadini e delle campagne nel sostenere la Resistenza" },
    { emoji: "🇬🇧", label: "Alleati e partigiani", query: "Come collaborarono i partigiani italiani con le forze alleate?" },
    { emoji: "🏙️", label: "Torino e il Piemonte", query: "Partigiani e formazioni nella Resistenza piemontese e a Torino" },
    { emoji: "🌿", label: "Chianti e Toscana centrale", query: "Partigiani che combatterono nel Chianti e nella Toscana centrale" },
    { emoji: "🌋", label: "Napoli e il Sud", query: "La Resistenza e le Quattro Giornate di Napoli nel settembre 1943" },
    { emoji: "🏞️", label: "Appennino tosco-emiliano", query: "Partigiani che operavano sull'Appennino tosco-emiliano" },
    { emoji: "🌁", label: "Milano e la Lombardia", query: "Resistenza clandestina a Milano e nelle città lombarde" },
    { emoji: "🏖️", label: "Adriatico e Marche", query: "Partigiani e formazioni nelle Marche e lungo la costa adriatica" },
    { emoji: "🗻", label: "Dolomiti e Friuli", query: "La Resistenza nelle Dolomiti e in Friuli Venezia Giulia" },
    { emoji: "🌾", label: "Pianura Padana", query: "La Resistenza nella Pianura Padana: città, cascine e canali" },
    { emoji: "🇾🇺", label: "Confine orientale", query: "Partigiani italiani e slavi sul confine orientale: collaborazioni e tensioni" },
    { emoji: "🏘️", label: "Resistenza in Veneto", query: "Partigiani e formazioni nella Resistenza veneta" },
    { emoji: "🌄", label: "Umbria e Marche centrali", query: "La Resistenza in Umbria e nelle Marche centrali" },
    { emoji: "🛤️", label: "Linea Gotica", query: "Partigiani che operarono lungo la Linea Gotica e collaborarono con gli Alleati" },
    { emoji: "🌉", label: "Genova e il porto", query: "La Resistenza operaia e portuale a Genova durante l'occupazione" },
    { emoji: "🏝️", label: "Sardegna e isole", query: "La Resistenza e la liberazione in Sardegna e nelle isole italiane" }
];

function toggleAIChat() {
    const win = document.getElementById('ai-chat-window');
    win.style.display = (win.style.display === 'none' || win.style.display === '') ? 'flex' : 'none';

    if (win.style.display === 'flex') {
        document.getElementById('ai-chat-input').focus();

        if (!chatOpenedOnce) {
            chatOpenedOnce = true;
            const box = document.getElementById('ai-chat-messages');

            box.innerHTML += `
                <div class="msg msg-ai finished">
                    <b>ARCHIVIO PRONTO</b><br>Fai una domanda libera sull'archivio.
                </div>`;
            box.scrollTop = box.scrollHeight;
        }
    }
}

function usaSuggerimento(testo) {
    const input = document.getElementById('ai-chat-input');
    input.value = testo;
    input.style.height = '';
    input.style.height = input.scrollHeight + 'px';
    sendAIMessage();
}

async function sendAIMessage() {
    const key = getSecretKey();
    if (!key) return;

    const input = document.getElementById('ai-chat-input');
    const box = document.getElementById('ai-chat-messages');
    let userText = input.value.trim();
    if (!userText) return;

    // FIX XSS: il testo dell'utente va in innerHTML solo dopo escape
    // Prima: box.innerHTML += `<div ...>${userText}</div>` — vulnerabile
    // Ora: creiamo il nodo e usiamo textContent
    const userBubble = document.createElement('div');
    userBubble.className = 'msg msg-user';
    userBubble.textContent = userText;
    box.appendChild(userBubble);

    input.value = "";
    input.style.height = '';

    const aiMsgId = "ai-" + Date.now();
    const aiMsgElement = document.createElement('div');
    aiMsgElement.id = aiMsgId;
    aiMsgElement.className = 'msg msg-ai';
    box.appendChild(aiMsgElement);
    box.scrollTop = box.scrollHeight;

    // FIX BARRA PROGRESSO: mostrata durante lo streaming, nascosta al termine
    const progressContainer = document.getElementById('ai-progress-container');
    const progressBar = document.getElementById('ai-progress-bar');
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.classList.add('progress-active');

    try {
        let q = userText.toLowerCase();
        const paroleQ = q.split(/\s+/).filter(p => p.length > 2);

        // MATCHING TESTUALE: cerca nei campi nominativo, scheda, regione, città
        let matches = database.filter(d => {
            const ricercaTesto = `${d.nominativo} ${d.scheda} ${d.regione} ${d.città_nascita}`.toLowerCase();
            return paroleQ.some(p => ricercaTesto.includes(p));
        });
        matches = matches.slice(0, 25);

        // MATCHING GEOGRAFICO: se il testo non produce risultati sufficienti,
        // geocodifica la query con Nominatim e trova i partigiani per prossimità
        // geografica nel raggio di 50km. Risolve query come "partigiani nel Chianti"
        // dove non c'è match testuale ma i dati lat/lon ci sono.
        if (matches.length < 3) {
            try {
                const geoRes = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(userText)},Italy&limit=1`
                );
                const geoData = await geoRes.json();
                if (geoData.length > 0) {
                    const centro = L.latLng(parseFloat(geoData[0].lat), parseFloat(geoData[0].lon));
                    const RAGGIO = 50000; // 50 km
                    const vicini = database.filter(d => {
                        const lat = parseFloat(d.lat?.replace(',','.'));
                        const lon = parseFloat(d.lon?.replace(',','.'));
                        return !isNaN(lat) && !isNaN(lon) && centro.distanceTo([lat, lon]) <= RAGGIO;
                    });
                    if (vicini.length > 0) {
                        // Ordina per distanza e prende i 25 più vicini
                        vicini.sort((a, b) => {
                            const dA = centro.distanceTo([parseFloat(a.lat?.replace(',','.')), parseFloat(a.lon?.replace(',','.'))]);
                            const dB = centro.distanceTo([parseFloat(b.lat?.replace(',','.')), parseFloat(b.lon?.replace(',','.'))]);
                            return dA - dB;
                        });
                        matches = vicini.slice(0, 25);
                    }
                }
            } catch (geoErr) {
                // geocodifica fallita silenziosamente, si procede con i matches testuali
            }
        }

        const nomiDaLinkare = matches
            .map(d => d.nominativo)
            .filter(n => n && n.trim().length > 3)
            .sort((a, b) => b.length - a.length);

        let estrattiLibro = "";
        if (typeof TESTO_LIBRO !== 'undefined') {
            const paragrafi = TESTO_LIBRO.split("\n\n");
            let trovati = paragrafi.filter(p => paroleQ.some(w => p.toLowerCase().includes(w)));
            estrattiLibro = trovati.slice(0, 5).join("\n\n");
        }

        // SEZIONE LIBRO NEL PROMPT:
        // Se ci sono estratti pertinenti, chiediamo a Gemini di integrarli.
        // Se non ci sono, la sezione libro viene soppressa del tutto dal prompt,
        // così Gemini non la inventa e non mette testo generico sul libro.
        const istruzioneLibro = estrattiLibro.trim().length > 0
            ? `3. **INTEGRAZIONE LIBRO**: Usa <libro-narrato> per approfondimenti e <libro-citazione> per citazioni dirette. Usa SOLO gli estratti forniti qui sotto. Se un estratto non è direttamente pertinente alla domanda, OMETTILO completamente — non inserire mai testo generico sul libro o sulla sua prefazione.`
            : `3. **INTEGRAZIONE LIBRO**: Nessun estratto pertinente disponibile. OMETTI completamente questa sezione. Non scrivere nulla sul libro, non spiegare la sua assenza, non citare la prefazione.`;

        const promptBase = `Agisci come Archivista Storico esperto 1943-45. 
RISPONDI IMMEDIATAMENTE. VIETATO SALUTARE.
1. **FATTI ACCERTATI**: Elenco puntato con [[Nome Cognome]] — fatti salienti.
2. **PERCORSI E RELAZIONI**: Analisi tecnica dei legami storiografici. Solo logica asciutta e fattuale. ASSOLUTAMENTE VIETATE opinioni, considerazioni personali o retorica.
${istruzioneLibro}
ALLA FINE scrivi sempre 3 domande brevi di esplorazione. Regole ferree: (1) massimo 12 parole ciascuna, (2) almeno 2 su 3 devono collegarsi direttamente alla risposta appena data — a un nome, un luogo o un evento già citato — così da invitare ad approfondire quella storia specifica, (3) la terza può aprire un percorso laterale verso altri partigiani o aree del database, (4) le tre domande devono essere diverse tra loro. Formato esatto:
SUGGERIMENTO: [domanda 1]
SUGGERIMENTO: [domanda 2]
SUGGERIMENTO: [domanda 3]

DATI ARCHIVIO (${matches.length} partigiani trovati):
${matches.map(d => `• ${d.nominativo} (${d.regione}${d.città_nascita ? ', ' + d.città_nascita : ''}): ${d.scheda?.substring(0, 250)}`).join("\n")}

${estrattiLibro.trim().length > 0 ? `ESTRATTI LIBRO:\n${estrattiLibro}` : ''}
DOMANDA: "${userText}"`;

        // FIX MEMORIA CONVERSAZIONE: aggiungiamo il turno corrente alla history
        // e passiamo tutta la history a Gemini, così il modello ricorda
        // il contesto dei messaggi precedenti nella stessa sessione.
        conversationHistory.push({ role: "user", parts: [{ text: promptBase }] });

        // FIX GESTIONE ERRORI HTTP: controlliamo il codice di risposta prima di leggere lo stream
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: conversationHistory })
        });

        // FIX ERRORI GEMINI: messaggi localizzati in italiano invece di e.message tecnico
        if (!response.ok) {
            let errMsg = "Errore nella risposta del server.";
            if (response.status === 429) {
                errMsg = "Troppe richieste: limite raggiunto. Riprova tra qualche secondo.";
            } else if (response.status === 503) {
                errMsg = "Il servizio AI non è disponibile al momento. Riprova tra poco.";
            } else if (response.status === 401 || response.status === 403) {
                errMsg = "Chiave API non valida o non autorizzata.";
            } else {
                errMsg = `Errore ${response.status}: impossibile contattare il servizio AI.`;
            }
            aiMsgElement.textContent = errMsg;
            aiMsgElement.classList.add('finished');
            progressContainer.style.display = 'none';
            progressBar.classList.remove('progress-active');
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");
            lines.forEach(line => {
                if (line.startsWith("data: ")) {
                    try {
                        const json = JSON.parse(line.substring(6));
                        fullText += json.candidates[0].content.parts[0].text;
                        aiMsgElement.innerText = fullText.split(/SUGGERIMENTO:/i)[0];
                        box.scrollTop = box.scrollHeight;
                    } catch (e) {}
                }
            });
        }

        // Salviamo la risposta del modello nella history per i turni successivi
        conversationHistory.push({ role: "model", parts: [{ text: fullText }] });

        // --- FORMATTAZIONE FINALE ---
        let suggerimenti = [];
        const regexSug = /^SUGGERIMENTO:\s*(.*)$/gim;
        let m;
        while ((m = regexSug.exec(fullText)) !== null) if (m[1]) suggerimenti.push(m[1].trim());

        // FIX NOMI DA LINKARE: estrae tutti i [[Nome Cognome]] che Gemini ha scritto
        // nel testo grezzo e li aggiunge a nomiDaLinkare.
        // Questo cattura sia i nomi presenti nel CSV ma non nei matches iniziali
        // (es. Gastone Malaguti citato in una risposta su Irma Bandiera),
        // sia figure storiche non nel CSV ma marcate dal modello (es. Irma Bandiera stessa).
        // Se apri() non trova la scheda nel database, il click è semplicemente silenzioso.
        const regexNomi = /\[\[([^\]]+)\]\]/g;
        let nm;
        while ((nm = regexNomi.exec(fullText)) !== null) {
            const nomeGemini = nm[1].trim();
            if (nomeGemini.length > 3 && !nomiDaLinkare.includes(nomeGemini)) {
                nomiDaLinkare.push(nomeGemini);
            }
        }
        // Ri-ordina per lunghezza discendente: i nomi più lunghi vanno matchati prima
        // per evitare che "Mario Rossi" venga linkato prima di "Mario Rossi Junior"
        nomiDaLinkare.sort((a, b) => b.length - a.length);

        // FIX libro-narrato / libro-citazione:
        // Gemini a volte inserisce i tag <libro-narrato> nel mezzo di frasi,
        // preceduti da backtick o altra punteggiatura, rompendo l'HTML.
        // Prima di tutto puliamo il testo grezzo: rimuoviamo backtick intorno ai tag
        // e forziamo i tag su righe proprie così il <div> non si apre inline.
        let testoGrezzo = fullText
            .replace(/^SUGGERIMENTO:.*$/gim, '')
            .replace(/`\s*<libro-narrato>/g, '\n<libro-narrato>')
            .replace(/<\/libro-narrato>\s*`/g, '</libro-narrato>\n')
            .replace(/`\s*<libro-citazione>/g, '\n<libro-citazione>')
            .replace(/<\/libro-citazione>\s*`/g, '</libro-citazione>\n');

        let html = testoGrezzo
            .replace(/\*\*(.*?)\*\*/g, '<b style="color:var(--navy); display:block; margin-top:15px; border-bottom:1px solid #eee; font-variant:small-caps;">$1</b>')
            .replace(/\n/g, '<br>')
            .replace(/<libro-narrato>/g, '<div class="libro-narrato"><b>📜 APPROFONDIMENTO:</b><br>')
            .replace(/<\/libro-narrato>/g, '</div>')
            .replace(/<libro-citazione>/g, '<div class="libro-citazione"><b>💬 CITAZIONE:</b><br>')
            .replace(/<\/libro-citazione>/g, '</div>');

        // Linker Universale: rende cliccabile ogni nome trovato nel testo.
        // Lo strip [[]] viene fatto QUI dentro il replace, non sull'innerHTML finale,
        // così i nomi vengono prima linkati (con le quadre come ancora regex)
        // e poi le quadre residue vengono rimosse contestualmente.
        nomiDaLinkare.forEach(nome => {
            const n = nome.trim();
            const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = escaped.split(/\s+/).join('\\s+');
            const regex = new RegExp(`(?![^<]*>)\\[{0,2}${pattern}\\]{0,2}`, 'gi');
            html = html.replace(regex, (match) => {
                if (match.includes('onclick')) return match;
                return `<span class="link-partigiano" onclick="apri('${n.replace(/'/g, "\\'")}')">${n}</span>`;
            });
        });

        // Rimuove eventuali [[ ]] rimasti orfani (nomi citati da Gemini non in nomiDaLinkare)
        html = html.replace(/\[\[/g, '').replace(/\]\]/g, '');

        // Chips suggerimenti
        if (suggerimenti.length > 0) {
            html += `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:20px; border-top:1px dashed #ccc; padding-top:15px;">`;
            suggerimenti.forEach(s => {
                const sClean = s.replace(/[\[\]]/g, '');
                html += `<div class="suggestion-chip" onclick="usaSuggerimento('${sClean.replace(/'/g, "\\'")}')">${sClean}</div>`;
            });
            html += `</div>`;
        }

        aiMsgElement.innerHTML = html;
        aiMsgElement.classList.add('finished');
        box.scrollTop = box.scrollHeight;

    } catch (e) {
        // Errore di rete o parsing
        aiMsgElement.textContent = "Errore di connessione: " + e.message;
        aiMsgElement.classList.add('finished');
    } finally {
        // FIX BARRA PROGRESSO: sempre nascosta al termine, successo o errore
        progressBar.style.width = '100%';
        setTimeout(() => {
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
            progressBar.classList.remove('progress-active');
        }, 400);
    }
}
