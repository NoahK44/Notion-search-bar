// server.js
require('dotenv').config();
const express = require('express');
const { Client } = require('@notionhq/client');
const path = require('path');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
// Stellt das Frontend aus dem 'public' Ordner bereit
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.NOTION_TOKEN) {
  console.warn('ACHTUNG: Dein NOTION_TOKEN fehlt!');
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Hilfsfunktion: Extrahiert den Titel aus dem Notion-Seiten-Objekt
function getPageTitle(page) {
  if (page.properties) {
    for (const key in page.properties) {
      const prop = page.properties[key];
      if (prop.type === 'title' && prop.title && prop.title[0]) {
        return prop.title[0].plain_text;
      }
    }
  }
  return '(Unbenannte Seite)';
}

// Funktion: Ruft die ersten Blöcke einer Seite ab und erstellt ein Snippet
async function getSnippet(blockId) {
    let snippet = '';
    
    // Die ersten 3 Inhaltsblöcke abrufen (Kind-Elemente der Seite)
    const blockList = await notion.blocks.children.list({
        block_id: blockId,
        page_size: 3, 
    });

    for (const block of blockList.results) {
        // Wir prüfen nur die gängigsten Text-Typen
        let blockText = null;

        if (block.type === 'paragraph' && block.paragraph.rich_text[0]) {
            blockText = block.paragraph.rich_text[0].plain_text;
        } else if (block.type === 'heading_2' && block.heading_2.rich_text[0]) {
            blockText = block.heading_2.rich_text[0].plain_text;
        } else if (block.type === 'callout' && block.callout.rich_text[0]) {
            blockText = block.callout.rich_text[0].plain_text;
        }
        
        if (blockText) {
            // Text zum Snippet hinzufügen, max. 150 Zeichen insgesamt
            snippet += blockText + ' ';
            if (snippet.length > 150) {
                snippet = snippet.substring(0, 150) + '...';
                break;
            }
        }
    }
    return snippet.trim();
}

// Haupt-Such-Route
app.get('/search', async (req, res) => {
    const query = req.query.q || '';

    if (!query) {
        return res.json({ ok: true, items: [] });
    }

    try {
        // 1. Primäre Notion-Suche (Volltext)
        const response = await notion.search({
            query: query,
            page_size: 10 
        });

        const fetchSnippets = response.results
            .filter(page => page.object === 'page') 
            .map(async page => {
                const title = getPageTitle(page);
                const cleanId = page.id.replace(/-/g, '');
                
                // 2. Sekundärer Aufruf, um den Inhalt (Snippet) zu holen
                const snippet = await getSnippet(page.id); 

                return {
                    id: page.id,
                    title: title,
                    url: `https://www.notion.so/${cleanId}`,
                    snippet: snippet
                };
            });

        // Alle Snippets parallel abrufen
        const items = await Promise.all(fetchSnippets);

        res.json({ ok: true, items: items });

    } catch (error) {
        console.error('Fehler bei der Notion-Suche:', error.message);
        res.status(500).json({ ok: false, error: 'Fehler bei der API-Anfrage: ' + error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server läuft! Du kannst ihn jetzt auf http://localhost:${PORT} testen.`);
});